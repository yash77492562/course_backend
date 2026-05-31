import { Worker, type Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { logger } from '../../lib/logger.service';
import type { CacheJobData } from '../types/job-types';

const configService = new ConfigService();

const redisConfig = {
  host: configService.get('REDIS_HOST', 'localhost'),
  port: parseInt(configService.get('REDIS_PORT', '6379')),
  password: configService.get('REDIS_PASSWORD') || undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

export const cacheWorker = new Worker<CacheJobData>(
  'cache-management',
  async (job: Job<CacheJobData>) => {
    logger.info('🗄️ Cache job started', { type: job.data.type, jobId: job.id });

    try {
      switch (job.data.type) {
        case 'cache_warmup': {
          const { cacheType, targetIds } = job.data;
          
          await job.updateProgress(20);
          logger.info('Warming cache', { cacheType, targetIds });
          
          // TODO: Implement cache warmup logic
          // This should pre-load frequently accessed data into Redis
          
          await job.updateProgress(100);
          logger.info('✅ Cache warmed', { cacheType });
          
          return { success: true, cacheType, count: targetIds?.length || 0 };
        }

        case 'cache_invalidation': {
          const { pattern, reason } = job.data;
          
          await job.updateProgress(50);
          logger.info('Invalidating cache', { pattern, reason });
          
          // TODO: Implement cache invalidation logic
          // This should delete keys matching the pattern
          
          await job.updateProgress(100);
          logger.info('✅ Cache invalidated', { pattern, reason });
          
          return { success: true, pattern };
        }

        default: {
          const _exhaustive: never = job.data;
          logger.error('Unknown cache job type', { data: _exhaustive });
          throw new Error('Unknown cache job type');
        }
      }
    } catch (error) {
      logger.error('❌ Cache job failed', {
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
    concurrency: 10, // High concurrency for cache operations
  }
);

// Worker event handlers with detailed logging
cacheWorker.on('completed', (job) => {
  logger.info('✅ Cache job completed', {
    jobId: job.id,
    type: job.data.type,
    duration: job.finishedOn ? job.finishedOn - job.processedOn : 0,
  });
});

cacheWorker.on('failed', (job, err) => {
  logger.error('❌ Cache job failed', {
    jobId: job?.id,
    type: job?.data?.type,
    error: err.message,
    attemptsMade: job?.attemptsMade,
  });
});

cacheWorker.on('error', (err) => {
  logger.error('❌ Cache worker error', {
    error: err.message,
    stack: err.stack,
  });
});

logger.info('🗄️ Cache worker initialized', {
  queue: 'cache-management',
  concurrency: 10,
  prefix: 'riva:bull',
});
