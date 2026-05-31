import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../../database/prisma/service/prisma.service';

/**
 * Get PROCESSING transactions for a SPECIFIC user
 */
@Injectable()
export class UserProcessingPaymentsHandler {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get processing transactions for a specific user
   */
  async getUserProcessingTransactions(userId: string, page: number = 1, limit: number = 50) {
    // Verify user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          order: {
            userId,
          },
          status: {
            in: ['PROCESSING', 'PENDING', 'REQUIRES_ACTION'],
          },
        },
        skip,
        take: limit,
        include: {
          order: {
            include: {
              course: {
                select: {
                  id: true,
                  title: true,
                  thumbnail: true,
                  instructor: true,
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
          order: {
            userId,
          },
          status: {
            in: ['PROCESSING', 'PENDING', 'REQUIRES_ACTION'],
          },
        },
      }),
    ]);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
      },
      transactions: transactions.map(payment => ({
        paymentId: payment.id,
        orderId: payment.orderId,
        paymentIntentId: payment.paymentIntentId,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        createdAt: payment.createdAt,
        course: {
          id: payment.order.course.id,
          title: payment.order.course.title,
          thumbnail: payment.order.course.thumbnail,
          instructor: payment.order.course.instructor,
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
