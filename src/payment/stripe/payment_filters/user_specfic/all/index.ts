import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../../database/prisma/service/prisma.service';

/**
 * Get ALL transactions for a SPECIFIC user
 */
@Injectable()
export class UserAllPaymentsHandler {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all transactions for a specific user (all statuses)
   */
  async getUserAllTransactions(userId: string, page: number = 1, limit: number = 50) {
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
        chargeId: payment.chargeId,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        invoiceUrl: payment.invoiceUrl,
        errorMessage: payment.errorMessage,
        errorCode: payment.errorCode,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
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
