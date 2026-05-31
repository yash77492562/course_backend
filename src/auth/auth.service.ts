import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../database/prisma/service/prisma.service';
import { RedisService } from '../redis/redis.service';
import { Argon2Service } from '../security/argon2/service';
import { RegisterUserDto, LoginUserDto, UserProfileDto } from '../user/dto/dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private redis: RedisService,
    private argon2: Argon2Service,
    private config: ConfigService,
  ) {}

  /**
   * SHA256 hash function for refresh tokens
   */
  private sha256(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Register new user
   * Returns only tokens, NO user details
   */
  async register(dto: RegisterUserDto): Promise<{ 
    success: boolean; 
    status: number; 
    message: string; 
    data?: { access_token: string; refresh_token: string } 
  }> {
    try {
      console.log(`\n🎯 ========== USER REGISTRATION ==========`);
      console.log(`📧 Email: ${dto.email}`);
      
      // Rate limiting
      const rateLimitKey = `register:${dto.email}`;
      const rateLimit = await this.redis.checkRateLimit(rateLimitKey, 3, 900);
      
      if (!rateLimit.allowed) {
        return {
          success: false,
          status: 429,
          message: 'Too many registration attempts. Please try again in 15 minutes.',
        };
      }

      // Check Redis cache for existing user
      console.log(`🔍 Checking Redis for existing user...`);
      const emailCacheKey = `user:email:${dto.email}`;
      const cachedUserId = await this.redis.get(emailCacheKey);
      
      if (cachedUserId) {
        console.log(`❌ User exists in cache: ${cachedUserId}`);
        return {
          success: false,
          status: 400,
          message: 'An account with this email already exists.',
        };
      }

      // Check database
      console.log(`🔍 Checking database for existing user...`);
      const existingUser = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });

      if (existingUser) {
        await this.redis.set(emailCacheKey, existingUser.id, 900);
        console.log(`❌ User exists in database: ${existingUser.id}`);
        return {
          success: false,
          status: 400,
          message: 'An account with this email already exists.',
        };
      }

      // Create user
      console.log(`📝 Creating user in database...`);
      const hashedPassword = await this.argon2.hashPassword(dto.password);

      const newUser = await this.prisma.user.create({
        data: {
          email: dto.email,
          password: hashedPassword,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
        },
      });
      console.log(`✅ User created: ${newUser.id}`);

      // Cache user data
      console.log(`💾 Caching user data in Redis...`);
      await this.redis.set(emailCacheKey, newUser.id, 900);
      
      const userProfile: UserProfileDto = {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        phone: newUser.phone,
        avatar: newUser.avatar,
        role: newUser.role,
      };
      await this.redis.set(`user:profile:${newUser.id}`, userProfile, 900);
      console.log(`✅ User cached in Redis`);

      // Generate tokens
      const { accessToken, refreshToken } = await this.generateTokens(newUser.id, newUser.email);

      // Store refresh token hash in database
      const refreshTokenHash = this.sha256(refreshToken);
      await this.prisma.user.update({
        where: { id: newUser.id },
        data: { refreshToken: refreshTokenHash },
      });

      console.log(`🎯 ========== REGISTRATION COMPLETE ==========\n`);

      return {
        success: true,
        status: 201,
        message: 'Your account has been created successfully!',
        data: {
          access_token: accessToken,
          refresh_token: refreshToken,
        },
      };
    } catch (error) {
      console.error('Registration error:', error);
      return {
        success: false,
        status: 500,
        message: 'Registration failed. Please try again.',
      };
    }
  }

  /**
   * Login user
   * Returns only tokens, NO user details
   */
  async login(dto: LoginUserDto): Promise<{ 
    success: boolean; 
    status: number; 
    message: string; 
    data?: { access_token: string; refresh_token: string } 
  }> {
    try {
      console.log(`\n🎯 ========== USER LOGIN ==========`);
      console.log(`📧 Email: ${dto.email}`);

      // Rate limiting
      const rateLimitKey = `login:${dto.email}`;
      const rateLimit = await this.redis.checkRateLimit(rateLimitKey, 5, 900);
      
      if (!rateLimit.allowed) {
        return {
          success: false,
          status: 429,
          message: 'Too many login attempts. Please try again in 15 minutes.',
        };
      }

      // Find user
      const user = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });

      if (!user) {
        return {
          success: false,
          status: 401,
          message: 'Invalid email or password.',
        };
      }

      // Verify password
      const isPasswordValid = await this.argon2.verifyPassword(user.password, dto.password);
      if (!isPasswordValid) {
        return {
          success: false,
          status: 401,
          message: 'Invalid email or password.',
        };
      }

      // Check if active
      if (!user.isActive) {
        return {
          success: false,
          status: 403,
          message: 'Your account has been suspended.',
        };
      }

      // Cache user profile if not already cached
      const profileCacheKey = `user:profile:${user.id}`;
      const cachedProfile = await this.redis.get(profileCacheKey);
      
      if (!cachedProfile) {
        console.log(`💾 Caching user profile...`);
        const userProfile: UserProfileDto = {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          avatar: user.avatar,
          role: user.role,
        };
        await this.redis.set(profileCacheKey, userProfile, 900);
        
        // Also cache email mapping
        await this.redis.set(`user:email:${user.email}`, user.id, 900);
      }

      // Generate tokens
      const { accessToken, refreshToken } = await this.generateTokens(user.id, user.email);

      // Store refresh token hash in database
      const refreshTokenHash = this.sha256(refreshToken);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { refreshToken: refreshTokenHash },
      });

      console.log(`🎯 ========== LOGIN COMPLETE ==========\n`);

      return {
        success: true,
        status: 200,
        message: 'Welcome back!',
        data: {
          access_token: accessToken,
          refresh_token: refreshToken,
        },
      };
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        status: 500,
        message: 'Login failed. Please try again.',
      };
    }
  }

  /**
   * Refresh access token
   * Returns NEW access token AND NEW refresh token (token rotation)
   */
  async refreshToken(refreshToken: string): Promise<{ 
    success: boolean; 
    status: number; 
    message: string; 
    data?: { access_token: string; refresh_token: string } 
  }> {
    try {
      // Hash the provided refresh token
      const refreshTokenHash = this.sha256(refreshToken);
      
      // Find user with this refresh token hash
      const user = await this.prisma.user.findFirst({
        where: { 
          refreshToken: refreshTokenHash,
          isActive: true,
        },
      });

      if (!user) {
        return {
          success: false,
          status: 401,
          message: 'Invalid or expired refresh token. Please log in again.',
        };
      }

      // Generate NEW tokens (token rotation)
      const { accessToken: newAccessToken, refreshToken: newRefreshToken } = 
        await this.generateTokens(user.id, user.email);

      // Store NEW refresh token hash (invalidates old one)
      const newRefreshTokenHash = this.sha256(newRefreshToken);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { refreshToken: newRefreshTokenHash },
      });

      console.log(`✅ Token refreshed and rotated for user: ${user.id}`);

      return {
        success: true,
        status: 200,
        message: 'Token refreshed successfully.',
        data: { 
          access_token: newAccessToken,
          refresh_token: newRefreshToken, // Return new refresh token
        },
      };
    } catch (error) {
      console.error('Refresh token error:', error);
      return {
        success: false,
        status: 401,
        message: 'Session expired. Please log in again.',
      };
    }
  }

  /**
   * Logout user
   */
  async logout(userId: string): Promise<{ success: boolean; status: number; message: string }> {
    try {
      // Clear tokens from Redis
      await this.redis.del(`access_token:${userId}`);
      await this.redis.del(`session:${userId}`);

      // Clear refresh token from database
      await this.prisma.user.update({
        where: { id: userId },
        data: { refreshToken: null },
      });

      return {
        success: true,
        status: 200,
        message: 'Logged out successfully.',
      };
    } catch (error) {
      console.error('Logout error:', error);
      return {
        success: false,
        status: 500,
        message: 'Logout failed.',
      };
    }
  }

  /**
   * Generate access and refresh tokens
   * Access token: JWT (short-lived)
   * Refresh token: Random bytes (long-lived)
   */
  private async generateTokens(userId: string, email: string): Promise<{ accessToken: string; refreshToken: string }> {
    const jti = `${userId}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const payload = { 
      sub: userId, 
      email,
      jti,
      iat: Math.floor(Date.now() / 1000),
    };

    // Access token: JWT
    const accessToken = this.jwtService.sign(payload, { 
      expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN'),
      secret: this.config.get('JWT_SECRET'),
    });

    // Refresh token: Random bytes (NOT JWT)
    const refreshToken = crypto.randomBytes(64).toString('hex');

    // Store JTI in Redis for access token validation
    await this.redis.set(`access_token:${userId}`, jti, 900); // 15 min

    // Store session data
    const sessionData = {
      userId,
      email,
      loginTime: new Date().toISOString(),
      jti,
    };
    await this.redis.set(`session:${userId}`, sessionData, 900); // 15 min

    return { accessToken, refreshToken };
  }
}
