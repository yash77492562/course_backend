import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QueueManagerService } from './queue-manager.service';
import { RedisModule } from '../redis/redis.module';
import { PrismaModule } from '../database/prisma/module/prisma.module';

/**
 * Queue Module - Manages BullMQ queues and job processing
 * 
 * Note: Workers are started in main.ts, not here.
 * This module only provides the QueueManagerService for adding jobs to queues.
 */
@Module({
  imports: [
    ConfigModule,
    RedisModule,
    PrismaModule,
  ],
  providers: [
    QueueManagerService,
  ],
  exports: [QueueManagerService],
})
export class QueueModule {}