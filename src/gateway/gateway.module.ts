import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GatewayController } from './gateway.controller';
import { ContactController } from './contact.controller';
import { PartnerController } from './partner.controller';
import { UploadModule } from '../upload/upload.module';
import { CourseModule } from '../course/modules/course.module';
import { UserModule } from '../user/modules/user.module';
import { AuthModule } from '../auth/auth.module';
import { StripeModule } from '../payment/stripe/module';
import { RedisModule } from '../redis/redis.module';
import { VideoModule } from '../video/video.module';
import { VideoProcessingModule } from '../video/controllers/video-processing.module';
import { LectureModule } from '../lecture/lecture.module';
import { PartnerModule } from '../partner/partner.module';
import { ContactModule } from '../contact/modules/contact.module';
import { QueueModule } from '../queues/queue.module';
import { VideoProcessController } from '../video/ports/video-process/video-process.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    RedisModule,
    AuthModule,
    UserModule,
    CourseModule,
    UploadModule,
    StripeModule,
    VideoModule, // Provides VideoAnalyzerService, ChunkUploadService, VideoUploadJobService
    VideoProcessingModule,
    LectureModule,
    PartnerModule,
    ContactModule,
    QueueModule, // Provides QueueManagerService
  ],
  controllers: [
    GatewayController, 
    ContactController, 
    PartnerController,
    VideoProcessController, // Add VideoProcessController directly to gateway
  ],
})
export class GatewayModule {}