import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { UploadController } from './controllers/upload.controller';
import { UploadStatusController } from './controllers/upload-status.controller';
import { UploadService } from './services/upload.service';
import { UploadLockService } from './services/upload-lock.service';
import { R2UploadService } from './services/r2-upload.service';
import { PrismaModule } from '../database/prisma/module/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { QueueModule } from '../queues/queue.module';

@Module({
  imports: [
    MulterModule.register({
      storage: require('multer').memoryStorage(), // Store in memory, not disk
      limits: {
        fileSize: 100 * 1024 * 1024, // 100MB limit per chunk
      },
    }),
    PrismaModule,
    RedisModule,
    QueueModule,
  ],
  controllers: [UploadController, UploadStatusController],
  providers: [UploadService, UploadLockService, R2UploadService],
  exports: [UploadService, UploadLockService, R2UploadService],
})
export class UploadModule {}