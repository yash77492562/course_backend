import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../database/prisma/service/prisma.service';

/**
 * Get all PROCESSING transactions for ALL users
 */
@Injectable()
export class AllProcessingPaymentsHandler {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all processing transactions
   */
  async getAllProcessingTransactions(page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          status: {
            in: ['PROCESSING', 'PENDING', 'REQUIRES_ACTION'],
          },
        },
        skip,
        take: limit,
        include: {
          order: {
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
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.payment.count({
        where: {
          status: {
            in: ['PROCESSING', 'PENDING', 'REQUIRES_ACTION'],
          },
        },
      }),
    ]);

    return {
      transactions: transactions.map(payment => ({
        paymentId: payment.id,
        orderId: payment.orderId,
        paymentIntentId: payment.paymentIntentId,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        createdAt: payment.createdAt,
        user: {
          id: payment.order.user.id,
          email: payment.order.user.email,
          name: `${payment.order.user.firstName} ${payment.order.user.lastName}`,
        },
        course: {
          id: payment.order.course.id,
          title: payment.order.course.title,
          thumbnail: payment.order.course.thumbnail,
        },
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
