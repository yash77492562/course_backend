import { Module } from '@nestjs/common';
import { VideoProcessingController } from './video-processing.controller';
import { VideoModule } from '../video.module';
import { QueueModule } from '../../queues/queue.module';

/**
 * VideoProcessingModule - Handles video processing with BullMQ
 * 
 * This module is separate from VideoModule to avoid circular dependencies.
 * It imports both VideoModule (for services) and QueueModule (for job queuing).
 */
@Module({
  imports: [VideoModule, QueueModule],
  controllers: [VideoProcessingController],
})
export class VideoProcessingModule {}
