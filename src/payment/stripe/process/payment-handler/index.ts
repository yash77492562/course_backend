import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma/service/prisma.service';

@Injectable()
export class ProcessPaymentHandler {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Handle payment processing
   * Called when Stripe is processing the payment
   */
  async handlePaymentProcessing(paymentIntent: any) {
    const { id: paymentIntentId } = paymentIntent;

    try {
      const order = await this.prisma.order.findUnique({
        where: { paymentIntentId },
      });

      if (!order) {
        console.error(`Order not found for payment intent: ${paymentIntentId}`);
        return;
      }

      // Update order status to PROCESSING
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: 'PROCESSING',
          orderStatus: 'PROCESSING',
        },
      });

      // Update payment record
      await this.prisma.payment.updateMany({
        where: {
          orderId: order.id,
          paymentIntentId,
        },
        data: {
          status: 'PROCESSING',
          stripeMetadata: paymentIntent,
        },
      });

      console.log(`Payment processing for order: ${order.id}`);
    } catch (error) {
      console.error('Error handling payment processing:', error);
    }
  }

  /**
   * Handle payment requires action (3D Secure, etc.)
   * Called when additional customer action is required
   */
  async handlePaymentRequiresAction(paymentIntent: any) {
    const { id: paymentIntentId } = paymentIntent;

    try {
      const order = await this.prisma.order.findUnique({
        where: { paymentIntentId },
      });

      if (!order) {
        console.error(`Order not found for payment intent: ${paymentIntentId}`);
        return;
      }

      // Update order status to REQUIRES_ACTION
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: 'REQUIRES_ACTION',
        },
      });

      // Update payment record
      await this.prisma.payment.updateMany({
        where: {
          orderId: order.id,
          paymentIntentId,
        },
        data: {
          status: 'REQUIRES_ACTION',
          stripeMetadata: paymentIntent,
        },
      });

      console.log(`Payment requires action for order: ${order.id}`);
    } catch (error) {
      console.error('Error handling payment requires action:', error);
    }
  }
}
