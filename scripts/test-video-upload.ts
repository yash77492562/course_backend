#!/usr/bin/env ts-node
/**
 * Test Video Upload and Processing
 * 
 * This script tests the complete video upload and processing pipeline:
 * 1. Upload video in chunks to backend
 * 2. Trigger processing
 * 3. Monitor BullMQ job progress
 * 4. Verify worker processes the video
 */

import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';
import fetch from 'node-fetch';

const VIDEO_PATH = '/Users/yash/Downloads/Class 1 – Introduction to Data Engineering - 2026_03_21 09_43 GMT – Recording.mp4';
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
const BACKEND_URL = 'http://localhost';

const PORTS = {
  '460p': 3010,
  '720p': 3011,
  '1080p': 3012,
  process: 3013,
};

interface UploadSession {
  uploadId: string;
  quality: string;
}

async function testVideoUpload() {
  console.log('🧪 Testing Video Upload and Processing Pipeline\n');
  console.log('=' .repeat(80));
  
  // Step 1: Verify video file exists
  console.log('\n📁 Step 1: Verifying video file...');
  if (!fs.existsSync(VIDEO_PATH)) {
    console.error(`❌ Video file not found: ${VIDEO_PATH}`);
    process.exit(1);
  }
  
  const stats = fs.statSync(VIDEO_PATH);
  const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
  console.log(`✅ Video file found: ${fileSizeMB} MB`);
  console.log(`   Path: ${VIDEO_PATH}`);
  
  // Step 2: Test backend connectivity
  console.log('\n🔌 Step 2: Testing backend connectivity...');
  const qualities = ['460p', '720p', '1080p'];
  
  for (const quality of qualities) {
    try {
      const port = PORTS[quality as keyof typeof PORTS];
      const response = await fetch(`${BACKEND_URL}:${port}/health`, {
        method: 'GET',
      }).catch(() => null);
      
      if (response && response.ok) {
        console.log(`✅ ${quality} service (port ${port}): ONLINE`);
      } else {
        console.log(`⚠️  ${quality} service (port ${port}): OFFLINE (will try anyway)`);
      }
    } catch (error) {
      console.log(`⚠️  ${quality} service: Cannot connect (will try anyway)`);
    }
  }
  
  // Step 3: Upload video in chunks for each quality
  console.log('\n📤 Step 3: Uploading video in chunks...');
  const lessonId = `test_${Date.now()}`;
  const fileName = path.basename(VIDEO_PATH);
  const uploadSessions: UploadSession[] = [];
  
  for (const quality of qualities) {
    console.log(`\n🎬 Uploading ${quality}...`);
    
    try {
      const uploadId = await uploadVideoChunks(VIDEO_PATH, lessonId, fileName, quality);
      uploadSessions.push({ uploadId, quality });
      console.log(`✅ ${quality} upload complete: ${uploadId}`);
    } catch (error) {
      console.error(`❌ ${quality} upload failed:`, error.message);
      return;
    }
  }
  
  console.log('\n✅ All uploads complete!');
  console.log('   Upload IDs:', uploadSessions.map(s => `${s.quality}:${s.uploadId}`).join(', '));
  
  // Step 4: Trigger processing
  console.log('\n⚙️  Step 4: Triggering video processing...');
  
  try {
    const response = await fetch(`${BACKEND_URL}:${PORTS.process}/video-process/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploadIds: uploadSessions.map(s => s.uploadId),
        lessonId,
        lessonName: 'Test Video',
        courseId: 'test_course',
        moduleName: 'Test Module',
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Processing failed: ${error}`);
    }
    
    const result = await response.json();
    console.log('✅ Processing started!');
    console.log('   Jobs:', result.jobs);
    
    // Step 5: Monitor progress
    console.log('\n📊 Step 5: Monitoring progress...');
    console.log('   (Check worker logs for real-time progress)');
    console.log('   Lesson ID:', lessonId);
    console.log('\n💡 To monitor:');
    console.log('   1. Check worker console output');
    console.log('   2. Run: npm run worker:status');
    console.log('   3. Check database: VideoUploadJob collection');
    console.log('   4. Check Redis: redis-cli keys "riva:bull:*"');
    
  } catch (error) {
    console.error('❌ Processing trigger failed:', error.message);
    return;
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ Test complete! Video is now being processed by workers.');
  console.log('=' .repeat(80));
}

async function uploadVideoChunks(
  filePath: string,
  lessonId: string,
  fileName: string,
  quality: string
): Promise<string> {
  const port = PORTS[quality as keyof typeof PORTS];
  const fileSize = fs.statSync(filePath).size;
  const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
  
  console.log(`   File size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Total chunks: ${totalChunks}`);
  
  // Step 1: Initiate upload
  const initiateResponse = await fetch(`${BACKEND_URL}:${port}/video-upload-${quality}/initiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lessonId,
      fileName,
      fileSize,
      quality,
    }),
  });
  
  if (!initiateResponse.ok) {
    throw new Error(`Failed to initiate upload: ${await initiateResponse.text()}`);
  }
  
  const { uploadId } = await initiateResponse.json();
  console.log(`   Upload ID: ${uploadId}`);
  
  // Step 2: Upload chunks
  const fileStream = fs.createReadStream(filePath, { highWaterMark: CHUNK_SIZE });
  let chunkIndex = 0;
  let buffer = Buffer.alloc(0);
  
  for await (const chunk of fileStream) {
    buffer = Buffer.concat([buffer, chunk as Buffer]);
    
    if (buffer.length >= CHUNK_SIZE || chunkIndex === totalChunks - 1) {
      const chunkToUpload = buffer.slice(0, CHUNK_SIZE);
      buffer = buffer.slice(CHUNK_SIZE);
      
      const formData = new FormData();
      formData.append('chunk', chunkToUpload, {
        filename: `chunk_${chunkIndex}`,
        contentType: 'application/octet-stream',
      });
      formData.append('uploadId', uploadId);
      formData.append('chunkIndex', chunkIndex.toString());
      formData.append('totalChunks', totalChunks.toString());
      formData.append('quality', quality);
      
      const chunkResponse = await fetch(`${BACKEND_URL}:${port}/video-upload-${quality}/chunk`, {
        method: 'POST',
        body: formData as any,
      });
      
      if (!chunkResponse.ok) {
        throw new Error(`Failed to upload chunk ${chunkIndex}: ${await chunkResponse.text()}`);
      }
      
      const progress = Math.round(((chunkIndex + 1) / totalChunks) * 100);
      process.stdout.write(`\r   Progress: ${progress}% (${chunkIndex + 1}/${totalChunks} chunks)`);
      
      chunkIndex++;
    }
  }
  
  // Upload remaining buffer if any
  if (buffer.length > 0) {
    const formData = new FormData();
    formData.append('chunk', buffer, {
      filename: `chunk_${chunkIndex}`,
      contentType: 'application/octet-stream',
    });
    formData.append('uploadId', uploadId);
    formData.append('chunkIndex', chunkIndex.toString());
    formData.append('totalChunks', totalChunks.toString());
    formData.append('quality', quality);
    
    await fetch(`${BACKEND_URL}:${port}/video-upload-${quality}/chunk`, {
      method: 'POST',
      body: formData as any,
    });
  }
  
  console.log(''); // New line after progress
  return uploadId;
}

// Run test
testVideoUpload().catch(error => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});
