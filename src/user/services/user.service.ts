import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../../database/prisma/service/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { Argon2Service } from '../../security/argon2/service';
import { EncryptionService } from '../../security/encryption/service';
import { RegisterUserDto, LoginUserDto, UserProfileDto } from '../dto/dto';

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private redis: RedisService, // Keep for rate limiting
    @Inject(CACHE_MANAGER) private cacheManager: Cache, // Use NestJS Cache Manager
    private argon2: Argon2Service,
    private encryption: EncryptionService,
    private config: ConfigService,
  ) {}

  // User Registration Service
  async register(dto: RegisterUserDto): Promise<{ success: boolean; status: number; message: string; data?: { access_token: string; refresh_token: string } }> {
    try {
      console.log(`\n🎯 ========== USER REGISTRATION ==========`);
      console.log(`📧 Email: ${dto.email}`);
      
      // Check rate limiting
      const rateLimitKey = `register:${dto.email}`;
      const rateLimit = await this.redis.checkRateLimit(rateLimitKey, 3, 900);
      
      if (!rateLimit.allowed) {
        return {
          success: false,
          status: 429,
          message: 'Too many registration attempts. Please try again in 15 minutes.',
        };
      }

      // STEP 1: Check Redis cache for existing user (fast check)
      console.log(`🔍 Step 1: Checking Redis for existing user...`);
      const emailCacheKey = `user:email:${dto.email}`;
      const cachedUserId = await this.redis.get(emailCacheKey);
      
      if (cachedUserId) {
        console.log(`❌ User exists in cache: ${cachedUserId}`);
        return {
          success: false,
          status: 400,
          message: 'An account with this email already exists. Please try logging in instead.',
        };
      }

      // STEP 2: Check database for existing user (fallback)
      console.log(`🔍 Step 2: Checking database for existing user...`);
      const existingUser = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });

      if (existingUser) {
        // Cache the email → userId mapping for future checks
        await this.redis.set(emailCacheKey, existingUser.id, 900);
        console.log(`❌ User exists in database: ${existingUser.id}`);
        return {
          success: false,
          status: 400,
          message: 'An account with this email already exists. Please try logging in instead.',
        };
      }

      // STEP 3: Create user in database
      console.log(`📝 Step 3: Creating user in database...`);
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
      console.log(`✅ User created in database: ${newUser.id}`);

      // STEP 4: Cache user data in Redis
      console.log(`💾 Step 4: Caching user data in Redis...`);
      
      // Cache email → userId mapping (for duplicate check)
      await this.redis.set(emailCacheKey, newUser.id, 900);
      console.log(`✅ Cached: ${emailCacheKey}`);
      
      // Cache user profile
      const userProfile = {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        phone: newUser.phone,
        avatar: newUser.avatar,
        role: newUser.role,
      };
      await this.redis.set(`user:profile:${newUser.id}`, userProfile, 900);
      console.log(`✅ Cached: user:profile:${newUser.id}`);

      // Generate tokens
      const now = Math.floor(Date.now() / 1000);
      const accessJti = `access_${newUser.id}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const refreshJti = `refresh_${newUser.id}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      // Access token payload (1 hour)
      const accessPayload = { 
        sub: newUser.id, 
        email: newUser.email,
        jti: accessJti,
        iat: now,
      };
      
      // Refresh token payload (7 days)
      const refreshPayload = { 
        sub: newUser.id, 
        email: newUser.email,
        jti: refreshJti,
        iat: now,
      };
      
      const accessToken = this.jwtService.sign(accessPayload, { 
        expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN'), // '1h'
        secret: this.config.get('JWT_SECRET'),
      });
      
      const refreshToken = this.jwtService.sign(refreshPayload, { 
        expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN'), // '7d'
        secret: this.config.get('JWT_SECRET'),
      });
      
      // Log token info for debugging
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔑 TOKEN GENERATION (REGISTER)');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('Access Token:');
      console.log(`  JTI: ${accessJti}`);
      console.log(`  Expires in: ${this.config.get('JWT_ACCESS_EXPIRES_IN')}`);
      console.log('Refresh Token:');
      console.log(`  JTI: ${refreshJti}`);
      console.log(`  Expires in: ${this.config.get('JWT_REFRESH_EXPIRES_IN')}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // Store JTI and session
      await this.redis.set(`access_token:${newUser.id}`, accessJti, 120);
      
      const encryptedRefreshToken = this.encryption.encrypt(refreshToken);
      await this.prisma.user.update({
        where: { id: newUser.id },
        data: { refreshToken: encryptedRefreshToken },
      });

      const sessionData = this.encryption.encryptObject({
        userId: newUser.id,
        email: newUser.email,
        registerTime: new Date().toISOString(),
      });
      await this.redis.set(`session:${newUser.id}`, sessionData, 3600);

      console.log(`🎯 ========== REGISTRATION COMPLETE ==========\n`);

      return {
        success: true,
        status: 201,
        message: 'Your account has been created successfully! You are now logged in.',
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
        message: 'Something went wrong while creating your account. Please try again.',
      };
    }
  }

  // User Login Service
  async login(dto: LoginUserDto): Promise<{ success: boolean; status: number; message: string; data?: { access_token: string; refresh_token: string } }> {
    try {
      // Check rate limiting
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
          message: 'Invalid email or password. Please check your credentials and try again.',
        };
      }

      // Verify password with Argon2
      const isPasswordValid = await this.argon2.verifyPassword(user.password, dto.password);
      if (!isPasswordValid) {
        return {
          success: false,
          status: 401,
          message: 'Invalid email or password. Please check your credentials and try again.',
        };
      }

      // Check if user is active
      if (!user.isActive) {
        return {
          success: false,
          status: 403,
          message: 'Your account has been suspended. Please contact support for assistance.',
        };
      }

      // Generate tokens with unique JTI (JWT ID)
      const now = Math.floor(Date.now() / 1000);
      const accessJti = `access_${user.id}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const refreshJti = `refresh_${user.id}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      // Access token payload (1 hour)
      const accessPayload = { 
        sub: user.id, 
        email: user.email,
        jti: accessJti,
        iat: now,
      };
      
      // Refresh token payload (7 days)
      const refreshPayload = { 
        sub: user.id, 
        email: user.email,
        jti: refreshJti,
        iat: now,
      };
      
      const accessToken = this.jwtService.sign(accessPayload, { 
        expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN'), // '1h'
        secret: this.config.get('JWT_SECRET'),
      });
      
      const refreshToken = this.jwtService.sign(refreshPayload, { 
        expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN'), // '7d'
        secret: this.config.get('JWT_SECRET'),
      });
      
      // Log token info for debugging
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔑 TOKEN GENERATION');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('Access Token:');
      console.log(`  JTI: ${accessJti}`);
      console.log(`  Expires in: ${this.config.get('JWT_ACCESS_EXPIRES_IN')}`);
      console.log('Refresh Token:');
      console.log(`  JTI: ${refreshJti}`);
      console.log(`  Expires in: ${this.config.get('JWT_REFRESH_EXPIRES_IN')}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // Store the latest JTI in Redis
      await this.redis.set(`access_token:${user.id}`, accessJti, 120);
      console.log(`✅ Access token JTI stored in Redis`);

      // Encrypt refresh token before storing
      const encryptedRefreshToken = this.encryption.encrypt(refreshToken);

      // Store encrypted refresh token in database
      await this.prisma.user.update({
        where: { id: user.id },
        data: { refreshToken: encryptedRefreshToken },
      });

      // Cache user session in Redis (encrypted)
      const sessionData = this.encryption.encryptObject({
        userId: user.id,
        email: user.email,
        loginTime: new Date().toISOString(),
      });
      await this.redis.set(`session:${user.id}`, sessionData, 3600);

      return {
        success: true,
        status: 200,
        message: 'Welcome back! You have been logged in successfully.',
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
        message: 'Something went wrong while logging you in. Please try again.',
      };
    }
  }

  // Get User Details Service
  async getUserDetails(userId: string): Promise<{ success: boolean; status: number; message: string; data?: UserProfileDto }> {
    try {
      const cacheKey = `user:profile:${userId}`;
      
      console.log(`\n🎯 ========== USER PROFILE REQUEST ==========`);
      console.log(`👤 User ID: ${userId}`);
      console.log(`🔑 Cache key: ${cacheKey}`);
      
      // Use Redis getOrSet for automatic caching
      const userProfile = await this.redis.getOrSet<UserProfileDto>(
        cacheKey,
        async () => {
          // Fetch from database
          const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              phone: true,
              avatar: true,
              role: true,
            },
          });

          if (!user) {
            throw new Error('User not found');
          }

          return user as UserProfileDto;
        },
        900 // 15 minutes TTL
      );

      console.log(`🎯 ========== USER PROFILE COMPLETE ==========\n`);

      return {
        success: true,
        status: 200,
        message: 'User profile retrieved successfully.',
        data: userProfile,
      };
    } catch (error) {
      console.error('Get user details error:', error);
      
      if (error.message === 'User not found') {
        return {
          success: false,
          status: 404,
          message: 'User not found. Please make sure you are logged in.',
        };
      }
      
      return {
        success: false,
        status: 500,
        message: 'Unable to retrieve your profile at the moment. Please try again.',
      };
    }
  }

  // Invalidate user profile cache (call this on profile update)
  async invalidateUserProfileCache(userId: string): Promise<void> {
    console.log(`\n🗑️  ========== INVALIDATING USER CACHE ==========`);
    console.log(`👤 User ID: ${userId}`);
    
    await this.redis.del(`user:profile:${userId}`);
    console.log(`✅ Deleted cache: user:profile:${userId}`);
    
    console.log(`🗑️  ========== CACHE INVALIDATION COMPLETE ==========\n`);
  }

  // Update User Profile Service
  async updateUserProfile(userId: string, updateData: Partial<Omit<UserProfileDto, 'id' | 'role'>>): Promise<{ success: boolean; status: number; message: string; data?: UserProfileDto }> {
    try {
      console.log(`\n🔄 ========== UPDATING USER PROFILE ==========`);
      console.log(`👤 User ID: ${userId}`);
      console.log(`📝 Update data:`, updateData);

      // STEP 1: Update in database
      console.log(`📝 Step 1: Updating database...`);
      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: {
          firstName: updateData.firstName,
          lastName: updateData.lastName,
          phone: updateData.phone,
          avatar: updateData.avatar,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          avatar: true,
          role: true,
        },
      });
      console.log(`✅ Database updated`);

      // STEP 2: Try partial cache update
      console.log(`🔄 Step 2: Attempting partial cache update...`);
      const cacheKey = `user:profile:${userId}`;
      const success = await this.updateUserInCache(userId, updateData);

      if (success) {
        console.log(`✅ Partial cache update successful`);
      } else {
        console.log(`⚠️  Partial update failed, invalidating cache...`);
        // Delete cache - next request will fetch fresh data
        await this.redis.del(cacheKey);
        console.log(`✅ Cache invalidated: ${cacheKey}`);
      }

      console.log(`🔄 ========== UPDATE COMPLETE ==========\n`);

      return {
        success: true,
        status: 200,
        message: 'Profile updated successfully.',
        data: updatedUser as UserProfileDto,
      };
    } catch (error) {
      console.error('Update user profile error:', error);
      return {
        success: false,
        status: 500,
        message: 'Unable to update your profile. Please try again.',
      };
    }
  }

  /**
   * Try to update user data in cache partially (only changed fields)
   * Returns true if successful, false if cache needs to be invalidated
   */
  private async updateUserInCache(userId: string, updatedFields: Partial<Omit<UserProfileDto, 'id' | 'role'>>): Promise<boolean> {
    try {
      const cacheKey = `user:profile:${userId}`;
      
      // Get current cached data
      const cachedUser = await this.redis.get(cacheKey);
      
      if (!cachedUser) {
        console.log(`   ℹ️  No cache found for ${cacheKey}`);
        return false;
      }

      // Merge updated fields with cached data
      const updatedUser = {
        ...cachedUser,
        ...updatedFields,
      };

      // Save updated user back to cache with 15-minute TTL
      await this.redis.set(cacheKey, updatedUser, 900);
      console.log(`   ✅ Updated cache: ${cacheKey}`);

      return true;
    } catch (error) {
      console.error(`   ❌ Partial cache update failed:`, error.message);
      return false;
    }
  }

  // Refresh Token Service
  async refreshToken(refreshToken: string): Promise<{ success: boolean; status: number; message: string; data?: { access_token: string } }> {
    try {
      // Verify refresh token
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.config.get('JWT_SECRET'),
      });
      
      // Find user and decrypt stored refresh token
      const user = await this.prisma.user.findFirst({
        where: { 
          id: payload.sub,
          isActive: true,
        },
      });

      if (!user || !user.refreshToken) {
        return {
          success: false,
          status: 401,
          message: 'Your session has expired. Please log in again.',
        };
      }

      // Decrypt stored refresh token and compare
      const decryptedStoredToken = this.encryption.decrypt(user.refreshToken);
      if (decryptedStoredToken !== refreshToken) {
        return {
          success: false,
          status: 401,
          message: 'Invalid refresh token. Please log in again.',
        };
      }

      // Generate new access token with unique JTI (JWT ID)
      const now = Math.floor(Date.now() / 1000);
      const accessJti = `access_${user.id}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      const newPayload = { 
        sub: user.id, 
        email: user.email,
        jti: accessJti, // Unique token ID
        iat: now, // Issued at
      };
      
      const accessToken = this.jwtService.sign(newPayload, { 
        expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN'), // '1h'
        secret: this.config.get('JWT_SECRET'),
      });
      
      // Log token info for debugging
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔄 TOKEN REFRESH');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('New Access Token:');
      console.log(`  JTI: ${accessJti}`);
      console.log(`  Expires in: ${this.config.get('JWT_ACCESS_EXPIRES_IN')}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // Store the latest JTI in Redis (invalidates old tokens)
      await this.redis.set(`access_token:${user.id}`, accessJti, 120); // 2 minutes (longer than token expiry)
      console.log(`✅ New access token JTI stored in Redis`);

      // Update user session in Redis (encrypted)
      const sessionData = this.encryption.encryptObject({
        userId: user.id,
        email: user.email,
        refreshTime: new Date().toISOString(),
        jti: accessJti,
      });
      await this.redis.set(`session:${user.id}`, sessionData, 3600);

      return {
        success: true,
        status: 200,
        message: 'Access token refreshed successfully.',
        data: { 
          access_token: accessToken 
        },
      };
    } catch (error) {
      console.error('Refresh token error:', error);
      return {
        success: false,
        status: 401,
        message: 'Your session has expired. Please log in again.',
      };
    }
  }
}