import { Worker, type Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { logger } from '../../lib/logger.service';
import type { NotificationJobData } from '../types/job-types';

const configService = new ConfigService();

const redisConfig = {
  host: configService.get('REDIS_HOST', 'localhost'),
  port: parseInt(configService.get('REDIS_PORT', '6379')),
  password: configService.get('REDIS_PASSWORD') || undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

export const notificationWorker = new Worker<NotificationJobData>(
  'notifications',
  async (job: Job<NotificationJobData>) => {
    logger.info('📧 Notification job started', { type: job.data.type, jobId: job.id });

    try {
      switch (job.data.type) {
        case 'send_email': {
          const { to, subject, template, data } = job.data;
          
          await job.updateProgress(30);
          logger.info('Sending email', { to, subject, template });
          
          // TODO: Implement email sending logic
          // This should use your email service (SendGrid, SES, etc.)
          
          await job.updateProgress(100);
          logger.info('✅ Email sent', { to, subject });
          
          return { success: true, to, subject };
        }

        default: {
          // @ts-ignore - Exhaustive check
          const _exhaustive: never = job.data;
          logger.error('Unknown notification job type', { data: _exhaustive });
          throw new Error('Unknown notification job type');
        }
      }
    } catch (error) {
      logger.error('❌ Notification job failed', {
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
    concurrency: 20, // High concurrency for notifications
  }
);

notificationWorker.on('completed', (job) => {
  logger.info('✅ Notification job completed', { jobId: job.id, type: job.data.type });
});

notificationWorker.on('failed', (job, err) => {
  logger.error('❌ Notification job failed', {
    jobId: job?.id,
    type: job?.data?.type,
    error: err.message,
  });
});

notificationWorker.on('error', (err) => {
  logger.error('❌ Notification worker error', { error: err.message });
});
