import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Query,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { CourseService } from '../course/services/course.service';
import { CourseAccessService } from '../course/services/course-access.service';
import { PaginationDto } from '../pagination/dto/pagination.dto';
import { UserAllPaymentsHandler } from '../payment/stripe/payment_filters/user_specfic/all';
import { AllPaymentsHandler } from '../payment/stripe/payment_filters/all_payments/all';
import { ContactService } from '../contact/services/contact.service';
import { PartnerService } from '../partner/partner.service';

@Controller()
export class GatewayController {
  constructor(
    private readonly courseService: CourseService,
    private readonly courseAccessService: CourseAccessService,
    private readonly userPaymentsHandler: UserAllPaymentsHandler,
    private readonly allPaymentsHandler: AllPaymentsHandler,
    private readonly contactService: ContactService,
    private readonly partnerService: PartnerService,
  ) {}

  // Course routes
  @Get('courses/public')
  async getPublishedCourses(@Query() paginationDto: PaginationDto) {
    const courses = await this.courseService.getPublishedCourses(paginationDto);
    return {
      status: HttpStatus.OK,
      success: true,
      message: 'Published courses retrieved successfully',
      data: courses
    };
  }

  // Enrollment routes - MUST come before courses/:id
  @Get('courses/access/user/purchased')
  async getUserPurchasedCourses(@Headers('authorization') authorization: string) {
    const userId = await this.validateToken(authorization);
    const result = await this.courseAccessService.getUserPurchasedCourses(userId);
    return {
      status: HttpStatus.OK,
      success: true,
      message: 'User purchased courses retrieved successfully',
      data: result
    };
  }

  @Get('courses/access/:courseId')
  async checkCourseAccess(
    @Param('courseId') courseId: string,
    @Headers('authorization') authorization: string,
  ) {
    const userId = await this.validateToken(authorization);
    const result = await this.courseAccessService.checkUserCourseAccess(userId, courseId);
    return {
      status: HttpStatus.OK,
      success: true,
      message: 'Course access checked successfully',
      data: result
    };
  }

  @Get('courses')
  async getAllCourses(@Query() paginationDto: PaginationDto) {
    const courses = await this.courseService.getAllCourses(paginationDto);
    return {
      status: HttpStatus.OK,
      success: true,
      message: 'Courses retrieved successfully',
      data: courses
    };
  }

  @Get('courses/:id')
  async getCourseById(@Param('id') id: string) {
    const course = await this.courseService.getCourseById(id);
    return {
      status: HttpStatus.OK,
      success: true,
      message: 'Course retrieved successfully',
      data: course
    };
  }

  @Put('courses/:id')
  async updateCourse(@Param('id') id: string, @Body() updateData: any) {
    await this.courseService.updateCourse(id, updateData);
    return {
      status: HttpStatus.OK,
      success: true,
      message: 'Course updated successfully'
    };
  }

  @Delete('courses/:id')
  @HttpCode(HttpStatus.OK)
  async deleteCourse(@Param('id') id: string) {
    await this.courseService.deleteCourse(id);
    return {
      status: HttpStatus.OK,
      success: true,
      message: 'Course deleted successfully'
    };
  }

  // Lesson endpoint for video player
  @Get('lessons/:id')
  async getLessonById(@Param('id') id: string) {
    const lesson = await this.courseService.getLessonById(id);
    return {
      status: HttpStatus.OK,
      success: true,
      message: 'Lesson retrieved successfully',
      data: lesson
    };
  }

  // Payment history endpoint
  @Get('payments/user/all')
  async getUserPaymentHistory(
    @Headers('authorization') authorization: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const userId = await this.validateToken(authorization);
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 50;
    
    const result = await this.userPaymentsHandler.getUserAllTransactions(userId, pageNum, limitNum);
    return {
      status: HttpStatus.OK,
      success: true,
      message: 'Payment history retrieved successfully',
      data: result
    };
  }

  // Admin course creation
  @Post('admin/courses')
  @HttpCode(HttpStatus.CREATED)
  async createCourse(@Body() createData: any) {
    await this.courseService.createCourse(createData);
    return {
      status: HttpStatus.CREATED,
      success: true,
      message: 'Course created successfully'
    };
  }

  // Admin - Get all contacts
  @Get('admin/contacts')
  async getAllContacts(@Query('status') status?: string) {
    const result = await this.contactService.getAllContacts(status);
    return {
      status: HttpStatus.OK,
      success: true,
      message: 'Contacts retrieved successfully',
      data: result.data
    };
  }

  // Admin - Update contact status
  @Put('admin/contacts/:id/status')
  async updateContactStatus(
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
    const result = await this.contactService.updateContactStatus(id, status);
    return {
      status: HttpStatus.OK,
      success: true,
      message: result.message,
      data: result.data
    };
  }

  // Admin - Get all partners
  @Get('admin/partners')
  async getAllPartners(@Query('status') status?: string) {
    const partners = await this.partnerService.getAllPartners(status);
    return {
      status: HttpStatus.OK,
      success: true,
      message: 'Partners retrieved successfully',
      data: partners
    };
  }

  // Admin - Update partner status
  @Put('admin/partners/:id/status')
  async updatePartnerStatus(
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
    const partner = await this.partnerService.updatePartnerStatus(id, status);
    return {
      status: HttpStatus.OK,
      success: true,
      message: 'Partner status updated successfully',
      data: partner
    };
  }

  // Admin - Get all payments
  @Get('admin/payments')
  async getAllPayments(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 50;
    
    const result = await this.allPaymentsHandler.getAllTransactions(pageNum, limitNum);
    return {
      status: HttpStatus.OK,
      success: true,
      message: 'All payments retrieved successfully',
      data: result
    };
  }

  // Admin - Get all orders (same as payments but with different endpoint name)
  @Get('admin/orders')
  async getAllOrders(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 50;
    
    const result = await this.allPaymentsHandler.getAllTransactions(pageNum, limitNum);
    return {
      status: HttpStatus.OK,
      success: true,
      message: 'All orders retrieved successfully',
      data: result
    };
  }

  // Token validation helper
  private async validateToken(authorization: string): Promise<string> {
    if (!authorization || !authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException('No token provided');
    }

    const token = authorization.substring(7);
    
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      return decoded.sub; // User ID
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}