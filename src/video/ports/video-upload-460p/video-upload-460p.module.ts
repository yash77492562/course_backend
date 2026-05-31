import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { VideoUpload460pController } from './video-upload-460p.controller';
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
  controllers: [VideoUpload460pController],
})
export class VideoUpload460pModule {}
