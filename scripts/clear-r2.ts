import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';

/**
 * Script to clear all R2 storage
 * WARNING: This will delete ALL files in R2 bucket!
 */

const configService = new ConfigService();

const s3Client = new S3Client({
  region: configService.get('R2_REGION', 'auto'),
  endpoint: configService.get('R2_ENDPOINT'),
  credentials: {
    accessKeyId: configService.get('R2_ACCESS_KEY_ID'),
    secretAccessKey: configService.get('R2_SECRET_ACCESS_KEY'),
  },
});

const bucketName = configService.get('R2_BUCKET_NAME');

async function clearR2() {
  try {
    console.log('🔍 Connecting to R2...');
    console.log(`   Bucket: ${bucketName}`);
    console.log(`   Endpoint: ${configService.get('R2_ENDPOINT')}`);

    let allObjects: any[] = [];
    let continuationToken: string | undefined;

    // List all objects
    console.log('\n📊 Listing all objects...');
    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: bucketName,
        ContinuationToken: continuationToken,
      });

      const response = await s3Client.send(listCommand);
      
      if (response.Contents) {
        allObjects = allObjects.concat(response.Contents);
        console.log(`   Found ${allObjects.length} objects so far...`);
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    console.log(`\n📊 Total objects found: ${allObjects.length}`);

    if (allObjects.length === 0) {
      console.log('✅ R2 bucket is already empty!');
      process.exit(0);
    }

    // Show some sample objects
    console.log('\n📝 Sample objects:');
    allObjects.slice(0, 10).forEach(obj => {
      const size = obj.Size ? (obj.Size / 1024 / 1024).toFixed(2) : '0';
      console.log(`   - ${obj.Key} (${size} MB)`);
    });
    if (allObjects.length > 10) {
      console.log(`   ... and ${allObjects.length - 10} more`);
    }

    // Calculate total size
    const totalSize = allObjects.reduce((sum, obj) => sum + (obj.Size || 0), 0);
    console.log(`\n💾 Total size: ${(totalSize / 1024 / 1024 / 1024).toFixed(2)} GB`);

    // Confirm deletion
    console.log('\n⚠️  WARNING: This will delete ALL files in R2 bucket!');
    console.log('   Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');

    await new Promise(resolve => setTimeout(resolve, 5000));

    // Delete in batches of 1000 (S3 limit)
    console.log('🗑️  Deleting objects...');
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
    console.log(`   Freed ${(totalSize / 1024 / 1024 / 1024).toFixed(2)} GB\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error clearing R2:', error);
    process.exit(1);
  }
}

clearR2();
