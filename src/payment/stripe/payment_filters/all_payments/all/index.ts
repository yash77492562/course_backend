import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../database/prisma/service/prisma.service';

/**
 * Get ALL transactions for ALL users
 * Admin use only - shows complete transaction history
 */
@Injectable()
export class AllPaymentsHandler {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all transactions (all users, all statuses)
   */
  async getAllTransactions(page: number = 1, limit: number = 50) {
    try {
      const skip = (page - 1) * limit;

      // First, get all payments without includes to avoid errors
      const allPayments = await this.prisma.payment.findMany({
        skip,
        take: limit * 2, // Fetch more to account for filtering
        orderBy: {
          createdAt: 'desc',
        },
      });

      const total = await this.prisma.payment.count();

      // Manually fetch related data for each payment
      const transactions = [];
      for (const payment of allPayments) {
        try {
          const order = await this.prisma.order.findUnique({
            where: { id: payment.orderId },
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                },
              },
              course: {
                select: {
                  id: true,
                  title: true,
                  thumbnail: true,
                },
              },
            },
          });

          if (order && order.user && order.course) {
            transactions.push({
              paymentId: payment.id,
              orderId: payment.orderId,
              paymentIntentId: payment.paymentIntentId,
              chargeId: payment.chargeId,
              amount: payment.amount,
              currency: payment.currency,
              status: payment.status,
              invoiceUrl: payment.invoiceUrl,
              errorMessage: payment.errorMessage,
              errorCode: payment.errorCode,
              createdAt: payment.createdAt,
              updatedAt: payment.updatedAt,
              user: {
                id: order.user.id,
                email: order.user.email,
                name: `${order.user.firstName} ${order.user.lastName}`,
              },
              course: {
                id: order.course.id,
                title: order.course.title,
                thumbnail: order.course.thumbnail,
              },
            });
          }

          if (transactions.length >= limit) break;
        } catch (err) {
          // Skip payments with missing data
          continue;
        }
      }

      return {
        transactions,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error('Error fetching transactions:', error);
      return {
        transactions: [],
        pagination: {
          total: 0,
          page,
          limit,
          totalPages: 0,
        },
      };
    }
  }
}
