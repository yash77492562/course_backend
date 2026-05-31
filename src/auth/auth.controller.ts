import { Controller, Post, Get, Body, Headers, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UserService } from '../user/services/user.service';
import { RegisterUserDto, LoginUserDto } from '../user/dto/dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
  ) {}

  /**
   * Register new user
   * Returns: { success, message, data: { access_token, refresh_token } }
   */
  @Post('register')
  async register(@Body() dto: RegisterUserDto) {
    const result = await this.authService.register(dto);
    return {
      success: result.success,
      status_code: result.status,
      message: result.message,
      data: result.data,
    };
  }

  /**
   * Login user
   * Returns: { success, message, data: { access_token, refresh_token } }
   */
  @Post('login')
  async login(@Body() dto: LoginUserDto) {
    const result = await this.authService.login(dto);
    return {
      success: result.success,
      status_code: result.status,
      message: result.message,
      data: result.data,
    };
  }

  /**
   * Refresh access token
   * Returns: { success, message, data: { access_token, refresh_token } }
   */
  @Post('refresh')
  async refresh(@Body() body: { refresh_token: string }) {
    const result = await this.authService.refreshToken(body.refresh_token);
    return {
      success: result.success,
      status_code: result.status,
      message: result.message,
      data: result.data, // Contains both access_token AND refresh_token
    };
  }

  /**
   * Get user profile (requires authentication)
   * Returns: { success, message, data: UserProfileDto }
   */
  @Get('profile')
  async getProfile(@Headers('authorization') authorization: string) {
    if (!authorization || !authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException('No token provided');
    }

    const token = authorization.substring(7);
    const jwt = require('jsonwebtoken');
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.sub;
      
      const result = await this.userService.getUserDetails(userId);
      return {
        success: result.success,
        status_code: result.status,
        message: result.message,
        data: result.data,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  /**
   * Logout user (requires authentication)
   */
  @Post('logout')
  async logout(@Headers('authorization') authorization: string) {
    if (!authorization || !authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException('No token provided');
    }

    const token = authorization.substring(7);
    const jwt = require('jsonwebtoken');
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.sub;
      
      const result = await this.authService.logout(userId);
      return {
        success: result.success,
        status_code: result.status,
        message: result.message,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
