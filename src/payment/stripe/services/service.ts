import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/service/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import Stripe from 'stripe';
import { CreateOrderDto } from '../dto/create-order';
import { ProcessPaymentHandler } from '../process/payment-handler';
import { SuccessPaymentHandler } from '../success/payment-handler';
import { CancelPaymentHandler } from '../cancel/payment-handler';

@Injectable()
export class StripeService {
  private stripe: Stripe;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly processHandler: ProcessPaymentHandler,
    private readonly successHandler: SuccessPaymentHandler,
    private readonly cancelHandler: CancelPaymentHandler,
  ) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is not defined in environment variables');
    }

    this.stripe = new Stripe(secretKey, {
      apiVersion: '2026-03-25.dahlia',
    });
  }

  /**
   * Create order and Stripe Checkout Session
   * Redirects user to Stripe's hosted payment page
   */
  async createOrder(userId: string, createOrderDto: CreateOrderDto) {
    try {
      // Verify user exists
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Fetch course with CURRENT price from database
      const course = await this.prisma.course.findUnique({
        where: { id: createOrderDto.courseId },
      });

      if (!course) {
        throw new NotFoundException('Course not found');
      }

      // Check if user already purchased this course OR has a pending order
      const existingOrder = await this.prisma.order.findFirst({
        where: {
          userId,
          courseId: createOrderDto.courseId,
          OR: [
            { paymentStatus: 'SUCCEEDED' },
            { paymentStatus: 'PENDING' },
          ],
        },
      });

      if (existingOrder) {
        if (existingOrder.paymentStatus === 'SUCCEEDED') {
          throw new BadRequestException('You have already purchased this course');
        }
        
        // If there's a pending order, delete associated payments first, then order
        if (existingOrder.paymentStatus === 'PENDING') {
          try {
            // Delete payments first (foreign key constraint)
            const deletedPayments = await this.prisma.payment.deleteMany({
              where: { orderId: existingOrder.id },
            });
            
            // Then delete the order (use deleteMany to avoid error if already deleted)
            const deletedOrders = await this.prisma.order.deleteMany({
              where: { id: existingOrder.id },
            });
            
            if (deletedOrders.count > 0) {
              console.log(`🗑️ Deleted pending order ${existingOrder.id} and ${deletedPayments.count} payments`);
            }
          } catch (error) {
            // Order might have been deleted by another request, continue
            console.log(`⚠️ Could not delete pending order (might be already deleted): ${error.message}`);
          }
        }
      }

      // Use CURRENT price from database (dynamic!)
      const currentPrice = course.price;
      const currency = createOrderDto.currency || 'usd';

      // Create Stripe Checkout Session FIRST (before creating order)
      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency,
              product_data: {
                name: course.title,
                description: `Taught by ${course.instructor}`,
                images: course.thumbnail ? [course.thumbnail] : [],
              },
              unit_amount: Math.round(currentPrice * 100), // Convert to cents
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${process.env.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`,
        customer_email: user.email,
        metadata: {
          userId,
          courseId: createOrderDto.courseId,
          courseName: course.title,
          coursePrice: currentPrice.toString(),
        },
      });

      // Now create order in database with session ID
      const order = await this.prisma.order.create({
        data: {
          userId,
          courseId: createOrderDto.courseId,
          amount: currentPrice,
          currency,
          paymentStatus: 'PENDING',
          orderStatus: 'PENDING',
          paymentIntentId: session.id, // Set session ID immediately
          metadata: {
            courseName: course.title,
            courseInstructor: course.instructor,
            userEmail: user.email,
            priceAtPurchase: currentPrice,
          },
        },
        include: {
          course: {
            select: {
              title: true,
              thumbnail: true,
              instructor: true,
              price: true,
            },
          },
          user: {
            select: {
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      // Update session metadata with orderId
      await this.stripe.checkout.sessions.update(session.id, {
        metadata: {
          orderId: order.id,
          userId,
          courseId: createOrderDto.courseId,
          courseName: course.title,
          coursePrice: currentPrice.toString(),
        },
      });

      return {
        success: true,
        orderId: order.id,
        sessionId: session.id,
        checkoutUrl: session.url, // Stripe Checkout URL
        order: {
          id: order.id,
          amount: currentPrice,
          currency,
          course: {
            title: order.course.title,
            thumbnail: order.course.thumbnail,
            instructor: order.course.instructor,
            price: order.course.price,
          },
        },
      };
    } catch (error) {
      console.error('Error creating order:', error);
      throw new InternalServerErrorException(
        error.message || 'Failed to create order',
      );
    }
  }

  /**
   * Handle Stripe webhook events
   */
  async handleStripeWebhook(rawBody: Buffer, signature: string) {
    try {
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      if (!webhookSecret) {
        throw new Error('STRIPE_WEBHOOK_SECRET is not defined');
      }

      console.log('🔔 Webhook received - verifying signature...');

      const event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret,
      );

      console.log(`✅ Webhook verified: ${event.type}`);
      console.log(`📦 Event ID: ${event.id}`);
      console.log(`📦 Event data:`, JSON.stringify(event.data.object, null, 2));

      switch (event.type) {
        case 'checkout.session.completed':
          console.log('🎯 Processing checkout.session.completed...');
          await this.successHandler.handleCheckoutSuccess(event.data.object);
          break;

        case 'checkout.session.expired':
          console.log('⏰ Processing checkout.session.expired...');
          await this.cancelHandler.handleCheckoutExpired(event.data.object);
          break;

        case 'charge.succeeded':
          console.log('🎯 Processing charge.succeeded...');
          console.log('📦 Charge data:', JSON.stringify(event.data.object, null, 2));
          await this.successHandler.handleChargeSuccess(event.data.object);
          break;

        case 'charge.updated':
          console.log('🎯 Processing charge.updated...');
          console.log('📦 Charge data:', JSON.stringify(event.data.object, null, 2));
          await this.successHandler.handleChargeSuccess(event.data.object);
          break;

        case 'payment_intent.succeeded':
          console.log('🎯 Processing payment_intent.succeeded...');
          await this.successHandler.handlePaymentSuccess(event.data.object);
          break;

        case 'payment_intent.payment_failed':
          console.log('❌ Processing payment_intent.payment_failed...');
          await this.cancelHandler.handlePaymentFailed(event.data.object);
          break;

        case 'payment_intent.canceled':
          console.log('🚫 Processing payment_intent.canceled...');
          await this.cancelHandler.handlePaymentCanceled(event.data.object);
          break;

        case 'payment_intent.processing':
          console.log('⏳ Processing payment_intent.processing...');
          await this.processHandler.handlePaymentProcessing(event.data.object);
          break;

        case 'payment_intent.requires_action':
          console.log('⚠️ Processing payment_intent.requires_action...');
          await this.processHandler.handlePaymentRequiresAction(event.data.object);
          break;

        default:
          console.log(`ℹ️ Unhandled event type: ${event.type}`);
      }

      console.log(`✅ Webhook ${event.type} processed successfully`);
      return { received: true };
    } catch (error) {
      console.error('❌ Webhook error:', error);
      console.error('❌ Error stack:', error.stack);
      throw new BadRequestException('Webhook signature verification failed');
    }
  }

  /**
   * Get order details
   */
  async getOrder(orderId: string) {
    // Try cache first
    return this.redisService.getOrSet(
      `order:${orderId}`,
      async () => {
        const order = await this.prisma.order.findUnique({
          where: { id: orderId },
          include: {
            course: {
              select: {
                title: true,
                thumbnail: true,
                instructor: true,
              },
            },
            payments: {
              orderBy: {
                createdAt: 'desc',
              },
            },
          },
        });

        if (!order) {
          throw new NotFoundException('Order not found');
        }

        return order;
      },
      900 // 15 minutes cache
    );
  }

  /**
   * Get user's orders
   */
  async getUserOrders(userId: string) {
    // Try cache first
    return this.redisService.getOrSet(
      `user:orders:${userId}`,
      async () => {
        const orders = await this.prisma.order.findMany({
          where: { userId },
          include: {
            course: {
              select: {
                title: true,
                thumbnail: true,
                instructor: true,
              },
            },
            payments: {
              orderBy: {
                createdAt: 'desc',
              },
              take: 1,
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        });

        return orders;
      },
      600 // 10 minutes cache
    );
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(paymentIntentId: string) {
    // Try cache first
    return this.redisService.getOrSet(
      `payment:status:${paymentIntentId}`,
      async () => {
        const order = await this.prisma.order.findUnique({
          where: { paymentIntentId },
          include: {
            payments: {
              where: { paymentIntentId },
              orderBy: {
                createdAt: 'desc',
              },
              take: 1,
            },
          },
        });

        if (!order) {
          throw new NotFoundException('Payment not found');
        }

        return {
          orderId: order.id,
          paymentStatus: order.paymentStatus,
          orderStatus: order.orderStatus,
          payment: order.payments[0],
        };
      },
      300 // 5 minutes cache (shorter for payment status)
    );
  }

  /**
   * Get user's purchase history
   */
  async getUserPurchaseHistory(userId: string) {
    // Try cache first
    return this.redisService.getOrSet(
      `user:purchases:${userId}`,
      async () => {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: {
            purchaseHistory: true,
          },
        });

        if (!user) {
          throw new NotFoundException('User not found');
        }

        return user.purchaseHistory;
      },
      1800 // 30 minutes cache
    );
  }

  /**
   * Retrieve charge details (for invoice/receipt)
   */
  async retrieveCharge(chargeId: string): Promise<Stripe.Charge> {
    try {
      return await this.stripe.charges.retrieve(chargeId);
    } catch (error) {
      console.error('Error retrieving charge:', error);
      throw error;
    }
  }
}
