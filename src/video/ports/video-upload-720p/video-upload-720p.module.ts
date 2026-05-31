import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { VideoUpload720pController } from './video-upload-720p.controller';
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
  controllers: [VideoUpload720pController],
})
export class VideoUpload720pModule {}
