import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/service/prisma.service';
import { RedisService } from '../../redis/redis.service';

/**
 * Service for checking course access and purchase status
 * Single source of truth for access control logic
 */
@Injectable()
export class CourseAccessService {
  private readonly logger = new Logger(CourseAccessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Check if user has access to a course
   * Returns detailed access information
   */
  async checkUserCourseAccess(userId: string, courseId: string) {
    try {
      // Check 1: Active enrollment (most reliable)
      const enrollment = await this.prisma.userCourseEnrollment.findUnique({
        where: {
          userId_courseId: {
            userId,
            courseId,
          },
        },
      });

      if (enrollment) {
        // Check if enrollment is active and not expired
        const now = new Date();
        const isExpired = enrollment.expiresAt && new Date(enrollment.expiresAt) < now;
        
        if (enrollment.status === 'ACTIVE' && !isExpired) {
          return {
            hasAccess: true,
            reason: 'active_enrollment',
            enrolledAt: enrollment.enrolledAt,
            expiresAt: enrollment.expiresAt,
            progress: enrollment.progress,
          };
        }

        if (isExpired) {
          return {
            hasAccess: false,
            reason: 'enrollment_expired',
            expiresAt: enrollment.expiresAt,
          };
        }

        if (enrollment.status !== 'ACTIVE') {
          return {
            hasAccess: false,
            reason: `enrollment_${enrollment.status.toLowerCase()}`,
          };
        }
      }

      // Check 2: Successful payment in purchase history
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { purchaseHistory: true },
      });

      if (user?.purchaseHistory) {
        const purchases = Array.isArray(user.purchaseHistory) 
          ? user.purchaseHistory 
          : [];
        
        const hasPurchased = purchases.some((p: any) => 
          p.courseId === courseId && p.paymentStatus === 'SUCCEEDED'
        );

        if (hasPurchased) {
          // User has purchased but no enrollment - this shouldn't happen
          // but we'll grant access and log it
          this.logger.warn(
            `User ${userId} has purchased course ${courseId} but no enrollment found`
          );
          return {
            hasAccess: true,
            reason: 'purchase_without_enrollment',
            warning: 'Enrollment record missing',
          };
        }
      }

      // Check 3: Completed order
      const completedOrder = await this.prisma.order.findFirst({
        where: {
          userId,
          courseId,
          paymentStatus: 'SUCCEEDED',
          orderStatus: 'COMPLETED',
        },
      });

      if (completedOrder) {
        // User has completed order but no enrollment - shouldn't happen
        this.logger.warn(
          `User ${userId} has completed order for course ${courseId} but no enrollment found`
        );
        return {
          hasAccess: true,
          reason: 'order_without_enrollment',
          warning: 'Enrollment record missing',
        };
      }

      // No access found
      return {
        hasAccess: false,
        reason: 'no_purchase',
      };
    } catch (error) {
      this.logger.error(
        `Error checking course access for user ${userId}, course ${courseId}:`,
        error
      );
      // On error, deny access for security
      return {
        hasAccess: false,
        reason: 'error',
        error: 'Failed to verify access',
      };
    }
  }

  /**
   * Get all courses the user has purchased
   * Returns array of course IDs
   */
  async getUserPurchasedCourses(userId: string) {
    try {
      const cacheKey = `user:enrollments:${userId}`;
      
      console.log(`\n🎯 ========== USER ENROLLMENTS REQUEST ==========`);
      console.log(`👤 User ID: ${userId}`);
      console.log(`🔑 Cache key: ${cacheKey}`);
      
      // Use Redis getOrSet for automatic caching
      const result = await this.redisService.getOrSet(
        cacheKey,
        async () => {
          // Get all active enrollments
          const enrollments = await this.prisma.userCourseEnrollment.findMany({
            where: {
              userId,
              status: 'ACTIVE',
            },
            select: {
              courseId: true,
              enrolledAt: true,
              expiresAt: true,
            },
          });

          const now = new Date();
          const activeCourseIds = enrollments
            .filter(e => !e.expiresAt || new Date(e.expiresAt) > now)
            .map(e => e.courseId);

          return {
            courseIds: activeCourseIds,
            count: activeCourseIds.length,
          };
        },
        900 // 15 minutes TTL
      );

      console.log(`✅ Found ${result.count} enrolled courses`);
      console.log(`🎯 ========== ENROLLMENTS COMPLETE ==========\n`);

      return result;
    } catch (error) {
      this.logger.error(
        `Error getting purchased courses for user ${userId}:`,
        error
      );
      return {
        courseIds: [],
        count: 0,
        error: 'Failed to fetch purchased courses',
      };
    }
  }

  /**
   * Invalidate user enrollment cache (call this on new purchase)
   */
  async invalidateUserEnrollmentCache(userId: string): Promise<void> {
    console.log(`\n🗑️  ========== INVALIDATING ENROLLMENT CACHE ==========`);
    console.log(`👤 User ID: ${userId}`);
    
    await this.redisService.del(`user:enrollments:${userId}`);
    console.log(`✅ Deleted cache: user:enrollments:${userId}`);
    
    console.log(`🗑️  ========== CACHE INVALIDATION COMPLETE ==========\n`);
  }
}
