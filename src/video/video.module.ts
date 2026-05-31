import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ConfigModule } from '@nestjs/config';
import { VideoAnalyzerService } from './services/video-analyzer.service';
import { VideoProcessorService } from './services/video-processor.service';
import { ChunkUploadService } from './services/chunk-upload.service';
import { VideoUploadJobService } from './services/video-upload-job.service';
import { VideoStreamController } from './controllers/video-stream.controller';
import { PrismaModule } from '../database/prisma/module/prisma.module';
import { R2UploadService } from '../upload/services/r2-upload.service';
import { RedisModule } from '../redis/redis.module';

/**
 * VideoModule - Core video services (NO QueueModule dependency)
 * 
 * This module provides video services WITHOUT QueueModule to avoid
 * circular dependencies and initialization deadlocks in microservices.
 * 
 * VideoProcessingController is in a separate VideoProcessingModule
 * that imports both VideoModule and QueueModule.
 */
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    MulterModule.register({
      storage: require('multer').memoryStorage(), // Store in memory, not disk
      limits: {
        fileSize: 6 * 1024 * 1024 * 1024, // 6GB limit
      },
    }),
  ],
  controllers: [VideoStreamController],
  providers: [
    VideoAnalyzerService,
    VideoProcessorService,
    ChunkUploadService,
    VideoUploadJobService,
    R2UploadService,
  ],
  exports: [
    VideoAnalyzerService,
    VideoProcessorService,
    ChunkUploadService,
    VideoUploadJobService,
    R2UploadService,
  ],
})
export class VideoModule {}
