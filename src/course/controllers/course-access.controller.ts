import { Controller, Get, Param, Headers, UnauthorizedException } from '@nestjs/common';
import { CourseAccessService } from '../services/course-access.service';
import { ResponseDto } from '../../common/dto/response.dto';

/**
 * Controller for checking course access and purchase status
 * Provides a single source of truth for access control
 */
@Controller('course-access')
export class CourseAccessController {
  constructor(private readonly courseAccessService: CourseAccessService) {}

  /**
   * Get all courses the user has purchased
   * Returns: { courseIds: string[] }
   * NOTE: This must come BEFORE the :courseId route to avoid conflicts
   */
  @Get('user/purchased')
  async getUserPurchasedCourses(@Headers('authorization') authorization: string) {
    // Validate JWT token
    const userId = await this.validateToken(authorization);
    const result = await this.courseAccessService.getUserPurchasedCourses(userId);
    return ResponseDto.success('User purchased courses retrieved successfully', result);
  }

  /**
   * Check if the authenticated user has purchased/has access to a specific course
   * Returns: { hasAccess: boolean, reason: string }
   */
  @Get('check/:courseId')
  async checkCourseAccess(
    @Param('courseId') courseId: string,
    @Headers('authorization') authorization: string,
  ) {
    // Validate JWT token
    const userId = await this.validateToken(authorization);
    const result = await this.courseAccessService.checkUserCourseAccess(userId, courseId);
    return ResponseDto.success('Course access checked successfully', result);
  }

  /**
   * Validate JWT token and extract user ID
   */
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
