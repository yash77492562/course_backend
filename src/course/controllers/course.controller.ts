import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { CourseService } from '../services/course.service';
import { CreateCourseDto, UpdateCourseDto, CreateModuleDto, UpdateModuleDto } from '../dto/course.dto';
import { PaginationDto } from '../../pagination/dto/pagination.dto';
import { ResponseDto } from '../../common/dto/response.dto';

@Controller('courses')
export class CourseController {
  constructor(private readonly courseService: CourseService) {}

  // HTTP endpoints for direct API access
  @Get()
  async getAllCourses(@Query() paginationDto: PaginationDto) {
    const courses = await this.courseService.getAllCourses(paginationDto);
    return ResponseDto.success('Courses retrieved successfully', courses);
  }

  @Get('public')
  async getPublishedCourses(@Query() paginationDto: PaginationDto) {
    const courses = await this.courseService.getPublishedCourses(paginationDto);
    return ResponseDto.success('Published courses retrieved successfully', courses);
  }

  @Get(':id')
  async getCourseById(@Param('id') id: string) {
    const course = await this.courseService.getCourseById(id);
    return ResponseDto.success('Course retrieved successfully', course);
  }

  @Put(':id')
  async updateCourse(
    @Param('id') id: string,
    @Body() updateCourseDto: UpdateCourseDto,
  ) {
    
    // Log first lesson's HLS data if available
    const firstModule = (updateCourseDto as any).modules?.[0];
    if (firstModule?.lessons?.[0]) {
      const firstLesson = firstModule.lessons[0];
    }
    
    await this.courseService.updateCourse(id, updateCourseDto);
    return ResponseDto.success('Course updated successfully');
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteCourse(@Param('id') id: string) {
    await this.courseService.deleteCourse(id);
    return ResponseDto.success('Course deleted successfully');
  }

  @Post(':id/modules')
  @HttpCode(HttpStatus.CREATED)
  async addModuleToCourse(
    @Param('id') courseId: string,
    @Body() createModuleDto: CreateModuleDto,
  ) {
    await this.courseService.addModuleToCourse(courseId, createModuleDto);
    return ResponseDto.success('Module added successfully', null, HttpStatus.CREATED);
  }

  @Put('modules/:moduleId')
  async updateModule(
    @Param('moduleId') moduleId: string,
    @Body() updateModuleDto: UpdateModuleDto,
  ) {
    await this.courseService.updateModule(moduleId, updateModuleDto);
    return ResponseDto.success('Module updated successfully');
  }

  @Delete('modules/:moduleId')
  @HttpCode(HttpStatus.OK)
  async deleteModule(@Param('moduleId') moduleId: string) {
    await this.courseService.deleteModule(moduleId);
    return ResponseDto.success('Module deleted successfully');
  }

  @Get('lessons/:id')
  async getLessonById(@Param('id') id: string) {
    const lesson = await this.courseService.getLessonById(id);
    return ResponseDto.success('Lesson retrieved successfully', lesson);
  }

  // Microservice message patterns
  @MessagePattern('course.create')
  async createCourseMessage(createCourseDto: CreateCourseDto) {
    try {
      await this.courseService.createCourse(createCourseDto);
      return {
        status: HttpStatus.CREATED,
        success: true,
        message: 'Course created successfully'
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        success: false,
        message: error.message || 'Failed to create course'
      };
    }
  }

  @MessagePattern('course.update')
  async updateCourseMessage(payload: { id: string; data: UpdateCourseDto }) {
    try {
      await this.courseService.updateCourse(payload.id, payload.data);
      return {
        status: HttpStatus.OK,
        success: true,
        message: 'Course updated successfully'
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        success: false,
        message: error.message || 'Failed to update course'
      };
    }
  }

  @MessagePattern('course.delete')
  async deleteCourseMessage(id: string) {
    try {
      await this.courseService.deleteCourse(id);
      return {
        status: HttpStatus.OK,
        success: true,
        message: 'Course deleted successfully'
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        success: false,
        message: error.message || 'Failed to delete course'
      };
    }
  }

  @MessagePattern('course.addModule')
  async addModuleToCourseMessage(payload: { courseId: string; data: CreateModuleDto }) {
    try {
      await this.courseService.addModuleToCourse(payload.courseId, payload.data);
      return {
        status: HttpStatus.CREATED,
        success: true,
        message: 'Module added successfully'
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        success: false,
        message: error.message || 'Failed to add module'
      };
    }
  }

  @MessagePattern('course.updateModule')
  async updateModuleMessage(payload: { moduleId: string; data: UpdateModuleDto }) {
    try {
      await this.courseService.updateModule(payload.moduleId, payload.data);
      return {
        status: HttpStatus.OK,
        success: true,
        message: 'Module updated successfully'
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        success: false,
        message: error.message || 'Failed to update module'
      };
    }
  }

  @MessagePattern('course.deleteModule')
  async deleteModuleMessage(moduleId: string) {
    try {
      await this.courseService.deleteModule(moduleId);
      return {
        status: HttpStatus.OK,
        success: true,
        message: 'Module deleted successfully'
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        success: false,
        message: error.message || 'Failed to delete module'
      };
    }
  }

  @MessagePattern('course.getAll')
  async getAllCoursesMessage(paginationDto?: PaginationDto) {
    try {
      const courses = await this.courseService.getAllCourses(paginationDto);
      return {
        status: HttpStatus.OK,
        success: true,
        message: 'Courses retrieved successfully',
        data: courses
      };
    } catch (error) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: error.message || 'Failed to retrieve courses'
      };
    }
  }

  @MessagePattern('course.getPublished')
  async getPublishedCoursesMessage(paginationDto?: PaginationDto) {
    try {
      const courses = await this.courseService.getPublishedCourses(paginationDto);
      return {
        status: HttpStatus.OK,
        success: true,
        message: 'Published courses retrieved successfully',
        data: courses
      };
    } catch (error) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: error.message || 'Failed to retrieve published courses'
      };
    }
  }

  @MessagePattern('course.getById')
  async getCourseByIdMessage(id: string) {
    try {
      const course = await this.courseService.getCourseById(id);
      return {
        status: HttpStatus.OK,
        success: true,
        message: 'Course retrieved successfully',
        data: course
      };
    } catch (error) {
      return {
        status: HttpStatus.NOT_FOUND,
        success: false,
        message: error.message || 'Course not found'
      };
    }
  }

  @MessagePattern('lesson.getById')
  async getLessonByIdMessage(id: string) {
    try {
      const lesson = await this.courseService.getLessonById(id);
      return {
        status: HttpStatus.OK,
        success: true,
        message: 'Lesson retrieved successfully',
        data: lesson
      };
    } catch (error) {
      return {
        status: HttpStatus.NOT_FOUND,
        success: false,
        message: error.message || 'Lesson not found'
      };
    }
  }
}
