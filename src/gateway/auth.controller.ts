import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  Headers,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { RegisterUserDto, LoginUserDto, RefreshTokenDto } from '../user/dto/dto';
import { RedisService } from '../redis/redis.service';
import { UserService } from '../user/services/user.service';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(RedisService) private redis: RedisService,
    private userService: UserService,
  ) {}

  /**
   * Register new user
   * POST /api/auth/register
   * Returns only tokens - client must call /auth/profile to get user details
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterUserDto) {
    try {
      const result = await this.userService.register(dto);

      if (!result.success) {
        return {
          success: false,
          status_code: result.status,
          message: result.message,
        };
      }

      // Only return tokens - no user data or userId
      return {
        success: true,
        status_code: HttpStatus.CREATED,
        message: result.message,
        data: {
          access_token: result.data.access_token,
          refresh_token: result.data.refresh_token,
        },
      };
    } catch (error) {
      console.error('Register error:', error);
      return {
        success: false,
        status_code: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Registration failed. Please try again.',
      };
    }
  }

  /**
   * Login user
   * POST /api/auth/login
   * Returns only tokens - client must call /auth/profile to get user details
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginUserDto) {
    try {
      const result = await this.userService.login(dto);

      if (!result.success) {
        return {
          success: false,
          status_code: result.status,
          message: result.message,
        };
      }

      // Only return tokens - no user data or userId
      return {
        success: true,
        status_code: HttpStatus.OK,
        message: result.message,
        data: {
          access_token: result.data.access_token,
          refresh_token: result.data.refresh_token,
        },
      };
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        status_code: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Login failed. Please try again.',
      };
    }
  }

  /**
   * Refresh access token
   * POST /api/auth/refresh
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshToken(@Body() dto: RefreshTokenDto) {
    try {
      const result = await this.userService.refreshToken(dto.refreshToken);

      if (!result.success) {
        throw new UnauthorizedException(result.message);
      }

      return {
        success: true,
        status_code: HttpStatus.OK,
        message: result.message,
        data: {
          access_token: result.data.access_token,
        },
      };
    } catch (error) {
      console.error('Refresh token error:', error);
      throw new UnauthorizedException('Session expired. Please login again.');
    }
  }

  /**
   * Get current user profile (requires access_token)
   * GET /api/auth/profile
   * Headers: Authorization: Bearer <access_token>
   * Validates JTI to prevent old token usage
   */
  @Get('profile')
  async getProfile(@Headers('authorization') authorization: string) {
    try {
      if (!authorization || !authorization.startsWith('Bearer ')) {
        throw new UnauthorizedException('No token provided');
      }

      const token = authorization.substring(7);
      
      // Decode JWT to get user ID and JTI
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Validate JTI (JWT ID) - ensures only latest token is valid
      if (decoded.jti) {
        const storedJti = await this.redis.get(`access_token:${decoded.sub}`);

        if (!storedJti) {
          console.log(`⚠️ No JTI found in Redis for user: ${decoded.sub}`);
        } else if (storedJti !== decoded.jti) {
          console.log(`❌ Invalid JTI - Token: ${decoded.jti}, Stored: ${storedJti}`);
          throw new UnauthorizedException('Token has been invalidated. Please refresh your session.');
        } else {
          console.log(`✅ Valid JTI: ${decoded.jti}`);
        }
      }

      // Get user details
      const result = await this.userService.getUserDetails(decoded.sub);

      if (!result.success) {
        throw new UnauthorizedException(result.message);
      }

      return {
        success: true,
        status_code: HttpStatus.OK,
        message: result.message,
        data: result.data,
      };
    } catch (error) {
      console.error('Get profile error:', error);
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  /**
   * Logout
   * POST /api/auth/logout
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Headers('authorization') authorization: string) {
    try {
      return {
        success: true,
        status_code: HttpStatus.OK,
        message: 'Logged out successfully',
      };
    } catch (error) {
      return {
        success: true,
        status_code: HttpStatus.OK,
        message: 'Logged out successfully',
      };
    }
  }
}
