import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma/service/prisma.service';

@Injectable()
export class CancelPaymentHandler {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Handle failed payment
   * Called when payment fails (card declined, insufficient funds, etc.)
   */
  async handlePaymentFailed(paymentIntent: any) {
    const { id: paymentIntentId, last_payment_error } = paymentIntent;

    try {
      const order = await this.prisma.order.findUnique({
        where: { paymentIntentId },
      });

      if (!order) {
        console.error(`Order not found for payment intent: ${paymentIntentId}`);
        return;
      }

      // Update order status to FAILED
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: 'FAILED',
          orderStatus: 'FAILED',
          failedAt: new Date(),
        },
      });

      // Update payment record with error details
      await this.prisma.payment.updateMany({
        where: {
          orderId: order.id,
          paymentIntentId,
        },
        data: {
          status: 'FAILED',
          errorMessage: last_payment_error?.message || 'Payment failed',
          errorCode: last_payment_error?.code,
          stripeMetadata: paymentIntent,
        },
      });

      console.log(`❌ Payment failed for order: ${order.id}`);
      console.log(`❌ Error: ${last_payment_error?.message}`);
    } catch (error) {
      console.error('Error handling payment failure:', error);
    }
  }

  /**
   * Handle canceled payment
   * Called when user cancels the payment or payment is canceled by system
   */
  async handlePaymentCanceled(paymentIntent: any) {
    const { id: paymentIntentId, cancellation_reason } = paymentIntent;

    try {
      const order = await this.prisma.order.findUnique({
        where: { paymentIntentId },
      });

      if (!order) {
        console.error(`Order not found for payment intent: ${paymentIntentId}`);
        return;
      }

      // Update order status to CANCELED
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: 'CANCELED',
          orderStatus: 'CANCELED',
        },
      });

      // Update payment record
      await this.prisma.payment.updateMany({
        where: {
          orderId: order.id,
          paymentIntentId,
        },
        data: {
          status: 'CANCELED',
          errorMessage: cancellation_reason || 'Payment canceled',
          stripeMetadata: paymentIntent,
        },
      });

      console.log(`⚠️ Payment canceled for order: ${order.id}`);
      console.log(`⚠️ Reason: ${cancellation_reason || 'User canceled'}`);
    } catch (error) {
      console.error('Error handling payment cancellation:', error);
    }
  }

  /**
   * Handle expired checkout session
   */
  async handleCheckoutExpired(session: any) {
    const { id: sessionId, metadata } = session;

    try {
      const orderId = metadata?.orderId;

      if (!orderId) {
        console.error('No orderId in session metadata');
        return;
      }

      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: 'FAILED',
          orderStatus: 'CANCELED',
        },
      });

      console.log(`❌ Checkout expired for order: ${orderId}`);
    } catch (error) {
      console.error('Error handling checkout expiration:', error);
    }
  }
}
