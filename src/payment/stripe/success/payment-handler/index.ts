import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma/service/prisma.service';
import { RedisService } from '../../../../redis/redis.service';
import { CacheInvalidationService } from '../../../../cache/cache-invalidation.service';

@Injectable()
export class SuccessPaymentHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly cacheInvalidation: CacheInvalidationService,
  ) {}

  /**
   * Handle successful charge (has receipt_url)
   */
  async handleChargeSuccess(charge: any) {
    const { id: chargeId, payment_intent: paymentIntentId, receipt_url: invoiceUrl } = charge;

    console.log('💰 === CHARGE SUCCESS HANDLER START ===');
    console.log('📝 Charge ID:', chargeId);
    console.log('📝 Payment Intent ID:', paymentIntentId);
    console.log('📝 Invoice URL:', invoiceUrl);
    console.log('📦 FULL CHARGE OBJECT:', JSON.stringify(charge, null, 2));

    try {
      if (!paymentIntentId) {
        console.error('❌ No payment intent ID in charge');
        return;
      }

      if (!invoiceUrl) {
        console.warn('⚠️ No invoice URL in charge - Stripe may not have generated it yet');
        return;
      }

      // Find order by payment intent ID
      console.log('🔍 Looking for order with payment intent:', paymentIntentId);
      const order = await this.prisma.order.findUnique({
        where: { paymentIntentId },
      });

      if (!order) {
        console.warn(`⚠️ Order not found for payment intent: ${paymentIntentId}`);
        console.log('🔍 Trying to find order by session ID (checkout session)...');
        
        // Try finding by session ID (in case payment intent is the session ID)
        const orderBySession = await this.prisma.order.findFirst({
          where: {
            paymentIntentId: {
              contains: paymentIntentId,
            },
          },
        });

        if (!orderBySession) {
          console.error('❌ Order not found by payment intent or session ID');
          return;
        }

        console.log('✅ Order found by session search:', orderBySession.id);
        
        // Update with correct payment intent ID
        await this.prisma.order.update({
          where: { id: orderBySession.id },
          data: { paymentIntentId },
        });

        // Use this order
        const updatedOrder = orderBySession;
        updatedOrder.paymentIntentId = paymentIntentId;
        
        // Find and update payment
        const payment = await this.prisma.payment.findFirst({
          where: { orderId: updatedOrder.id },
        });

        if (payment) {
          console.log('📝 Found payment record:', payment.id);
          console.log('💾 Updating payment with invoice URL and charge ID...');
          
          await this.prisma.payment.update({
            where: { id: payment.id },
            data: {
              chargeId,
              invoiceUrl,
              invoicePdf: invoiceUrl,
              paymentIntentId,
            },
          });
          
          console.log('✅ Payment updated with invoice URL!');
          console.log('🎉 Invoice URL saved:', invoiceUrl);
        } else {
          console.warn('⚠️ No payment record found to update');
        }

        console.log('💰 === CHARGE SUCCESS HANDLER COMPLETE ===');
        return;
      }

      console.log('✅ Order found:', order.id);

      // Find payment record
      console.log('🔍 Looking for payment record...');
      const payment = await this.prisma.payment.findFirst({
        where: { orderId: order.id },
      });

      if (payment) {
        console.log('📝 Found payment record:', payment.id);
        console.log('💾 Updating payment with invoice URL and charge ID...');
        
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            chargeId,
            invoiceUrl,
            invoicePdf: invoiceUrl,
            paymentIntentId,
          },
        });
        
        console.log('✅ Payment updated with invoice URL!');
        console.log('🎉 Invoice URL saved:', invoiceUrl);
      } else {
        console.warn('⚠️ No payment record found to update');
      }

      console.log('💰 === CHARGE SUCCESS HANDLER COMPLETE ===');
    } catch (error) {
      console.error('❌ === CHARGE SUCCESS HANDLER ERROR ===');
      console.error('❌ Error:', error);
      console.error('❌ Stack:', error.stack);
    }
  }

  /**
   * Handle successful checkout session
   */
  async handleCheckoutSuccess(session: any) {
    const { id: sessionId, metadata, payment_intent } = session;

    console.log('🎉 === CHECKOUT SUCCESS HANDLER START ===');
    console.log('📝 Session ID:', sessionId);
    console.log('📝 Metadata:', JSON.stringify(metadata, null, 2));
    console.log('📝 Payment Intent:', payment_intent);

    try {
      const orderId = metadata?.orderId;

      if (!orderId) {
        console.error('❌ No orderId in session metadata');
        return;
      }

      console.log('🔍 Looking for order:', orderId);

      // Find order
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          user: true,
          course: true,
        },
      });

      if (!order) {
        console.error(`❌ Order not found: ${orderId}`);
        return;
      }

      console.log('✅ Order found:', order.id);
      console.log('📝 Order status before:', order.paymentStatus);

      // Get payment intent ID from session
      const paymentIntentId = typeof payment_intent === 'string' 
        ? payment_intent 
        : payment_intent?.id;

      console.log('📝 Extracted Payment Intent ID:', paymentIntentId);

      // Update order status
      console.log('💾 Updating order status to SUCCEEDED...');
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: 'SUCCEEDED',
          orderStatus: 'COMPLETED',
          paidAt: new Date(),
          paymentIntentId: paymentIntentId || sessionId,
        },
      });
      console.log('✅ Order updated successfully');

      // Create or update payment record
      console.log('🔍 Looking for existing payment record...');
      const existingPayment = await this.prisma.payment.findFirst({
        where: {
          OR: [
            { paymentIntentId: sessionId },
            { paymentIntentId: paymentIntentId },
          ],
        },
      });

      if (existingPayment) {
        console.log('📝 Found existing payment:', existingPayment.id);
        console.log('💾 Updating existing payment...');
        await this.prisma.payment.update({
          where: { id: existingPayment.id },
          data: {
            status: 'SUCCEEDED',
            paymentIntentId: paymentIntentId || sessionId,
          },
        });
        console.log('✅ Payment updated');
      } else {
        console.log('📝 No existing payment found, creating new one...');
        const newPayment = await this.prisma.payment.create({
          data: {
            orderId: order.id,
            paymentIntentId: paymentIntentId || sessionId,
            amount: order.amount,
            currency: order.currency,
            status: 'SUCCEEDED',
          },
        });
        console.log('✅ Payment created:', newPayment.id);
      }

      // Add to user's purchase history
      console.log('💾 Adding to user purchase history...');
      const purchaseHistoryEntry = {
        courseId: order.courseId,
        orderId: order.id,
        courseName: order.course.title,
        courseThumb: order.course.thumbnail,
        amount: order.amount,
        currency: order.currency,
        purchasedAt: new Date().toISOString(),
        paymentStatus: 'SUCCEEDED',
        paymentIntentId: paymentIntentId || sessionId,
      };

      await this.prisma.user.update({
        where: { id: order.userId },
        data: {
          purchaseHistory: {
            push: purchaseHistoryEntry,
          },
        },
      });
      console.log('✅ Purchase history updated');

      // Create course enrollment
      console.log('🔍 Checking for existing enrollment...');
      const enrollmentExists = await this.prisma.userCourseEnrollment.findUnique({
        where: {
          userId_courseId: {
            userId: order.userId,
            courseId: order.courseId,
          },
        },
      });

      if (!enrollmentExists) {
        console.log('📝 Creating new enrollment...');
        const expiresAt = new Date();
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);

        await this.prisma.userCourseEnrollment.create({
          data: {
            userId: order.userId,
            courseId: order.courseId,
            enrolledAt: new Date(),
            expiresAt,
            progress: 0,
            completedLessons: [],
            status: 'ACTIVE',
          },
        });

        await this.prisma.course.update({
          where: { id: order.courseId },
          data: {
            studentsCount: {
              increment: 1,
            },
          },
        });
        console.log('✅ Enrollment created');
      } else {
        console.log('ℹ️ Enrollment already exists');
      }

      // Invalidate caches
      await this.cacheInvalidation.invalidateUser(order.userId);
      await this.cacheInvalidation.invalidateCourse(order.courseId);
      
      // Invalidate payment-specific caches
      await this.redisService.del(`order:${order.id}`);
      await this.redisService.del(`user:orders:${order.userId}`);
      await this.redisService.del(`user:purchases:${order.userId}`);
      await this.redisService.del(`payment:status:${paymentIntentId || sessionId}`);
      await this.redisService.del(`user:enrollments:${order.userId}`);
      
      console.log('✅ Caches invalidated');

      console.log('🎉 === CHECKOUT SUCCESS HANDLER COMPLETE ===');
      console.log(`✅ Checkout completed for order: ${order.id}`);
      console.log(`📝 Payment Intent ID stored: ${paymentIntentId || sessionId}`);
    } catch (error) {
      console.error('❌ === CHECKOUT SUCCESS HANDLER ERROR ===');
      console.error('❌ Error:', error);
      console.error('❌ Stack:', error.stack);
    }
  }

  /**
   * Handle successful payment intent (fallback)
   */
  async handlePaymentSuccess(paymentIntent: any) {
    const { id: paymentIntentId, metadata, charges } = paymentIntent;

    console.log('💳 === PAYMENT INTENT SUCCESS HANDLER START ===');
    console.log('📝 Payment Intent ID:', paymentIntentId);
    console.log('📝 Metadata:', JSON.stringify(metadata, null, 2));
    console.log('📝 Charges:', JSON.stringify(charges, null, 2));

    try {
      // Find order by payment intent ID
      console.log('🔍 Looking for order with payment intent:', paymentIntentId);
      const order = await this.prisma.order.findUnique({
        where: { paymentIntentId },
        include: {
          user: true,
          course: true,
        },
      });

      if (!order) {
        console.error(`❌ Order not found for payment intent: ${paymentIntentId}`);
        return;
      }

      console.log('✅ Order found:', order.id);

      // Get charge and invoice details from Stripe
      const charge = charges?.data?.[0];
      const invoiceUrl = charge?.receipt_url;
      const chargeId = charge?.id;

      console.log('📝 Charge ID:', chargeId);
      console.log('📝 Invoice URL:', invoiceUrl);

      if (!invoiceUrl) {
        console.warn('⚠️ No invoice URL found in charge data!');
        console.log('📦 Full charge object:', JSON.stringify(charge, null, 2));
      }

      // Step 1: Update order status to SUCCEEDED
      console.log('💾 Updating order status...');
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: 'SUCCEEDED',
          orderStatus: 'COMPLETED',
          paidAt: new Date(),
        },
      });
      console.log('✅ Order status updated');

      // Step 2: Update or create payment record with invoice details
      console.log('🔍 Looking for existing payment by order ID...');
      const existingPayment = await this.prisma.payment.findFirst({
        where: {
          orderId: order.id,
        },
      });

      if (existingPayment) {
        // Update existing payment record
        console.log('📝 Found existing payment:', existingPayment.id);
        console.log('💾 Updating with invoice URL...');
        await this.prisma.payment.update({
          where: { id: existingPayment.id },
          data: {
            status: 'SUCCEEDED',
            paymentIntentId,
            chargeId,
            invoiceUrl,
            invoicePdf: invoiceUrl,
            stripeMetadata: paymentIntent,
          },
        });
        console.log('✅ Updated existing payment record with invoice URL');
      } else {
        // Create new payment record
        console.log('📝 No existing payment found, creating new one...');
        const newPayment = await this.prisma.payment.create({
          data: {
            orderId: order.id,
            paymentIntentId,
            chargeId,
            amount: order.amount,
            currency: order.currency,
            status: 'SUCCEEDED',
            invoiceUrl,
            invoicePdf: invoiceUrl,
            stripeMetadata: paymentIntent,
          },
        });
        console.log('✅ Created new payment record with invoice URL:', newPayment.id);
      }

      // Step 3: Add to user's purchase history array
      console.log('💾 Updating user purchase history...');
      const purchaseHistoryEntry = {
        courseId: order.courseId,
        orderId: order.id,
        courseName: order.course.title,
        courseThumb: order.course.thumbnail,
        amount: order.amount,
        currency: order.currency,
        purchasedAt: new Date().toISOString(),
        paymentStatus: 'SUCCEEDED',
        paymentIntentId,
        invoiceUrl,
      };

      await this.prisma.user.update({
        where: { id: order.userId },
        data: {
          purchaseHistory: {
            push: purchaseHistoryEntry,
          },
        },
      });
      console.log('✅ Purchase history updated');

      // Step 4: Create course enrollment (if not exists)
      console.log('🔍 Checking for existing enrollment...');
      const enrollmentExists = await this.prisma.userCourseEnrollment.findUnique({
        where: {
          userId_courseId: {
            userId: order.userId,
            courseId: order.courseId,
          },
        },
      });

      if (!enrollmentExists) {
        console.log('📝 Creating enrollment...');
        const expiresAt = new Date();
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);

        await this.prisma.userCourseEnrollment.create({
          data: {
            userId: order.userId,
            courseId: order.courseId,
            enrolledAt: new Date(),
            expiresAt,
            progress: 0,
            completedLessons: [],
            status: 'ACTIVE',
          },
        });

        await this.prisma.course.update({
          where: { id: order.courseId },
          data: {
            studentsCount: {
              increment: 1,
            },
          },
        });
        console.log('✅ Enrollment created');
      } else {
        console.log('ℹ️ Enrollment already exists');
      }

      // Invalidate caches
      await this.cacheInvalidation.invalidateUser(order.userId);
      await this.cacheInvalidation.invalidateCourse(order.courseId);
      
      // Invalidate payment-specific caches
      await this.redisService.del(`order:${order.id}`);
      await this.redisService.del(`user:orders:${order.userId}`);
      await this.redisService.del(`user:purchases:${order.userId}`);
      await this.redisService.del(`payment:status:${paymentIntentId}`);
      await this.redisService.del(`user:enrollments:${order.userId}`);
      
      console.log('✅ Caches invalidated');

      console.log('💳 === PAYMENT INTENT SUCCESS HANDLER COMPLETE ===');
      console.log(`✅ Payment succeeded for order: ${order.id}`);
      console.log(`✅ User ${order.user.email} enrolled in course: ${order.course.title}`);
      console.log(`✅ Invoice URL: ${invoiceUrl || 'NOT FOUND'}`);
    } catch (error) {
      console.error('❌ === PAYMENT INTENT SUCCESS HANDLER ERROR ===');
      console.error('❌ Error handling payment success:', error);
      console.error('❌ Stack:', error.stack);
      throw error;
    }
  }
}
