import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma/service/prisma.service';
import Stripe from 'stripe';

@Injectable()
export class InvoiceHandler {
  private stripe: Stripe;

  constructor(private readonly prisma: PrismaService) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is not defined in environment variables');
    }

    this.stripe = new Stripe(secretKey, {
      apiVersion: '2026-03-25.dahlia',
    });
  }

  /**
   * Get invoice/receipt URL for an order
   * Stripe automatically generates receipts for successful payments
   * 
   * Official Docs: https://docs.stripe.com/receipts
   */
  async getInvoiceUrl(orderId: string): Promise<string> {
    try {
      // Find order with payment details
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          payments: {
            where: { status: 'SUCCEEDED' },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      if (order.paymentStatus !== 'SUCCEEDED') {
        throw new NotFoundException('Payment not completed yet');
      }

      const payment = order.payments[0];
      
      // If we already have invoice URL stored, return it
      if (payment?.invoiceUrl) {
        return payment.invoiceUrl;
      }

      // Otherwise, fetch from Stripe
      if (payment?.chargeId) {
        const charge = await this.stripe.charges.retrieve(payment.chargeId);
        const invoiceUrl = charge.receipt_url;

        // Store it for future use
        if (invoiceUrl) {
          await this.prisma.payment.update({
            where: { id: payment.id },
            data: { invoiceUrl },
          });
        }

        return invoiceUrl;
      }

      throw new NotFoundException('Invoice not available');
    } catch (error) {
      console.error('Error getting invoice URL:', error);
      throw error;
    }
  }

  /**
   * Get invoice details for an order
   * Returns structured invoice data
   */
  async getInvoiceDetails(orderId: string) {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          user: {
            select: {
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          course: {
            select: {
              title: true,
              instructor: true,
            },
          },
          payments: {
            where: { status: 'SUCCEEDED' },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      if (order.paymentStatus !== 'SUCCEEDED') {
        throw new NotFoundException('Payment not completed yet');
      }

      const payment = order.payments[0];

      return {
        invoiceNumber: order.id,
        invoiceDate: order.paidAt,
        invoiceUrl: payment?.invoiceUrl,
        customer: {
          name: `${order.user.firstName} ${order.user.lastName}`,
          email: order.user.email,
        },
        items: [
          {
            description: order.course.title,
            instructor: order.course.instructor,
            amount: order.amount,
            currency: order.currency,
          },
        ],
        total: order.amount,
        currency: order.currency,
        paymentMethod: 'Card',
        paymentIntentId: order.paymentIntentId,
        chargeId: payment?.chargeId,
      };
    } catch (error) {
      console.error('Error getting invoice details:', error);
      throw error;
    }
  }

  /**
   * Get all invoices for a user
   */
  async getUserInvoices(userId: string) {
    try {
      const orders = await this.prisma.order.findMany({
        where: {
          userId,
          paymentStatus: 'SUCCEEDED',
        },
        include: {
          course: {
            select: {
              title: true,
              thumbnail: true,
            },
          },
          payments: {
            where: { status: 'SUCCEEDED' },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: {
          paidAt: 'desc',
        },
      });

      return orders.map(order => ({
        orderId: order.id,
        invoiceNumber: order.id,
        invoiceDate: order.paidAt,
        invoiceUrl: order.payments[0]?.invoiceUrl,
        courseName: order.course.title,
        courseThumb: order.course.thumbnail,
        amount: order.amount,
        currency: order.currency,
        paymentIntentId: order.paymentIntentId,
      }));
    } catch (error) {
      console.error('Error getting user invoices:', error);
      throw error;
    }
  }

  /**
   * Download invoice as PDF (if you want to generate custom invoices)
   * For now, we use Stripe's built-in receipts
   * 
   * To create custom invoices, you can use libraries like:
   * - pdfkit: https://pdfkit.org/
   * - puppeteer: https://pptr.dev/
   * - jsPDF: https://github.com/parallax/jsPDF
   */
  async downloadInvoicePdf(orderId: string): Promise<string> {
    // For now, return Stripe's receipt URL
    // You can implement custom PDF generation here if needed
    return this.getInvoiceUrl(orderId);
  }

  /**
   * Send invoice email to customer
   * Stripe automatically sends receipt emails if receipt_email is set
   * 
   * Official Docs: https://docs.stripe.com/receipts#email-receipts
   */
  async sendInvoiceEmail(orderId: string): Promise<boolean> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          user: true,
          payments: {
            where: { status: 'SUCCEEDED' },
            take: 1,
          },
        },
      });

      if (!order || !order.payments[0]?.chargeId) {
        throw new NotFoundException('Order or charge not found');
      }

      // Stripe automatically sends receipt emails
      // But you can also send custom emails using your email service
      // For example, using nodemailer, sendgrid, etc.

      console.log(`Invoice email would be sent to: ${order.user.email}`);
      console.log(`Invoice URL: ${order.payments[0].invoiceUrl}`);

      // TODO: Implement your email service here
      // await emailService.send({
      //   to: order.user.email,
      //   subject: 'Your Invoice',
      //   html: `<a href="${order.payments[0].invoiceUrl}">Download Invoice</a>`,
      // });

      return true;
    } catch (error) {
      console.error('Error sending invoice email:', error);
      return false;
    }
  }
}
