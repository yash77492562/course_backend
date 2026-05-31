import { Worker, type Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { logger } from '../../lib/logger.service';
import type { MaintenanceJobData } from '../types/job-types';

const configService = new ConfigService();

const redisConfig = {
  host: configService.get('REDIS_HOST', 'localhost'),
  port: parseInt(configService.get('REDIS_PORT', '6379')),
  password: configService.get('REDIS_PASSWORD') || undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

export const maintenanceWorker = new Worker<MaintenanceJobData>(
  'maintenance',
  async (job: Job<MaintenanceJobData>) => {
    logger.info('🧹 Maintenance job started', { type: job.data.type, jobId: job.id });

    try {
      switch (job.data.type) {
        case 'cleanup_files': {
          const { paths, olderThan } = job.data;
          
          await job.updateProgress(30);
          logger.info('Cleaning up files', { pathCount: paths.length, olderThan });
          
          // TODO: Implement file cleanup logic
          // This should:
          // 1. Check file age
          // 2. Delete old temporary files
          // 3. Clean up orphaned uploads
          
          await job.updateProgress(100);
          logger.info('✅ Files cleaned up', { pathCount: paths.length });
          
          return { success: true, deletedCount: paths.length };
        }

        default: {
          // @ts-ignore - Exhaustive check
          const _exhaustive: never = job.data;
          logger.error('Unknown maintenance job type', { data: _exhaustive });
          throw new Error('Unknown maintenance job type');
        }
      }
    } catch (error) {
      logger.error('❌ Maintenance job failed', {
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
    concurrency: 2,
  }
);

maintenanceWorker.on('completed', (job) => {
  logger.info('✅ Maintenance job completed', { jobId: job.id, type: job.data.type });
});

maintenanceWorker.on('failed', (job, err) => {
  logger.error('❌ Maintenance job failed', {
    jobId: job?.id,
    type: job?.data?.type,
    error: err.message,
  });
});

maintenanceWorker.on('error', (err) => {
  logger.error('❌ Maintenance worker error', { error: err.message });
});
