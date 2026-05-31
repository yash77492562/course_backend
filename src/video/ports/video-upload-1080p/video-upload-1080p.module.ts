import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { VideoUpload1080pController } from './video-upload-1080p.controller';
import { VideoModule } from '../../video.module';

@Module({
  imports: [
    MulterModule.register({
      storage: require('multer').memoryStorage(),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB per chunk
      },
    }),
    VideoModule,
  ],
  controllers: [VideoUpload1080pController],
})
export class VideoUpload1080pModule {}
