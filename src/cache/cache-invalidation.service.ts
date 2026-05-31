import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

/**
 * Centralized cache invalidation service
 * Handles all cache invalidation logic across the application
 */
@Injectable()
export class CacheInvalidationService {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  /**
   * Invalidate all user-related caches
   */
  async invalidateUser(userId: string): Promise<void> {
    const keys = [
      `user:profile:${userId}`,
      `user:session:${userId}`,
      `user:purchases:${userId}`,
    ];

    await Promise.all(keys.map(key => this.cacheManager.del(key)));
  }

  /**
   * Invalidate all course-related caches
   */
  async invalidateCourse(courseId: string): Promise<void> {
    const keys = [
      `course:detail:${courseId}`,
      `course:modules:${courseId}`,
      `course:lessons:${courseId}`,
      'courses:published', // Also invalidate list cache
    ];

    await Promise.all(keys.map(key => this.cacheManager.del(key)));
  }

  /**
   * Invalidate lesson cache
   */
  async invalidateLesson(lessonId: string): Promise<void> {
    await this.cacheManager.del(`lesson:${lessonId}`);
  }

  /**
   * Invalidate payment/order cache
   */
  async invalidateOrder(orderId: string): Promise<void> {
    await this.cacheManager.del(`order:${orderId}`);
  }

  /**
   * Clear all caches (use sparingly!)
   * Note: cache-manager v5 doesn't have reset(), so we skip this for now
   */
}
