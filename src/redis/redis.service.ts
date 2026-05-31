import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  public client: Redis; // Changed from private to public for upload lock service

  async onModuleInit() {
    console.log('\n🔧 ========== REDIS INITIALIZATION START ==========');
    console.log(`📍 Redis config: ${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`);
    console.log(`🔑 Redis password: ${process.env.REDIS_PASSWORD ? '***SET***' : 'NONE'}`);
    
    try {
      console.log('🔌 Creating Redis client instance...');
      this.client = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        lazyConnect: false, // Changed to false - connect immediately
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
      });

      console.log(`✅ Redis client instance created: ${!!this.client}`);
      console.log(`🔍 Client type: ${typeof this.client}`);
      console.log(`🔍 Client constructor: ${this.client?.constructor?.name}`);

      this.client.on('error', (err) => {
        console.error('❌ Redis connection error:', err.message);
      });

      this.client.on('connect', () => {
        console.log('✅ Connected to Redis');
      });

      this.client.on('ready', () => {
        console.log('✅ Redis is ready');
        console.log('🎯 Redis client status: ACTIVE');
        console.log(`🔍 this.client is: ${!!this.client ? 'SET' : 'NULL'}`);
      });

      this.client.on('close', () => {
        console.log('⚠️ Redis connection closed');
      });

      this.client.on('reconnecting', () => {
        console.log('🔄 Reconnecting to Redis...');
      });

      // Wait for connection to be ready
      console.log('⏳ Waiting for Redis to be ready...');
      await new Promise((resolve, reject) => {
        this.client.once('ready', resolve);
        this.client.once('error', reject);
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });

      console.log('✅ Redis connection established successfully');
      console.log(`🔍 After connection - this.client is: ${!!this.client ? 'SET' : 'NULL'}`);
      console.log('🎯 Client is ready for caching operations');
      
      // Test the connection
      console.log('🏓 Testing PING...');
      const pong = await this.client.ping();
      console.log(`✅ Redis PING successful: ${pong}`);
      
      // Test a simple SET/GET
      console.log('🧪 Testing simple SET/GET...');
      await this.client.set('test:init', 'initialized');
      const testValue = await this.client.get('test:init');
      console.log(`✅ Test SET/GET successful: ${testValue}`);
      await this.client.del('test:init');
      
      console.log('🔧 ========== REDIS INITIALIZATION COMPLETE ==========\n');
      
    } catch (error) {
      console.error('\n❌ ========== REDIS INITIALIZATION FAILED ==========');
      console.error('⚠️ Redis connection failed:', error.message);
      console.error('⚠️ Stack:', error.stack);
      console.error('⚠️ Continuing without cache...');
      console.error('❌ ========== REDIS INITIALIZATION FAILED ==========\n');
      this.client = null;
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      try {
        await this.client.disconnect();
        console.log('❌ Disconnected from Redis');
      } catch (error) {
        console.error('⚠️ Error disconnecting from Redis:', error.message);
      }
    }
  }

  // Cache user session data
  async setUserSession(userId: string, sessionData: any, ttl: number = 3600): Promise<void> {
    if (!this.client) return; // Gracefully handle when Redis is not available
    
    try {
      const key = `user:session:${userId}`;
      await this.client.setex(key, ttl, JSON.stringify(sessionData));
    } catch (error) {
      console.error('⚠️ Redis setUserSession error:', error.message);
    }
  }

  async getUserSession(userId: string): Promise<any | null> {
    if (!this.client) return null; // Gracefully handle when Redis is not available
    
    try {
      const key = `user:session:${userId}`;
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('⚠️ Redis getUserSession error:', error.message);
      return null;
    }
  }

  async deleteUserSession(userId: string): Promise<void> {
    if (!this.client) return; // Gracefully handle when Redis is not available
    
    try {
      const key = `user:session:${userId}`;
      await this.client.del(key);
    } catch (error) {
      console.error('⚠️ Redis deleteUserSession error:', error.message);
    }
  }

  // Cache user profile data
  async setUserProfile(userId: string, profileData: any, ttl: number = 1800): Promise<void> {
    if (!this.client) return; // Gracefully handle when Redis is not available
    
    try {
      const key = `user:profile:${userId}`;
      await this.client.setex(key, ttl, JSON.stringify(profileData));
    } catch (error) {
      console.error('⚠️ Redis setUserProfile error:', error.message);
    }
  }

  async getUserProfile(userId: string): Promise<any | null> {
    if (!this.client) return null; // Gracefully handle when Redis is not available
    
    try {
      const key = `user:profile:${userId}`;
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('⚠️ Redis getUserProfile error:', error.message);
      return null;
    }
  }

  async deleteUserProfile(userId: string): Promise<void> {
    if (!this.client) return; // Gracefully handle when Redis is not available
    
    try {
      const key = `user:profile:${userId}`;
      await this.client.del(key);
    } catch (error) {
      console.error('⚠️ Redis deleteUserProfile error:', error.message);
    }
  }

  // Rate limiting
  async checkRateLimit(identifier: string, limit: number = 5, window: number = 300): Promise<{ allowed: boolean; remaining: number }> {
    if (!this.client) {
      // When Redis is not available, allow all requests (no rate limiting)
      return { allowed: true, remaining: limit };
    }
    
    try {
      const key = `rate:${identifier}`;
      const current = await this.client.incr(key);
      
      if (current === 1) {
        await this.client.expire(key, window);
      }

      const remaining = Math.max(0, limit - current);
      return {
        allowed: current <= limit,
        remaining,
      };
    } catch (error) {
      console.error('⚠️ Redis checkRateLimit error:', error.message);
      // Fallback: allow the request when Redis fails
      return { allowed: true, remaining: limit };
    }
  }

  // Generic cache methods
  async set(key: string, value: any, ttl?: number): Promise<void> {
    console.log(`\n🔍 ========== SET() METHOD CALLED ==========`);
    console.log(`🔑 Key: ${key}`);
    console.log(`⏱️  TTL: ${ttl || 'none'}`);
    console.log(`🔌 this.client exists: ${!!this.client}`);
    console.log(`🔌 this.client type: ${typeof this.client}`);
    console.log(`🔌 this.client constructor: ${this.client?.constructor?.name}`);
    
    if (!this.client) {
      console.error(`\n❌ ========== CRITICAL ERROR ==========`);
      console.error(`❌ Redis client is NULL!`);
      console.error(`❌ Key: ${key}`);
      console.error(`❌ This means Redis failed to connect during initialization`);
      console.error(`❌ ========== CRITICAL ERROR ==========\n`);
      return;
    }
    
    try {
      console.log(`\n📦 Step 1: Serializing value...`);
      const serializedValue = JSON.stringify(value);
      console.log(`✅ Serialized successfully: ${serializedValue.length} bytes`);
      
      console.log(`\n📤 Step 2: Calling Redis ${ttl ? 'SETEX' : 'SET'} command...`);
      if (ttl) {
        console.log(`   Command: SETEX "${key}" ${ttl} <${serializedValue.length} bytes>`);
        await this.client.setex(key, ttl, serializedValue);
        console.log(`\x1b[36m✅ REDIS SETEX COMPLETED\x1b[0m`);
      } else {
        console.log(`   Command: SET "${key}" <${serializedValue.length} bytes>`);
        await this.client.set(key, serializedValue);
        console.log(`\x1b[36m✅ REDIS SET COMPLETED\x1b[0m`);
      }
      
      console.log(`\n🔍 Step 3: Verifying key was stored...`);
      const verify = await this.client.exists(key);
      if (verify === 1) {
        console.log(`\x1b[32m✅ VERIFICATION SUCCESS: Key "${key}" EXISTS in Redis\x1b[0m`);
      } else {
        console.error(`\x1b[31m❌ VERIFICATION FAILED: Key "${key}" DOES NOT EXIST in Redis\x1b[0m`);
      }
      
      console.log(`🔍 ========== SET() METHOD END ==========\n`);
    } catch (error) {
      console.error(`\n❌ ========== SET() ERROR ==========`);
      console.error(`❌ Key: ${key}`);
      console.error(`❌ Error message: ${error.message}`);
      console.error(`❌ Error stack:`, error.stack);
      console.error(`❌ ========== SET() ERROR ==========\n`);
    }
  }

  async get(key: string): Promise<any | null> {
    console.log(`🔍 DEBUG: get() called - key: ${key}, client exists: ${!!this.client}`);
    
    if (!this.client) {
      console.log(`⚠️ Redis client is NULL - skipping cache get for key: ${key}`);
      return null;
    }
    
    try {
      const data = await this.client.get(key);
      if (data) {
        console.log(`\x1b[32m✅ CACHE HIT\x1b[0m: ${key} (Size: ${data.length} bytes)`);
        return JSON.parse(data);
      } else {
        console.log(`\x1b[33m❌ CACHE MISS\x1b[0m: ${key} - Data not found in Redis`);
        return null;
      }
    } catch (error) {
      console.error(`❌ Redis get error for key "${key}":`, error.message);
      return null;
    }
  }

  async del(key: string): Promise<void> {
    if (!this.client) {
      console.log(`⚠️ Redis not available - skipping cache delete for key: ${key}`);
      return;
    }
    
    try {
      await this.client.del(key);
      console.log(`\x1b[31m🗑️ CACHE DELETE\x1b[0m: ${key}`);
    } catch (error) {
      console.error('⚠️ Redis del error:', error.message);
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.client) return false; // Gracefully handle when Redis is not available
    
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.error('⚠️ Redis exists error:', error.message);
      return false;
    }
  }

  /**
   * Delete all keys matching a pattern
   * Useful for cache invalidation (e.g., delete all user-related caches)
   */
  async deletePattern(pattern: string): Promise<number> {
    if (!this.client) return 0;
    
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length === 0) return 0;
      
      const deleted = await this.client.del(...keys);
      console.log(`🗑️ Deleted ${deleted} keys matching pattern: ${pattern}`);
      return deleted;
    } catch (error) {
      console.error('⚠️ Redis deletePattern error:', error.message);
      return 0;
    }
  }

  /**
   * Invalidate all caches for a specific user
   */
  async invalidateUserCache(userId: string): Promise<void> {
    if (!this.client) return;
    
    try {
      await Promise.all([
        this.deletePattern(`user:*:${userId}`),
        this.deletePattern(`profile:${userId}`),
        this.deletePattern(`session:${userId}`),
        this.deletePattern(`*:user:${userId}:*`),
      ]);
      console.log(`✅ Invalidated all caches for user: ${userId}`);
    } catch (error) {
      console.error('⚠️ Redis invalidateUserCache error:', error.message);
    }
  }

  /**
   * Invalidate course-related caches
   */
  async invalidateCourseCache(courseId: string): Promise<void> {
    if (!this.client) return;
    
    try {
      await this.deletePattern(`course:*:${courseId}*`);
      console.log(`✅ Invalidated all caches for course: ${courseId}`);
    } catch (error) {
      console.error('⚠️ Redis invalidateCourseCache error:', error.message);
    }
  }

  /**
   * Get or set cache with a fallback function
   * This is the recommended pattern for caching
   */
  async getOrSet<T>(
    key: string,
    fallback: () => Promise<T>,
    ttl: number = 1800
  ): Promise<T> {
    console.log(`\n🎯 ========== CACHE OPERATION START ==========`);
    console.log(`🔑 Key: ${key}`);
    console.log(`⏱️  TTL: ${ttl}s`);
    console.log(`🔌 Redis client status: ${this.client ? 'CONNECTED' : 'NULL'}`);
    
    // Try to get from cache first
    console.log(`\n📥 Step 1: Checking Redis cache...`);
    const cached = await this.get(key);
    
    if (cached !== null) {
      console.log(`\x1b[32m✅ CACHE HIT\x1b[0m: ${key} - Serving from Redis`);
      console.log(`🎯 ========== CACHE OPERATION END (HIT) ==========\n`);
      return cached as T;
    }

    // Cache miss - fetch from database
    console.log(`\n📥 Step 2: Cache miss - Fetching from DATABASE...`);
    console.log(`\x1b[33m❌ CACHE MISS\x1b[0m: ${key} - Data not in Redis`);
    const startTime = Date.now();
    const data = await fallback();
    const duration = Date.now() - startTime;
    console.log(`\x1b[35m📊 DATABASE QUERY COMPLETE\x1b[0m: Took ${duration}ms`);
    
    // Store in cache for next time
    console.log(`\n📥 Step 3: Storing in Redis cache...`);
    await this.set(key, data, ttl);
    
    console.log(`🎯 ========== CACHE OPERATION END (MISS) ==========\n`);
    return data;
  }

  /**
   * Cache course data with optimized structure
   */
  async cacheCourse(courseId: string, course: any, ttl: number = 1800): Promise<void> {
    console.log(`\x1b[36m💾 CACHING COURSE\x1b[0m: ${courseId} with ${course.modules?.length || 0} modules`);
    await Promise.all([
      this.set(`course:detail:${courseId}`, course, ttl),
      this.set(`course:modules:${courseId}`, course.modules, ttl),
      // Cache individual lessons for faster access
      ...course.modules?.flatMap(module => 
        module.lessons?.map(lesson => 
          this.set(`lesson:${lesson.id}`, lesson, ttl)
        ) || []
      ) || []
    ]);
  }

  /**
   * Get paginated data with cache
   */
  async getPaginatedCache<T>(
    baseKey: string,
    page: number,
    limit: number,
    fallback: () => Promise<{ data: T[]; total: number }>,
    ttl: number = 900 // 15 minutes for lists
  ): Promise<{ data: T[]; total: number }> {
    const cacheKey = `${baseKey}:page:${page}:limit:${limit}`;
    
    return this.getOrSet(cacheKey, fallback, ttl);
  }

  /**
   * Warm cache for frequently accessed data
   */
  async warmCache(keys: Array<{ key: string; fallback: () => Promise<any>; ttl?: number }>): Promise<void> {
    await Promise.all(
      keys.map(({ key, fallback, ttl = 1800 }) => 
        this.getOrSet(key, fallback, ttl)
      )
    );
  }
}