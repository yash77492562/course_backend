#!/usr/bin/env ts-node
/**
 * Check BullMQ Worker Status
 * 
 * This script checks the status of all BullMQ workers and their queues
 */

import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const configService = new ConfigService();

const redisConfig = {
  host: configService.get('REDIS_HOST', 'localhost'),
  port: parseInt(configService.get('REDIS_PORT', '6379')),
  password: configService.get('REDIS_PASSWORD') || undefined,
};

const queueNames = [
  'video-processing',
  'cache-management',
  'notifications',
  'payment-processing',
  'token-refresh',
];

async function checkWorkerStatus() {
  console.log('🔍 Checking BullMQ Worker Status...\n');
  console.log('📍 Redis Config:', {
    host: redisConfig.host,
    port: redisConfig.port,
    hasPassword: !!redisConfig.password,
  });
  console.log('\n' + '='.repeat(80) + '\n');

  const redis = new Redis(redisConfig);

  try {
    // Test Redis connection
    const pong = await redis.ping();
    console.log('✅ Redis Connection:', pong === 'PONG' ? 'CONNECTED' : 'FAILED');
    console.log('\n' + '='.repeat(80) + '\n');

    // Check each queue
    for (const queueName of queueNames) {
      const queue = new Queue(queueName, {
        connection: redisConfig,
        prefix: 'riva:bull',
      });

      try {
        console.log(`📊 Queue: ${queueName}`);
        console.log('-'.repeat(80));

        // Get job counts
        const counts = await queue.getJobCounts(
          'waiting',
          'active',
          'completed',
          'failed',
          'delayed',
          'paused'
        );

        console.log('Job Counts:');
        console.log(`  ⏳ Waiting:   ${counts.waiting}`);
        console.log(`  🔄 Active:    ${counts.active}`);
        console.log(`  ✅ Completed: ${counts.completed}`);
        console.log(`  ❌ Failed:    ${counts.failed}`);
        console.log(`  ⏰ Delayed:   ${counts.delayed}`);
        console.log(`  ⏸️  Paused:    ${counts.paused}`);

        // Get workers for this queue
        const workers = await queue.getWorkers();
        console.log(`\n👷 Workers: ${workers.length}`);
        if (workers.length > 0) {
          workers.forEach((worker, index) => {
            console.log(`  Worker ${index + 1}:`, {
              id: worker.id,
              name: worker.name,
            });
          });
        } else {
          console.log('  ⚠️  No workers found for this queue');
        }

        // Get active jobs
        const activeJobs = await queue.getActive();
        if (activeJobs.length > 0) {
          console.log(`\n🔄 Active Jobs (${activeJobs.length}):`);
          for (const job of activeJobs.slice(0, 5)) {
            console.log(`  - Job ${job.id}:`, {
              name: job.name,
              progress: job.progress,
              attemptsMade: job.attemptsMade,
            });
          }
          if (activeJobs.length > 5) {
            console.log(`  ... and ${activeJobs.length - 5} more`);
          }
        }

        // Get failed jobs
        const failedJobs = await queue.getFailed(0, 5);
        if (failedJobs.length > 0) {
          console.log(`\n❌ Recent Failed Jobs (${failedJobs.length}):`);
          for (const job of failedJobs) {
            console.log(`  - Job ${job.id}:`, {
              name: job.name,
              failedReason: job.failedReason?.substring(0, 100),
              attemptsMade: job.attemptsMade,
            });
          }
        }

        console.log('\n' + '='.repeat(80) + '\n');

        await queue.close();
      } catch (error) {
        console.error(`❌ Error checking queue ${queueName}:`, error.message);
        console.log('\n' + '='.repeat(80) + '\n');
      }
    }

    // Check for worker keys in Redis
    console.log('🔑 Checking Redis Worker Keys...');
    console.log('-'.repeat(80));
    const workerKeys = await redis.keys('riva:bull:*:workers');
    console.log(`Found ${workerKeys.length} worker key(s):`);
    for (const key of workerKeys) {
      const workers = await redis.smembers(key);
      console.log(`  ${key}: ${workers.length} worker(s)`);
      workers.forEach((worker) => {
        console.log(`    - ${worker}`);
      });
    }

    console.log('\n' + '='.repeat(80) + '\n');
    console.log('✅ Worker status check complete!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await redis.quit();
    process.exit(0);
  }
}

checkWorkerStatus();
