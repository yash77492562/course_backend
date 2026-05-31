#!/usr/bin/env ts-node
/**
 * BullMQ Workers Standalone Process
 * 
 * This file starts all BullMQ workers as a standalone process.
 * Workers will process jobs from their respective queues.
 */

import { logger } from './lib/logger.service';

// Import all workers
import { videoWorker } from './queues/workers/video.worker';
import { cacheWorker } from './queues/workers/cache.worker';
import { notificationWorker } from './queues/workers/notification.worker';
import { paymentWorker } from './queues/workers/payment.worker';
import { refreshWorker } from './queues/workers/refresh.worker';
import { maintenanceWorker } from './queues/workers/maintenance.worker';

console.log('🚀 Starting BullMQ Workers...\n');
console.log('=' .repeat(80));
console.log('🎯 BULLMQ WORKERS PROCESS');
console.log('=' .repeat(80));
console.log('');

const workers = [
  { name: 'Video Processing', worker: videoWorker, queue: 'video-processing' },
  { name: 'Cache Management', worker: cacheWorker, queue: 'cache-management' },
  { name: 'Notifications', worker: notificationWorker, queue: 'notifications' },
  { name: 'Payment Processing', worker: paymentWorker, queue: 'payment-processing' },
  { name: 'Token Refresh', worker: refreshWorker, queue: 'token-refresh' },
  { name: 'Maintenance', worker: maintenanceWorker, queue: 'maintenance' },
];

// Log worker status
workers.forEach(({ name, worker, queue }) => {
  console.log(`✅ ${name} Worker`);
  console.log(`   Queue: ${queue}`);
  console.log(`   Running: ${worker.isRunning()}`);
  console.log(`   Paused: ${worker.isPaused()}`);
  console.log('');
});

logger.info('✅ All BullMQ workers started', {
  workers: workers.map(w => w.name),
  timestamp: new Date().toISOString(),
});

console.log('=' .repeat(80));
console.log('🎯 Workers are now listening for jobs...');
console.log('📊 Press Ctrl+C to stop');
console.log('=' .repeat(80));
console.log('\n✅ WORKERS READY - Waiting for jobs to process...\n');

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`\n${signal} received - shutting down workers...`);
  logger.info(`${signal} received - shutting down workers`);

  await Promise.all(
    workers.map(async ({ name, worker }) => {
      console.log(`Closing ${name}...`);
      await worker.close();
    })
  );

  logger.info('All workers shut down successfully');
  console.log('✅ All workers shut down successfully');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Keep process alive
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception in worker process', {
    error: error.message,
    stack: error.stack,
  });
  console.error('❌ Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection in worker process', {
    reason,
    promise,
  });
  console.error('❌ Unhandled rejection:', reason);
});
