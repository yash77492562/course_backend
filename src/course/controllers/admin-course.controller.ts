import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { CourseService } from '../services/course.service';
import { CreateCourseDto } from '../dto/course.dto';

// Admin-only controller for course creation
@Controller('admin/courses')
export class AdminCourseController {
  constructor(private readonly courseService: CourseService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createCourse(@Body() createCourseDto: CreateCourseDto) {
    try {
      console.log('🎯 ===== COURSE CREATION REQUEST =====');
      console.log('📦 Full DTO:', JSON.stringify(createCourseDto, null, 2));
      
      // Check for HLS data in lessons
      if (createCourseDto.modules) {
        createCourseDto.modules.forEach((module: any, mIndex: number) => {
          if (module.lessons) {
            module.lessons.forEach((lesson: any, lIndex: number) => {
              console.log(`\n📹 Module ${mIndex + 1}, Lesson ${lIndex + 1}: ${lesson.title}`);
              console.log('   hlsQualities:', lesson.hlsQualities ? 'YES ✅' : 'NO ❌');
              console.log('   videoUrls:', lesson.videoUrls ? 'YES' : 'NO');
              console.log('   thumbnail:', lesson.thumbnail ? 'YES' : 'NO');
              
              if (lesson.hlsQualities) {
                console.log('   HLS Data:', JSON.stringify(lesson.hlsQualities, null, 2));
              }
            });
          }
        });
      }
      
      const createdCourse = await this.courseService.createCourse(createCourseDto);
      
      console.log('\n✅ Course created successfully!');
      console.log('   Course ID:', createdCourse.id);
      console.log('🎯 ===== END COURSE CREATION =====\n');
      
      return {
        status: HttpStatus.CREATED,
        success: true,
        message: 'Course created successfully',
        data: createdCourse
      };
    } catch (error) {
      console.error('❌ Course creation failed:', error);
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          success: false,
          message: error.message || 'Failed to create course'
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  // Microservice message pattern for admin course creation
  @MessagePattern('admin.course.create')
  async createCourseMessage(createCourseDto: CreateCourseDto) {
    try {
      const createdCourse = await this.courseService.createCourse(createCourseDto);
      return {
        status: HttpStatus.CREATED,
        success: true,
        message: 'Course created successfully via admin service',
        data: createdCourse
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        success: false,
        message: error.message || 'Failed to create course via admin service'
      };
    }
  }
}