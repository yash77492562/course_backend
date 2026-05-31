import Redis from 'ioredis';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';

/**
 * Script to clear both Redis and R2 storage
 * WARNING: This will delete ALL data!
 */

const configService = new ConfigService();

// Redis client
const redis = new Redis({
  host: configService.get('REDIS_HOST', 'localhost'),
  port: parseInt(configService.get('REDIS_PORT', '6379')),
  password: configService.get('REDIS_PASSWORD') || undefined,
});

// R2 client
const s3Client = new S3Client({
  region: configService.get('R2_REGION', 'auto'),
  endpoint: configService.get('R2_ENDPOINT'),
  credentials: {
    accessKeyId: configService.get('R2_ACCESS_KEY_ID'),
    secretAccessKey: configService.get('R2_SECRET_ACCESS_KEY'),
  },
});

const bucketName = configService.get('R2_BUCKET_NAME');

async function clearRedis() {
  console.log('\n🔴 REDIS CLEANUP');
  console.log('═══════════════════════════════════════');
  
  try {
    console.log('🔍 Connecting to Redis...');
    console.log(`   Host: ${configService.get('REDIS_HOST', 'localhost')}`);
    console.log(`   Port: ${configService.get('REDIS_PORT', '6379')}`);

    const keys = await redis.keys('*');
    console.log(`\n📊 Found ${keys.length} keys in Redis`);

    if (keys.length === 0) {
      console.log('✅ Redis is already empty!');
      return;
    }

    console.log('\n📝 Sample keys:');
    keys.slice(0, 5).forEach(key => console.log(`   - ${key}`));
    if (keys.length > 5) {
      console.log(`   ... and ${keys.length - 5} more`);
    }

    console.log('\n🗑️  Deleting all Redis keys...');
    await redis.flushall();

    console.log('✅ Redis cleared successfully!');
    console.log(`   Deleted ${keys.length} keys`);
  } catch (error) {
    console.error('❌ Error clearing Redis:', error);
    throw error;
  }
}

async function clearR2() {
  console.log('\n\n🔵 R2 STORAGE CLEANUP');
  console.log('═══════════════════════════════════════');
  
  try {
    console.log('🔍 Connecting to R2...');
    console.log(`   Bucket: ${bucketName}`);
    console.log(`   Endpoint: ${configService.get('R2_ENDPOINT')}`);

    let allObjects: any[] = [];
    let continuationToken: string | undefined;

    console.log('\n📊 Listing all objects...');
    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: bucketName,
        ContinuationToken: continuationToken,
      });

      const response = await s3Client.send(listCommand);
      
      if (response.Contents) {
        allObjects = allObjects.concat(response.Contents);
        if (allObjects.length % 1000 === 0) {
          console.log(`   Found ${allObjects.length} objects so far...`);
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    console.log(`\n📊 Total objects found: ${allObjects.length}`);

    if (allObjects.length === 0) {
      console.log('✅ R2 bucket is already empty!');
      return;
    }

    console.log('\n📝 Sample objects:');
    allObjects.slice(0, 5).forEach(obj => {
      const size = obj.Size ? (obj.Size / 1024 / 1024).toFixed(2) : '0';
      console.log(`   - ${obj.Key} (${size} MB)`);
    });
    if (allObjects.length > 5) {
      console.log(`   ... and ${allObjects.length - 5} more`);
    }

    const totalSize = allObjects.reduce((sum, obj) => sum + (obj.Size || 0), 0);
    console.log(`\n💾 Total size: ${(totalSize / 1024 / 1024 / 1024).toFixed(2)} GB`);

    console.log('\n🗑️  Deleting objects...');
    const batchSize = 1000;
    let deleted = 0;

    for (let i = 0; i < allObjects.length; i += batchSize) {
      const batch = allObjects.slice(i, i + batchSize);
      
      const deleteCommand = new DeleteObjectsCommand({
        Bucket: bucketName,
        Delete: {
          Objects: batch.map(obj => ({ Key: obj.Key })),
          Quiet: true,
        },
      });

      await s3Client.send(deleteCommand);
      deleted += batch.length;
      console.log(`   Deleted ${deleted}/${allObjects.length} objects...`);
    }

    console.log('\n✅ R2 bucket cleared successfully!');
    console.log(`   Deleted ${allObjects.length} objects`);
    console.log(`   Freed ${(totalSize / 1024 / 1024 / 1024).toFixed(2)} GB`);
  } catch (error) {
    console.error('❌ Error clearing R2:', error);
    throw error;
  }
}

async function main() {
  console.log('\n╔═══════════════════════════════════════╗');
  console.log('║   CLEAR ALL STORAGE (Redis + R2)     ║');
  console.log('╚═══════════════════════════════════════╝');
  
  console.log('\n⚠️  WARNING: This will delete ALL data from:');
  console.log('   • Redis (all keys, cache, locks, queues)');
  console.log('   • R2 Storage (all videos, thumbnails, PDFs)');
  console.log('\n   Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');

  await new Promise(resolve => setTimeout(resolve, 5000));

  try {
    await clearRedis();
    await clearR2();

    console.log('\n\n╔═══════════════════════════════════════╗');
    console.log('║   ✅ ALL STORAGE CLEARED!            ║');
    console.log('╚═══════════════════════════════════════╝\n');

    await redis.quit();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Failed to clear storage:', error);
    await redis.quit();
    process.exit(1);
  }
}

main();
