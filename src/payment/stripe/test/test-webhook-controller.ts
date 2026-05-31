import { Controller, Post, Body, Param } from '@nestjs/common';
import { SuccessPaymentHandler } from '../success/payment-handler';
import { CancelPaymentHandler } from '../cancel/payment-handler';
import { ProcessPaymentHandler } from '../process/payment-handler';
import { PrismaService } from '../../../database/prisma/service/prisma.service';

/**
 * TEST ONLY CONTROLLER
 * This controller simulates Stripe webhook events for testing
 * DO NOT USE IN PRODUCTION - Remove before deployment
 */
@Controller('payment/stripe/test')
export class TestWebhookController {
  constructor(
    private readonly successHandler: SuccessPaymentHandler,
    private readonly cancelHandler: CancelPaymentHandler,
    private readonly processHandler: ProcessPaymentHandler,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Simulate payment success
   * POST /api/payment/stripe/test/success/:paymentIntentId
   */
  @Post('success/:paymentIntentId')
  async simulateSuccess(@Param('paymentIntentId') paymentIntentId: string) {
    try {
      // Get order to build mock payment intent
      const order = await this.prisma.order.findUnique({
        where: { paymentIntentId },
        include: { user: true, course: true },
      });

      if (!order) {
        return { error: 'Order not found' };
      }

      // Mock Stripe payment intent success event
      const mockPaymentIntent = {
        id: paymentIntentId,
        object: 'payment_intent',
        amount: order.amount * 100,
        currency: order.currency,
        status: 'succeeded',
        metadata: {
          orderId: order.id,
          userId: order.userId,
          courseId: order.courseId,
        },
        charges: {
          data: [
            {
              id: `ch_test_${Date.now()}`,
              receipt_url: `https://pay.stripe.com/receipts/test_${paymentIntentId}`,
            },
          ],
        },
      };

      await this.successHandler.handlePaymentSuccess(mockPaymentIntent);

      return {
        success: true,
        message: 'Payment success simulated',
        orderId: order.id,
        paymentIntentId,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Simulate payment failure
   * POST /api/payment/stripe/test/failed/:paymentIntentId
   */
  @Post('failed/:paymentIntentId')
  async simulateFailed(
    @Param('paymentIntentId') paymentIntentId: string,
    @Body() body: { reason?: string },
  ) {
    try {
      const order = await this.prisma.order.findUnique({
        where: { paymentIntentId },
      });

      if (!order) {
        return { error: 'Order not found' };
      }

      const mockPaymentIntent = {
        id: paymentIntentId,
        object: 'payment_intent',
        amount: order.amount * 100,
        currency: order.currency,
        status: 'failed',
        last_payment_error: {
          message: body.reason || 'Your card was declined',
          code: 'card_declined',
        },
        metadata: {
          orderId: order.id,
        },
      };

      await this.cancelHandler.handlePaymentFailed(mockPaymentIntent);

      return {
        success: true,
        message: 'Payment failure simulated',
        orderId: order.id,
        paymentIntentId,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Simulate payment canceled
   * POST /api/payment/stripe/test/canceled/:paymentIntentId
   */
  @Post('canceled/:paymentIntentId')
  async simulateCanceled(@Param('paymentIntentId') paymentIntentId: string) {
    try {
      const order = await this.prisma.order.findUnique({
        where: { paymentIntentId },
      });

      if (!order) {
        return { error: 'Order not found' };
      }

      const mockPaymentIntent = {
        id: paymentIntentId,
        object: 'payment_intent',
        amount: order.amount * 100,
        currency: order.currency,
        status: 'canceled',
        cancellation_reason: 'requested_by_customer',
        metadata: {
          orderId: order.id,
        },
      };

      await this.cancelHandler.handlePaymentCanceled(mockPaymentIntent);

      return {
        success: true,
        message: 'Payment cancellation simulated',
        orderId: order.id,
        paymentIntentId,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Simulate payment processing
   * POST /api/payment/stripe/test/processing/:paymentIntentId
   */
  @Post('processing/:paymentIntentId')
  async simulateProcessing(@Param('paymentIntentId') paymentIntentId: string) {
    try {
      const order = await this.prisma.order.findUnique({
        where: { paymentIntentId },
      });

      if (!order) {
        return { error: 'Order not found' };
      }

      const mockPaymentIntent = {
        id: paymentIntentId,
        object: 'payment_intent',
        amount: order.amount * 100,
        currency: order.currency,
        status: 'processing',
        metadata: {
          orderId: order.id,
        },
      };

      await this.processHandler.handlePaymentProcessing(mockPaymentIntent);

      return {
        success: true,
        message: 'Payment processing simulated',
        orderId: order.id,
        paymentIntentId,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
