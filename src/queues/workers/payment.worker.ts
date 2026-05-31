import { Worker, type Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { logger } from '../../lib/logger.service';
import type { PaymentJobData } from '../types/job-types';

const configService = new ConfigService();

const redisConfig = {
  host: configService.get('REDIS_HOST', 'localhost'),
  port: parseInt(configService.get('REDIS_PORT', '6379')),
  password: configService.get('REDIS_PASSWORD') || undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

export const paymentWorker = new Worker<PaymentJobData>(
  'payment-processing',
  async (job: Job<PaymentJobData>) => {
    logger.info('💳 Payment job started', { type: job.data.type, jobId: job.id, paymentId: job.data.paymentId });

    try {
      switch (job.data.type) {
        case 'process_payment': {
          const { paymentId, userId, amount, currency } = job.data;
          
          await job.updateProgress(20);
          logger.info('Processing payment', { paymentId, userId, amount, currency });
          
          // TODO: Implement payment processing logic
          // This should:
          // 1. Verify payment with Stripe
          // 2. Update order status in database
          // 3. Grant course access to user
          // 4. Send confirmation email
          
          await job.updateProgress(50);
          
          // Simulate processing
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          await job.updateProgress(100);
          logger.info('✅ Payment processed', { paymentId, userId });
          
          return { success: true, paymentId, userId };
        }

        default: {
          // @ts-ignore - Exhaustive check
          const _exhaustive: never = job.data;
          logger.error('Unknown payment job type', { data: _exhaustive });
          throw new Error('Unknown payment job type');
        }
      }
    } catch (error) {
      logger.error('❌ Payment job failed - REQUIRES MANUAL INVESTIGATION', {
        jobId: job.id,
        paymentId: job.data.paymentId,
        userId: job.data.userId,
        error: error.message,
        stack: error.stack,
        message: 'Payment failed - user may not have received course access',
      });
      throw error;
    }
  },
  {
    connection: redisConfig,
    prefix: 'riva:bull',
    concurrency: 1, // Serial processing for financial operations to avoid race conditions
  }
);

paymentWorker.on('completed', (job) => {
  logger.info('✅ Payment job completed', { 
    jobId: job.id, 
    paymentId: job.data.paymentId,
    userId: job.data.userId 
  });
});

paymentWorker.on('failed', (job, err) => {
  logger.error('❌ Payment job FAILED - MANUAL ACTION REQUIRED', {
    jobId: job?.id,
    paymentId: job?.data?.paymentId,
    userId: job?.data?.userId,
    error: err.message,
    message: 'If all retries exhausted, user may not have course access. Check manually.',
  });
});

paymentWorker.on('error', (err) => {
  logger.error('❌ Payment worker error', { error: err.message });
});
