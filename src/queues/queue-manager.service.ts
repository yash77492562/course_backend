import { Queue } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { logger } from '../lib/logger.service';
import type {
  VideoJobData,
  CacheJobData,
  NotificationJobData,
  MaintenanceJobData,
  RefreshJobData,
  PaymentJobData,
} from './types/job-types';

@Injectable()
export class QueueManagerService {
  private videoQueue: Queue<VideoJobData>;
  private cacheQueue: Queue<CacheJobData>;
  private notificationQueue: Queue<NotificationJobData>;
  private maintenanceQueue: Queue<MaintenanceJobData>;
  private refreshQueue: Queue<RefreshJobData>;
  private paymentQueue: Queue<PaymentJobData>;

  constructor(private configService: ConfigService) {
    const redisConfig = {
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD'),
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };

    const queuePrefix = 'riva:bull';

    // Initialize queues with specific configurations
    this.videoQueue = new Queue<VideoJobData>('video-processing', {
      connection: redisConfig,
      prefix: queuePrefix,
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 100,
        attempts: 1, // CRITICAL: No retries - video processing is expensive and should not restart
        backoff: { type: 'exponential', delay: 2000 },
      },
    });

    this.cacheQueue = new Queue<CacheJobData>('cache-management', {
      connection: redisConfig,
      prefix: queuePrefix,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 2,
        backoff: { type: 'fixed', delay: 1000 },
      },
    });

    this.notificationQueue = new Queue<NotificationJobData>('notifications', {
      connection: redisConfig,
      prefix: queuePrefix,
      defaultJobOptions: {
        removeOnComplete: 200,
        removeOnFail: 100,
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
      },
    });

    this.maintenanceQueue = new Queue<MaintenanceJobData>('maintenance', {
      connection: redisConfig,
      prefix: queuePrefix,
      defaultJobOptions: {
        removeOnComplete: 10,
        removeOnFail: 50,
        attempts: 2,
        backoff: { type: 'fixed', delay: 5000 },
      },
    });

    this.refreshQueue = new Queue<RefreshJobData>('data-refresh', {
      connection: redisConfig,
      prefix: queuePrefix,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    });

    this.paymentQueue = new Queue<PaymentJobData>('payment-processing', {
      connection: redisConfig,
      prefix: queuePrefix,
      defaultJobOptions: {
        removeOnComplete: 500,
        removeOnFail: false, // Keep all failed payment jobs for audit
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
      },
    });

    logger.info('✅ Queue Manager initialized with all queues');
  }

  // Video Processing Queue Methods
  async addVideoProcessingJob(data: VideoJobData, options?: any) {
    const job = await this.videoQueue.add(data.type, data, {
      priority: data.type === 'generate_thumbnail' ? 1 : 5, // Thumbnails are higher priority
      ...options,
    });
    logger.info(`📹 Video job added: ${data.type}`, { jobId: job.id, videoId: data.videoId });
    return job;
  }

  // Cache Management Queue Methods
  async addCacheJob(data: CacheJobData, options?: any) {
    const job = await this.cacheQueue.add(data.type, data, {
      priority: data.type === 'cache_invalidation' ? 1 : 5, // Invalidation is higher priority
      ...options,
    });
    logger.info(`🗄️ Cache job added: ${data.type}`, { jobId: job.id });
    return job;
  }

  // Notification Queue Methods
  async addNotificationJob(data: NotificationJobData, options?: any) {
    const job = await this.notificationQueue.add(data.type, data, {
      priority: 3, // Medium priority for notifications
      ...options,
    });
    logger.info(`📧 Notification job added: ${data.type}`, { jobId: job.id, to: data.to });
    return job;
  }

  // Maintenance Queue Methods
  async addMaintenanceJob(data: MaintenanceJobData, options?: any) {
    const job = await this.maintenanceQueue.add(data.type, data, {
      priority: 10, // Low priority for maintenance
      delay: options?.delay || 0,
      ...options,
    });
    logger.info(`🧹 Maintenance job added: ${data.type}`, { jobId: job.id });
    return job;
  }

  // Data Refresh Queue Methods
  async addRefreshJob(data: RefreshJobData, options?: any) {
    const job = await this.refreshQueue.add(data.type, data, {
      priority: 2, // High priority for data refresh
      // Prevent duplicate refresh jobs for the same resource
      jobId: `${data.type}_${data.type === 'refresh_course_data' ? data.courseId : data.userId}`,
      ...options,
    });
    logger.info(`🔄 Refresh job added: ${data.type}`, { 
      jobId: job.id, 
      resourceId: data.type === 'refresh_course_data' ? data.courseId : data.userId 
    });
    return job;
  }

  // Payment Processing Queue Methods
  async addPaymentJob(data: PaymentJobData, options?: any) {
    const job = await this.paymentQueue.add(data.type, data, {
      priority: 1, // Highest priority for payments
      // Use payment ID as job ID for idempotency
      jobId: `payment_${data.paymentId}`,
      ...options,
    });
    logger.info(`💳 Payment job added: ${data.type}`, { 
      jobId: job.id, 
      paymentId: data.paymentId,
      userId: data.userId 
    });
    return job;
  }

  // Utility Methods
  async getQueueStats() {
    const stats = await Promise.all([
      this.videoQueue.getJobCounts(),
      this.cacheQueue.getJobCounts(),
      this.notificationQueue.getJobCounts(),
      this.maintenanceQueue.getJobCounts(),
      this.refreshQueue.getJobCounts(),
      this.paymentQueue.getJobCounts(),
    ]);

    return {
      video: stats[0],
      cache: stats[1],
      notifications: stats[2],
      maintenance: stats[3],
      refresh: stats[4],
      payments: stats[5],
    };
  }

  async pauseAllQueues() {
    await Promise.all([
      this.videoQueue.pause(),
      this.cacheQueue.pause(),
      this.notificationQueue.pause(),
      this.maintenanceQueue.pause(),
      this.refreshQueue.pause(),
      this.paymentQueue.pause(),
    ]);
    logger.warn('⏸️ All queues paused');
  }

  async resumeAllQueues() {
    await Promise.all([
      this.videoQueue.resume(),
      this.cacheQueue.resume(),
      this.notificationQueue.resume(),
      this.maintenanceQueue.resume(),
      this.refreshQueue.resume(),
      this.paymentQueue.resume(),
    ]);
    logger.info('▶️ All queues resumed');
  }

  // Getters for individual queues (for workers)
  get videoProcessingQueue() { return this.videoQueue; }
  get cacheManagementQueue() { return this.cacheQueue; }
  get notificationsQueue() { return this.notificationQueue; }
  get maintenanceJobsQueue() { return this.maintenanceQueue; }
  get dataRefreshQueue() { return this.refreshQueue; }
  get paymentProcessingQueue() { return this.paymentQueue; }

  // Get video queue position for a specific job
  async getVideoQueuePosition(jobId: string): Promise<number | null> {
    try {
      const job = await this.videoQueue.getJob(jobId);
      if (!job) return null;

      const state = await job.getState();
      
      // If job is active or completed, return 0 (not waiting)
      if (state === 'active' || state === 'completed' || state === 'failed') {
        return 0;
      }

      // Get waiting jobs
      const waitingJobs = await this.videoQueue.getWaiting();
      const position = waitingJobs.findIndex(j => j.id === jobId);
      
      return position >= 0 ? position + 1 : null;
    } catch (error) {
      logger.error('Error getting queue position', { jobId, error: error.message });
      return null;
    }
  }

  // Get total waiting jobs count
  async getVideoQueueWaitingCount(): Promise<number> {
    try {
      const counts = await this.videoQueue.getJobCounts('waiting');
      return counts.waiting || 0;
    } catch (error) {
      logger.error('Error getting waiting count', { error: error.message });
      return 0;
    }
  }
}