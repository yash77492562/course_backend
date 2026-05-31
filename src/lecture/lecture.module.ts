import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { LectureController } from './lecture.controller';
import { LectureService } from './lecture.service';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [
    MulterModule.register({
      storage: require('multer').memoryStorage(),
      limits: {
        fileSize: 6 * 1024 * 1024 * 1024, // 6GB limit
      },
    }),
    UploadModule, // Import UploadModule to access R2UploadService
  ],
  controllers: [LectureController],
  providers: [LectureService],
  exports: [LectureService],
})
export class LectureModule {}
