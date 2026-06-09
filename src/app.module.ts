import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CourseModule } from './course/modules/course.module';
import { PrismaModule } from './database/prisma/module/prisma.module';
import { RedisModule } from './redis/redis.module';
import { PaginationModule } from './pagination/pagination.module';
import { UploadModule } from './upload/upload.module';
import { VideoModule } from './video/video.module';
import { LectureModule } from './lecture/lecture.module';
import { GatewayModule } from './gateway/gateway.module';
import { PaymentModule } from './payment/module';
import { SecurityModule } from './security/module';
import { CacheHelperModule } from './cache/cache.module';
import { PartnerModule } from './partner/partner.module';
import { QueueModule } from './queues/queue.module';
import { AuthModule } from './auth/auth.module';
import { CreateContactModule } from './contact/ports/create-contact/create-contact.module';

@Module({
  imports: [
    // Config module MUST be first
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    
    // Cache helper module (includes CacheModule with Redis configuration)
    CacheHelperModule,
    
    // Queue module for background jobs
    QueueModule,
    
    // Other modules
    SecurityModule,
    PrismaModule,
    RedisModule,
    PaginationModule,
    AuthModule, // New auth module
    CourseModule,
    UploadModule,
    VideoModule,
    LectureModule,
    GatewayModule,
    PaymentModule,
    PartnerModule,
    CreateContactModule, // Contact microservice module
  ],
})
export class AppModule {}