import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

/**
 * Script to clear all Redis data
 * WARNING: This will delete ALL data in Redis!
 */

const configService = new ConfigService();

const redis = new Redis({
  host: configService.get('REDIS_HOST', 'localhost'),
  port: parseInt(configService.get('REDIS_PORT', '6379')),
  password: configService.get('REDIS_PASSWORD') || undefined,
});

async function clearRedis() {
  try {
    console.log('🔍 Connecting to Redis...');
    console.log(`   Host: ${configService.get('REDIS_HOST', 'localhost')}`);
    console.log(`   Port: ${configService.get('REDIS_PORT', '6379')}`);

    // Get all keys
    const keys = await redis.keys('*');
    console.log(`\n📊 Found ${keys.length} keys in Redis`);

    if (keys.length === 0) {
      console.log('✅ Redis is already empty!');
      await redis.quit();
      process.exit(0);
    }

    // Show some sample keys
    console.log('\n📝 Sample keys:');
    keys.slice(0, 10).forEach(key => console.log(`   - ${key}`));
    if (keys.length > 10) {
      console.log(`   ... and ${keys.length - 10} more`);
    }

    // Confirm deletion
    console.log('\n⚠️  WARNING: This will delete ALL Redis data!');
    console.log('   Press Ctrl+C to cancel, or wait 3 seconds to continue...\n');

    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('🗑️  Deleting all keys...');
    await redis.flushall();

    console.log('✅ Redis cleared successfully!');
    console.log(`   Deleted ${keys.length} keys\n`);

    await redis.quit();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error clearing Redis:', error);
    await redis.quit();
    process.exit(1);
  }
}

clearRedis();
