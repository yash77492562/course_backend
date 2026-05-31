import { Worker, type Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../lib/logger.service';
import { VideoTranscoderService } from '../../video/services/video-transcoder.service';
import { R2UploadService } from '../../upload/services/r2-upload.service';
import type { VideoJobData } from '../types/job-types';

const configService = new ConfigService();

// Initialize services
const prisma = new PrismaClient();
const transcoderService = new VideoTranscoderService();
const r2Service = new R2UploadService();

const redisConfig = {
  host: configService.get('REDIS_HOST', 'localhost'),
  port: parseInt(configService.get('REDIS_PORT', '6379')),
  password: configService.get('REDIS_PASSWORD') || undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

// Create Redis client for progress updates
const redisClient = new Redis({
  host: configService.get('REDIS_HOST', 'localhost'),
  port: parseInt(configService.get('REDIS_PORT', '6379')),
  password: configService.get('REDIS_PASSWORD') || undefined,
});

// Redis connection event handlers
redisClient.on('connect', () => {
  logger.info('✅ Video worker Redis client connected');
});

redisClient.on('ready', () => {
  logger.info('✅ Video worker Redis client ready');
});

redisClient.on('error', (err) => {
  logger.error('❌ Video worker Redis client error', {
    error: err.message,
  });
});

redisClient.on('close', () => {
  logger.warn('⚠️ Video worker Redis client closed');
});

redisClient.on('reconnecting', () => {
  logger.info('🔄 Video worker Redis client reconnecting');
});

/**
 * Update both BullMQ progress, Redis status, AND database for real-time UI
 * NEW: Sends step-based progress (each step 0-100%)
 * CRITICAL FIX: Also updates upload lock progress for bottom-right indicator
 */
async function updateProgress(
  job: Job<VideoJobData>,
  progress: {
    progress: number;
    stage: string;
    status: 'uploading' | 'processing' | 'completed' | 'failed';
    message: string;
    currentStep?: number;
    stepProgress?: number;
    segmentsUploaded?: number;
    totalSegments?: number;
  }
) {
  const { courseId, lessonId, videoId, userId, fileName } = job.data;

  // 1. Update BullMQ job progress (for Bull Board dashboard)
  await job.updateProgress(progress.progress);

  // 2. Update Redis for real-time UI across all admin tabs
  // CRITICAL FIX: Use videoId as key (not courseId) for frontend sync
  const progressKey = `video:progress:${videoId}`;
  const data = {
    courseId,
    lessonId,
    videoId,
    fileName,
    uploadedBy: userId,
    ...progress,
    updatedAt: new Date().toISOString(),
  };

  await redisClient.setex(progressKey, 10800, JSON.stringify(data));

  // 3. CRITICAL FIX: Also update upload lock progress (for bottom-right indicator)
  // This syncs the upload status indicator with the actual video processing progress
  if (courseId) {
    const uploadProgressKey = `course:upload:progress:${courseId}`;
    const uploadLockData = {
      lessonId,
      videoId,
      jobId: String(job.id),
      status: progress.status,
      progress: progress.progress,
      stage: progress.stage,
      message: progress.message,
      fileName,
      uploadedBy: userId,
      currentStep: progress.currentStep,
      stepProgress: progress.stepProgress,
      segmentsUploaded: progress.segmentsUploaded,
      totalSegments: progress.totalSegments,
      updatedAt: new Date().toISOString(),
    };
    
    await redisClient.setex(uploadProgressKey, 10800, JSON.stringify(uploadLockData));
    logger.info('📊 Upload lock progress updated', {
      courseId,
      progress: progress.progress,
      stage: progress.stage,
    });
  }

  // 3. Update database for persistent progress tracking
  // CRITICAL FIX: Update Lesson directly instead of VideoUploadJob
  try {
    await prisma.lesson.update({
      where: { id: lessonId },
      data: {
        videoUrl: progress.status === 'completed' ? null : 'processing',
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    // Log but continue - Redis is primary source of truth for progress
    logger.warn('Failed to update lesson progress', {
      lessonId,
      error: error.message,
    });
  }

  logger.info('📊 Progress updated (Redis + Database)', {
    courseId,
    progress: progress.progress,
    stage: progress.stage,
    currentStep: progress.currentStep,
    stepProgress: progress.stepProgress,
  });
}

/**
 * Release upload lock when job completes or fails
 * CRITICAL: courseId is optional for new courses
 */
async function releaseLock(courseId?: string) {
  if (!courseId) {
    logger.info('🔓 No courseId, skipping lock release');
    return;
  }

  const lockKey = `course:upload:lock:${courseId}`;
  const progressKey = `course:upload:progress:${courseId}`;

  await Promise.all([
    redisClient.del(lockKey),
    redisClient.del(progressKey),
    redisClient.srem('course:uploads:active', courseId),
  ]);

  logger.info('🔓 Lock released', { courseId });
}

export const videoWorker = new Worker<VideoJobData>(
  'video-processing',
  async (job: Job<VideoJobData>) => {
    const { courseId, lessonId, videoId } = job.data;
    
    logger.info('📹 Video job started', {
      type: job.data.type,
      jobId: job.id,
      courseId,
      lessonId,
    });

    try {
      switch (job.data.type) {
        case 'process_video': {
          const { qualities, inputPath, userId, fileName } = job.data;

          logger.info('🎬 Starting video processing', {
            qualities: qualities.join(', '),
            inputPath,
            videoId,
            courseId,
          });

          // Verify input file exists
          if (!fs.existsSync(inputPath)) {
            throw new Error(`Input file not found: ${inputPath}`);
          }

          // STEP 1: Chunks (In Memory) - 0-100%
          await updateProgress(job, {
            progress: 0,
            stage: 'step1_chunks',
            status: 'processing',
            message: 'Step 1: Uploading chunks to memory',
            currentStep: 1,
            stepProgress: 0,
          });

          // Simulate chunk upload progress
          await updateProgress(job, {
            progress: 5,
            stage: 'step1_chunks',
            status: 'processing',
            message: 'Step 1: Chunks uploaded to memory',
            currentStep: 1,
            stepProgress: 100,
          });

          // CRITICAL FIX: Process ALL selected qualities
          const videoUrls: Record<string, string> = {};
          let thumbnailUrl = '';
          
          // Process each quality sequentially
          for (let qualityIndex = 0; qualityIndex < qualities.length; qualityIndex++) {
            const quality = qualities[qualityIndex];
            const qualityProgress = qualityIndex / qualities.length;
            const nextQualityProgress = (qualityIndex + 1) / qualities.length;
            
            logger.info(`🎬 Processing quality ${qualityIndex + 1}/${qualities.length}: ${quality}`);

            // Create output directory
            const outputDir = path.join('./temp-output', `${videoId}_${quality}`);
            if (!fs.existsSync(outputDir)) {
              fs.mkdirSync(outputDir, { recursive: true });
            }

            // STEP 2: Video Processing (Transcoding) - 0-100%
            const step2Start = 5 + (qualityProgress * 60); // Distribute 60% across all qualities
            const step2End = 5 + (nextQualityProgress * 60);
            
            await updateProgress(job, {
              progress: Math.floor(step2Start),
              stage: 'step2_processing',
              status: 'processing',
              message: `Step 2: Starting transcoding to ${quality} (${qualityIndex + 1}/${qualities.length})`,
              currentStep: 2,
              stepProgress: 0,
            });

            const transcodeResult = await transcoderService.transcodeToHLS({
              inputPath,
              outputDir,
              quality,
              onProgress: async (percent) => {
                // Map transcode progress (0-100%) to step 2 progress
                const stepProgress = step2Start + ((step2End - step2Start) * (percent / 100));
                await updateProgress(job, {
                  progress: Math.floor(stepProgress),
                  stage: 'step2_processing',
                  status: 'processing',
                  message: `Step 2: Transcoding ${quality} - ${percent}% (${qualityIndex + 1}/${qualities.length})`,
                  currentStep: 2,
                  stepProgress: percent, // Step progress 0-100%
                });
              },
            });

            logger.info('✅ Transcode complete', {
              quality,
              segments: transcodeResult.segmentPaths.length,
              duration: transcodeResult.duration,
            });

            // STEP 3: Transfer to R2 - 0-100%
            const step3Start = 65 + (qualityProgress * 20); // Distribute 20% across all qualities
            const step3End = 65 + (nextQualityProgress * 20);
            
            await updateProgress(job, {
              progress: Math.floor(step3Start),
              stage: 'step3_r2_upload',
              status: 'processing',
              message: `Step 3: Starting upload to R2 for ${quality} (${qualityIndex + 1}/${qualities.length})`,
              currentStep: 3,
              stepProgress: 0,
            });

            // CRITICAL FIX: Use lessonId (valid MongoDB ObjectID) for R2 path
            // Format: videos/lessonId/quality/
            const r2BasePath = `videos/${lessonId}/${quality}`;

            logger.info('📤 R2 upload path', { r2BasePath, lessonId, quality });

            // Upload playlist
            const playlistUrl = await r2Service.uploadFile(
              fs.readFileSync(transcodeResult.playlistPath),
              `${r2BasePath}/playlist.m3u8`,
              'application/vnd.apple.mpegurl'
            );
            videoUrls[quality] = playlistUrl;

            logger.info('✅ Playlist uploaded', { quality, url: playlistUrl });

            await updateProgress(job, {
              progress: Math.floor(step3Start + 2),
              stage: 'step3_r2_upload',
              status: 'processing',
              message: `Step 3: Playlist uploaded for ${quality}`,
              currentStep: 3,
              stepProgress: 10,
            });

            // Upload segments with progress updates
            const totalSegments = transcodeResult.segmentPaths.length;
            logger.info(`📤 Uploading ${totalSegments} segments for ${quality} to R2...`);
            
            for (let i = 0; i < totalSegments; i++) {
              const segmentPath = transcodeResult.segmentPaths[i];
              const segmentName = path.basename(segmentPath);
              
              await r2Service.uploadFile(
                fs.readFileSync(segmentPath),
                `${r2BasePath}/${segmentName}`,
                'video/mp2t'
              );

              // Update progress for every segment
              const segmentProgress = Math.floor((i / totalSegments) * 90); // 0-90% of step 3
              const overallProgress = step3Start + ((step3End - step3Start) * ((i + 1) / totalSegments));
              
              await updateProgress(job, {
                progress: Math.floor(overallProgress),
                stage: 'step3_r2_upload',
                status: 'processing',
                message: `Step 3: Uploading ${quality} segment ${i + 1}/${totalSegments} (${qualityIndex + 1}/${qualities.length})`,
                currentStep: 3,
                stepProgress: 10 + segmentProgress,
                segmentsUploaded: i + 1,
                totalSegments,
              });
            }

            logger.info('✅ All segments uploaded for quality', { quality, count: totalSegments });

            // Upload thumbnail (only once for first quality)
            if (qualityIndex === 0) {
              await updateProgress(job, {
                progress: Math.floor(step3End - 2),
                stage: 'step3_r2_upload',
                status: 'processing',
                message: 'Step 3: Uploading thumbnail',
                currentStep: 3,
                stepProgress: 95,
              });

              thumbnailUrl = await r2Service.uploadFile(
                fs.readFileSync(transcodeResult.thumbnailPath),
                `videos/${lessonId}/thumbnail.jpg`,
                'image/jpeg'
              );

              logger.info('✅ Thumbnail uploaded', { url: thumbnailUrl });
            }

            await updateProgress(job, {
              progress: Math.floor(step3End),
              stage: 'step3_r2_upload',
              status: 'processing',
              message: `Step 3: R2 upload complete for ${quality} (${qualityIndex + 1}/${qualities.length})`,
              currentStep: 3,
              stepProgress: 100,
            });
            
            // Clean up temp files for this quality
            if (fs.existsSync(outputDir)) {
              fs.rmSync(outputDir, { recursive: true, force: true });
            }
          }

          // STEP 4: Update Database - 0-100%
          await updateProgress(job, {
            progress: 90,
            stage: 'step4_database',
            status: 'processing',
            message: 'Step 4: Updating database',
            currentStep: 4,
            stepProgress: 0,
          });

          // Generate master playlist if multiple qualities
          let masterPlaylistUrl = '';
          if (qualities.length > 1) {
            // Create master playlist content
            let masterContent = '#EXTM3U\n#EXT-X-VERSION:3\n\n';
            
            const bandwidthMap: Record<string, number> = {
              '460p': 900000,
              '720p': 3000000,
              '1080p': 6000000,
            };
            
            const resolutionMap: Record<string, string> = {
              '460p': '816x460',
              '720p': '1280x720',
              '1080p': '1920x1080',
            };
            
            for (const quality of qualities) {
              const bandwidth = bandwidthMap[quality] || 2000000;
              const resolution = resolutionMap[quality] || '1280x720';
              masterContent += `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${resolution}\n`;
              masterContent += `${videoUrls[quality]}\n\n`;
            }
            
            // Upload master playlist
            masterPlaylistUrl = await r2Service.uploadFile(
              Buffer.from(masterContent, 'utf-8'),
              `videos/${lessonId}/master.m3u8`,
              'application/vnd.apple.mpegurl'
            );
            
            logger.info('✅ Master playlist created', { url: masterPlaylistUrl, qualities: qualities.length });
          } else {
            // Single quality - use that as master
            masterPlaylistUrl = videoUrls[qualities[0]];
          }

          // CRITICAL: Update Lesson directly with ALL video URLs
          try {
            await prisma.lesson.update({
              where: { id: lessonId },
              data: {
                videoUrls: videoUrls,
                hlsQualities: videoUrls,
                hlsMasterPlaylist: masterPlaylistUrl,
                thumbnail: thumbnailUrl,
                videoUrl: null, // Clear "processing" status
              },
            });
            logger.info('✅ Lesson updated with all video URLs', {
              lessonId,
              qualities: Object.keys(videoUrls),
              masterPlaylistUrl,
            });
            
            await updateProgress(job, {
              progress: 93,
              stage: 'step4_database',
              status: 'processing',
              message: 'Step 4: Lesson updated with all videos',
              currentStep: 4,
              stepProgress: 100,
            });
          } catch (error) {
            logger.error('❌ Failed to update Lesson', {
              lessonId,
              error: error.message,
            });
            throw error; // This is critical - fail the job if update fails
          }

          logger.info('✅ Database updated');

          // STEP 5: Cleanup - 0-100%
          await updateProgress(job, {
            progress: 95,
            stage: 'step5_cleanup',
            status: 'processing',
            message: 'Step 5: Cleaning up temporary files',
            currentStep: 5,
            stepProgress: 0,
          });

          // Note: Individual quality output dirs were already cleaned up in the loop

          await updateProgress(job, {
            progress: 96,
            stage: 'step5_cleanup',
            status: 'processing',
            message: 'Step 5: Cleaning temp files',
            currentStep: 5,
            stepProgress: 30,
          });

          // Delete temp input file
          if (fs.existsSync(inputPath)) {
            fs.unlinkSync(inputPath);
            logger.info('🗑️ Deleted temp input file', { inputPath });
          }

          await updateProgress(job, {
            progress: 97,
            stage: 'step5_cleanup',
            status: 'processing',
            message: 'Step 5: Cleaning temp input',
            currentStep: 5,
            stepProgress: 60,
          });

          // CRITICAL: Clean up temp directories from controller
          // These are created during analyze/process steps
          const tempDirs = [
            './temp-analysis',
            './temp-process',
            './temp-upload',
          ];

          for (const tempDir of tempDirs) {
            if (fs.existsSync(tempDir)) {
              try {
                // Only delete files related to this upload
                const files = fs.readdirSync(tempDir);
                for (const file of files) {
                  // Delete files that match this videoId or are older than 1 hour
                  const filePath = path.join(tempDir, file);
                  const stats = fs.statSync(filePath);
                  const ageInMs = Date.now() - stats.mtimeMs;
                  const oneHourInMs = 60 * 60 * 1000;

                  if (file.includes(videoId) || ageInMs > oneHourInMs) {
                    fs.unlinkSync(filePath);
                    logger.info('🗑️ Deleted temp file', { file: filePath });
                  }
                }
              } catch (error) {
                logger.warn('⚠️ Failed to clean temp directory', {
                  tempDir,
                  error: error.message,
                });
              }
            }
          }

          await updateProgress(job, {
            progress: 98,
            stage: 'step5_cleanup',
            status: 'processing',
            message: 'Step 5: Cleanup complete',
            currentStep: 5,
            stepProgress: 90,
          });

          logger.info('✅ Cleanup complete');

          // CRITICAL FIX: Release lock BEFORE marking 100%
          // This ensures frontend sees completion only when truly done
          await releaseLock(courseId);

          // STEP 6: Complete
          await updateProgress(job, {
            progress: 100,
            stage: 'complete',
            status: 'completed',
            message: `All ${qualities.length} quality version(s) processed successfully!`,
            currentStep: 5,
            stepProgress: 100,
          });

          logger.info('✅ Video processed successfully', {
            videoId,
            courseId,
            qualities: Object.keys(videoUrls),
            masterPlaylistUrl,
            thumbnailUrl,
          });

          return {
            success: true,
            videoId,
            qualities: Object.keys(videoUrls),
            videoUrls,
            masterPlaylistUrl,
            thumbnailUrl,
          };
        }

        case 'generate_thumbnail': {
          const { inputPath, outputPath, userId } = job.data;

          await updateProgress(job, {
            progress: 20,
            stage: 'thumbnail',
            status: 'processing',
            message: 'Generating thumbnail...',
          });

          // Generate thumbnail using transcoder service
          const thumbnailDir = path.dirname(outputPath);
          if (!fs.existsSync(thumbnailDir)) {
            fs.mkdirSync(thumbnailDir, { recursive: true });
          }

          // Use FFmpeg to generate thumbnail
          await new Promise<void>((resolve, reject) => {
            const ffmpeg = require('fluent-ffmpeg');
            ffmpeg(inputPath)
              .screenshots({
                timestamps: ['10%'],
                filename: path.basename(outputPath),
                folder: thumbnailDir,
                size: '1280x720',
              })
              .on('end', resolve)
              .on('error', reject);
          });

          // Upload to R2 with lessonId path
          const thumbnailUrl = await r2Service.uploadFile(
            fs.readFileSync(outputPath),
            `videos/${lessonId}/thumbnail.jpg`,
            'image/jpeg'
          );

          await updateProgress(job, {
            progress: 100,
            stage: 'complete',
            status: 'completed',
            message: 'Thumbnail generated!',
          });

          await releaseLock(courseId);

          logger.info('✅ Thumbnail generated', { videoId, lessonId, thumbnailUrl });
          return { success: true, videoId, thumbnailUrl };
        }

        default: {
          const _exhaustive: never = job.data;
          logger.error('Unknown video job type', { data: _exhaustive });
          throw new Error('Unknown video job type');
        }
      }
    } catch (error) {
      logger.error('❌ Video job failed', {
        jobId: job.id,
        courseId,
        error: error.message,
        stack: error.stack,
      });

      // Update Redis with error status
      await updateProgress(job, {
        progress: 0,
        stage: 'failed',
        status: 'failed',
        message: error.message,
      });

      // CRITICAL: Clean up temp files on failure
      const { inputPath, videoId } = job.data;
      
      try {
        // Delete input file if exists
        if (inputPath && fs.existsSync(inputPath)) {
          fs.unlinkSync(inputPath);
          logger.info('🗑️ Deleted temp input file on failure', { inputPath });
        }

        // Clean up temp directories
        const tempDirs = ['./temp-analysis', './temp-process', './temp-upload'];
        for (const tempDir of tempDirs) {
          if (fs.existsSync(tempDir)) {
            const files = fs.readdirSync(tempDir);
            for (const file of files) {
              if (file.includes(videoId)) {
                const filePath = path.join(tempDir, file);
                fs.unlinkSync(filePath);
                logger.info('🗑️ Deleted temp file on failure', { file: filePath });
              }
            }
          }
        }
      } catch (cleanupError) {
        logger.warn('⚠️ Failed to clean up temp files on error', {
          error: cleanupError.message,
        });
      }

      // Release lock on failure
      await releaseLock(courseId);

      throw error;
    }
  },
  {
    connection: redisConfig,
    prefix: 'riva:bull',
    concurrency: 3, // Process 3 video jobs concurrently
  }
);

// Worker event handlers with detailed logging
videoWorker.on('completed', async (job) => {
  logger.info('✅ Video job completed', {
    jobId: job.id,
    type: job.data.type,
    courseId: job.data.courseId,
    lessonId: job.data.lessonId,
    duration: job.finishedOn ? job.finishedOn - job.processedOn : 0,
  });
});

videoWorker.on('failed', async (job, err) => {
  logger.error('❌ Video job failed - REMOVING JOB (no retry)', {
    jobId: job?.id,
    type: job?.data?.type,
    courseId: job?.data?.courseId,
    lessonId: job?.data?.lessonId,
    error: err.message,
    stack: err.stack,
    attemptsMade: job?.attemptsMade,
  });

  // Update Lesson with failed status
  if (job?.data?.lessonId) {
    try {
      await prisma.lesson.update({
        where: { id: job.data.lessonId },
        data: {
          videoUrl: 'failed',
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      logger.warn('Failed to update lesson on failure', {
        lessonId: job.data.lessonId,
        error: error.message,
      });
    }
  }
    
  // CRITICAL: Remove the job to prevent retries
  if (job?.id) {
    try {
      await job.remove();
      logger.info('🗑️ Failed job removed from queue', { jobId: job.id });
    } catch (error) {
      logger.warn('Failed to remove job from queue', {
        bullmqJobId: job.id,
        error: error.message,
      });
    }
  }
});

videoWorker.on('progress', (job, progress) => {
  logger.info('📊 Video job progress', {
    jobId: job.id,
    courseId: job.data.courseId,
    progress: typeof progress === 'number' ? progress : progress,
  });
});

videoWorker.on('error', (err) => {
  logger.error('❌ Video worker error', {
    error: err.message,
    stack: err.stack,
  });
});

videoWorker.on('active', (job) => {
  logger.info('🔄 Video job started processing', {
    jobId: job.id,
    courseId: job.data.courseId,
    type: job.data.type,
  });
});

videoWorker.on('stalled', (jobId) => {
  logger.warn('⚠️ Video job stalled', { jobId });
});

logger.info('🎬 Video worker initialized', {
  queue: 'video-processing',
  concurrency: 3,
  prefix: 'riva:bull',
});

// Log that worker is ready to process jobs
logger.info('✅ Video worker is READY and listening for jobs');
console.log('🎬 VIDEO WORKER STARTED - Ready to process jobs');
