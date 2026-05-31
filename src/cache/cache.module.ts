import { Module, Global } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { CacheInvalidationService } from './cache-invalidation.service';
import * as redisStore from 'cache-manager-redis-store';

/**
 * Global cache helper module
 * Provides cache invalidation service and CacheModule to all modules
 * Self-contained with Redis configuration for microservices architecture
 */
@Global()
@Module({
  imports: [
    CacheModule.register({
      isGlobal: true,
      store: redisStore,
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      ttl: 1800, // Default TTL: 30 minutes (in seconds)
      max: 1000, // Maximum number of items in cache
    }),
  ],
  providers: [CacheInvalidationService],
  exports: [CacheInvalidationService, CacheModule],
})
export class CacheHelperModule {}
