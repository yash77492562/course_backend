import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CourseController } from '../controllers/course.controller';
import { AdminCourseController } from '../controllers/admin-course.controller';
import { CourseAccessController } from '../controllers/course-access.controller';
import { CourseService } from '../services/course.service';
import { CourseAccessService } from '../services/course-access.service';
import { CourseOptimizationService } from '../services/course-optimization.service';
import { PrismaModule } from '../../database/prisma/module/prisma.module';
import { PaginationModule } from '../../pagination/pagination.module';
import { R2UploadService } from '../../upload/services/r2-upload.service';
import { RedisModule } from '../../redis/redis.module';
import { CacheHelperModule } from '../../cache/cache.module';
import { QueueModule } from '../../queues/queue.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    PaginationModule,
    RedisModule,
    CacheHelperModule,
    QueueModule,
  ],
  controllers: [CourseController, AdminCourseController, CourseAccessController],
  providers: [
    CourseService, 
    CourseAccessService, 
    CourseOptimizationService,
    R2UploadService
  ],
  exports: [CourseService, CourseAccessService, CourseOptimizationService],
})
export class CourseModule {}