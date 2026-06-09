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
      apiVersion: '2026-02-25.clover' as any, // Match webhook API version from Dashboard
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

      // Check if user already purchased this course
      const existingOrder = await this.prisma.order.findFirst({
        where: {
          userId,
          courseId: createOrderDto.courseId,
          paymentStatus: 'SUCCEEDED',
        },
      });

      if (existingOrder) {
        throw new BadRequestException('You have already purchased this course');
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
   * @param rawBody - Untouched Buffer from express.raw() middleware
   * @param signature - Stripe signature header for HMAC verification
   */
  async handleStripeWebhook(rawBody: Buffer, signature: string) {
    const startTime = Date.now();
    
    try {
      let webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      if (!webhookSecret) {
        console.error('❌ STRIPE_WEBHOOK_SECRET is not defined in environment');
        throw new BadRequestException('Webhook configuration error - contact support');
      }

      // Remove quotes if they exist (fix for .env parsing issue)
      webhookSecret = webhookSecret.replace(/^["']|["']$/g, '').trim();

      console.log('🔔 Webhook received - verifying signature...');
      console.log('  - Raw body is Buffer:', Buffer.isBuffer(rawBody));
      console.log('  - Raw body length:', rawBody.length);
      console.log('  - Signature present:', !!signature);
      console.log('  - Webhook secret configured:', !!webhookSecret);

      // Verify the event is recent (within 5 minutes)
      // This prevents replay attacks and "timestamp outside tolerance zone" errors
      let event: Stripe.Event;
      
      try {
        // Pass Buffer directly to Stripe - NEVER call .toString()
        event = this.stripe.webhooks.constructEvent(
          rawBody,
          signature,
          webhookSecret,
          300, // 5 minute tolerance (default is 300 seconds)
        );
      } catch (signatureError) {
        // Provide detailed error information for debugging
        console.error('❌ Signature verification failed:', signatureError.message);
        
        if (signatureError.message.includes('timestamp')) {
          console.error('⏰ Timestamp issue - possible causes:');
          console.error('  1. Server clock is incorrect (check with: date)');
          console.error('  2. Event is too old (Stripe sent it more than 5 minutes ago)');
          console.error('  3. Event was delayed in processing');
          throw new BadRequestException('Webhook timestamp outside tolerance zone - event too old or server clock incorrect');
        }
        
        if (signatureError.message.includes('signature')) {
          console.error('🔑 Signature mismatch - possible causes:');
          console.error('  1. Wrong webhook secret (check STRIPE_WEBHOOK_SECRET in .env)');
          console.error('  2. Body was modified before verification');
          console.error('  3. Using test/live secret mismatch');
          throw new BadRequestException('Webhook signature verification failed - invalid signature');
        }
        
        // Generic signature verification failure
        throw new BadRequestException(`Webhook verification failed: ${signatureError.message}`);
      }

      console.log(`✅ Webhook verified: ${event.type}`);
      console.log(`📦 Event ID: ${event.id}`);
      console.log(`📅 Event created: ${new Date(event.created * 1000).toISOString()}`);
      console.log(`🔢 API version: ${event.api_version || 'default'}`);

      // Handle different event types
      try {
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

        const processingTime = Date.now() - startTime;
        console.log(`✅ Webhook ${event.type} processed successfully in ${processingTime}ms`);
        
        return { 
          received: true,
          eventId: event.id,
          eventType: event.type,
          processingTime,
        };
        
      } catch (handlerError) {
        // Event was verified but handler failed - this is a 500 error not 400
        console.error('❌ Event handler error:', handlerError);
        console.error('❌ Handler error stack:', handlerError.stack);
        console.error('📦 Event that failed:', JSON.stringify(event, null, 2));
        
        // Return 500 for handler errors (Stripe will retry)
        throw new InternalServerErrorException(
          `Event ${event.type} processing failed: ${handlerError.message}`
        );
      }
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`❌ Webhook failed after ${processingTime}ms`);
      console.error('❌ Error:', error.message);
      console.error('❌ Stack:', error.stack);
      
      // Re-throw the error (it's already a NestJS exception with proper status code)
      throw error;
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
   * Get order status for frontend polling (Step 5)
   * Returns simple status: 'pending' | 'paid' | 'failed'
   */
  async getOrderStatus(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        paymentStatus: true,
        orderStatus: true,
        paidAt: true,
        failedAt: true,
        amount: true,
        currency: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Map internal status to simple frontend status
    let status: 'pending' | 'paid' | 'failed';
    
    if (order.paymentStatus === 'SUCCEEDED') {
      status = 'paid';
    } else if (order.paymentStatus === 'FAILED' || order.paymentStatus === 'CANCELED') {
      status = 'failed';
    } else {
      status = 'pending';
    }

    return {
      orderId: order.id,
      status, // 'pending' | 'paid' | 'failed'
      paidAt: order.paidAt,
      failedAt: order.failedAt,
      amount: order.amount,
      currency: order.currency,
    };
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
