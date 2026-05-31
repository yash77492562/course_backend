import { Module } from '@nestjs/common';
import { VideoProcessController } from './video-process.controller';
import { VideoModule } from '../../video.module';
import { QueueModule } from '../../../queues/queue.module';

@Module({
  imports: [VideoModule, QueueModule],
  controllers: [VideoProcessController],
})
export class VideoProcessModule {}
