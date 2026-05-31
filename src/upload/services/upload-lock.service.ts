import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { logger } from '../../lib/logger.service';

@Injectable()
export class UploadLockService {
  private readonly LOCK_TTL = 7200; // 2 hours
  private readonly PROGRESS_TTL = 10800; // 3 hours

  constructor(private readonly redis: RedisService) {}

  /**
   * Try to acquire upload lock for a course (atomic operation)
   * Returns true if lock acquired, false if already locked
   */
  async acquireLock(courseId: string, userId: string): Promise<boolean> {
    const lockKey = `course:upload:lock:${courseId}`;

    try {
      // Atomic SET NX EX - only sets if key doesn't exist
      // This prevents race conditions when multiple admins try to upload simultaneously
      const result = await this.redis.client.set(
        lockKey,
        userId,
        'EX',
        this.LOCK_TTL,
        'NX'
      );

      const acquired = result === 'OK';
      
      if (acquired) {
        logger.info('🔒 Upload lock acquired', { courseId, userId });
        
        // Add to active uploads set
        await this.redis.client.sadd('course:uploads:active', courseId);
      } else {
        logger.warn('⚠️ Upload lock already held', { courseId });
      }

      return acquired;
    } catch (error) {
      logger.error('❌ Error acquiring upload lock', { courseId, error: error.message });
      return false;
    }
  }

  /**
   * Release upload lock
   */
  async releaseLock(courseId: string): Promise<void> {
    const lockKey = `course:upload:lock:${courseId}`;
    const progressKey = `course:upload:progress:${courseId}`;

    try {
      await Promise.all([
        this.redis.client.del(lockKey),
        this.redis.client.del(progressKey),
        this.redis.client.srem('course:uploads:active', courseId),
      ]);

      logger.info('🔓 Upload lock released', { courseId });
    } catch (error) {
      logger.error('❌ Error releasing upload lock', { courseId, error: error.message });
    }
  }

  /**
   * Check if course is locked
   */
  async isLocked(courseId: string): Promise<boolean> {
    const lockKey = `course:upload:lock:${courseId}`;
    
    try {
      const exists = await this.redis.client.exists(lockKey);
      return exists === 1;
    } catch (error) {
      logger.error('❌ Error checking lock status', { courseId, error: error.message });
      return false;
    }
  }

  /**
   * Get lock owner (user ID who holds the lock)
   */
  async getLockOwner(courseId: string): Promise<string | null> {
    const lockKey = `course:upload:lock:${courseId}`;
    
    try {
      return await this.redis.client.get(lockKey);
    } catch (error) {
      logger.error('❌ Error getting lock owner', { courseId, error: error.message });
      return null;
    }
  }

  /**
   * Extend lock TTL (for very long uploads)
   */
  async extendLock(courseId: string, additionalSeconds: number = 3600): Promise<void> {
    const lockKey = `course:upload:lock:${courseId}`;
    
    try {
      await this.redis.client.expire(lockKey, additionalSeconds);
      logger.info('⏰ Upload lock extended', { courseId, additionalSeconds });
    } catch (error) {
      logger.error('❌ Error extending lock', { courseId, error: error.message });
    }
  }

  /**
   * Set upload progress (for real-time UI updates)
   * Also stores module and lesson metadata for display
   */
  async setProgress(courseId: string, progress: {
    lessonId: string;
    videoId?: string;
    jobId?: string; // BullMQ job ID for queue position tracking
    status: 'uploading' | 'processing' | 'completed' | 'failed';
    progress: number;
    stage: string;
    message: string;
    fileName?: string;
    fileSize?: number;
    uploadedBy: string;
    error?: string;
    // NEW: Module and lesson metadata for display
    moduleName?: string;
    lessonName?: string;
  }): Promise<void> {
    const progressKey = `course:upload:progress:${courseId}`;

    try {
      const data = {
        ...progress,
        courseId,
        updatedAt: new Date().toISOString(),
      };

      await this.redis.client.setex(
        progressKey,
        this.PROGRESS_TTL,
        JSON.stringify(data)
      );

      logger.info('📊 Upload progress updated', { 
        courseId, 
        progress: progress.progress,
        stage: progress.stage,
        jobId: progress.jobId,
        moduleName: progress.moduleName,
        lessonName: progress.lessonName
      });
    } catch (error) {
      logger.error('❌ Error setting progress', { courseId, error: error.message });
    }
  }

  /**
   * Get upload progress
   */
  async getProgress(courseId: string): Promise<any | null> {
    const progressKey = `course:upload:progress:${courseId}`;

    try {
      const data = await this.redis.client.get(progressKey);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('❌ Error getting progress', { courseId, error: error.message });
      return null;
    }
  }

  /**
   * Get all active uploads
   */
  async getActiveUploads(): Promise<string[]> {
    try {
      return await this.redis.client.smembers('course:uploads:active');
    } catch (error) {
      logger.error('❌ Error getting active uploads', { error: error.message });
      return [];
    }
  }

  /**
   * Force release lock (admin override)
   */
  async forceReleaseLock(courseId: string, adminUserId: string): Promise<void> {
    logger.warn('⚠️ Force releasing upload lock', { courseId, adminUserId });
    await this.releaseLock(courseId);
  }
}
