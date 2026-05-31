import { Worker, type Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { logger } from '../../lib/logger.service';
import type { RefreshJobData } from '../types/job-types';

const configService = new ConfigService();

const redisConfig = {
  host: configService.get('REDIS_HOST', 'localhost'),
  port: parseInt(configService.get('REDIS_PORT', '6379')),
  password: configService.get('REDIS_PASSWORD') || undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

export const refreshWorker = new Worker<RefreshJobData>(
  'data-refresh',
  async (job: Job<RefreshJobData>) => {
    logger.info('🔄 Refresh job started', { type: job.data.type, jobId: job.id });

    try {
      switch (job.data.type) {
        case 'refresh_course_data': {
          const { courseId, refreshType } = job.data;
          
          await job.updateProgress(30);
          logger.info('Refreshing course data', { courseId, refreshType });
          
          // TODO: Implement course data refresh logic
          // This should:
          // 1. Fetch fresh data from database
          // 2. Update Redis cache
          // 3. Invalidate stale caches
          
          await job.updateProgress(100);
          logger.info('✅ Course data refreshed', { courseId, refreshType });
          
          return { success: true, courseId, refreshType };
        }

        case 'refresh_user_data': {
          const { userId, refreshType } = job.data;
          
          await job.updateProgress(30);
          logger.info('Refreshing user data', { userId, refreshType });
          
          // TODO: Implement user data refresh logic
          // This should:
          // 1. Fetch fresh data from database
          // 2. Update Redis cache
          // 3. Invalidate stale caches
          
          await job.updateProgress(100);
          logger.info('✅ User data refreshed', { userId, refreshType });
          
          return { success: true, userId, refreshType };
        }

        default: {
          // @ts-ignore - Exhaustive check
          const _exhaustive: never = job.data;
          logger.error('Unknown refresh job type', { data: _exhaustive });
          throw new Error('Unknown refresh job type');
        }
      }
    } catch (error) {
      logger.error('❌ Refresh job failed', {
        jobId: job.id,
        type: job.data.type,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  },
  {
    connection: redisConfig,
    prefix: 'riva:bull',
    concurrency: 5,
  }
);

refreshWorker.on('completed', (job) => {
  logger.info('✅ Refresh job completed', { jobId: job.id, type: job.data.type });
});

refreshWorker.on('failed', (job, err) => {
  logger.error('❌ Refresh job failed', {
    jobId: job?.id,
    type: job?.data?.type,
    error: err.message,
  });
});

refreshWorker.on('error', (err) => {
  logger.error('❌ Refresh worker error', { error: err.message });
});
