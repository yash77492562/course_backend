import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotFoundException,
  Sse,
  MessageEvent,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Observable, Subject } from 'rxjs';
import { VideoAnalyzerService } from '../services/video-analyzer.service';
import { QueueManagerService } from '../../queues/queue-manager.service';
import { VideoUploadJobService } from '../services/video-upload-job.service';
import { ProcessVideoRequestDto } from '../dto/process-video-request.dto';
import { ProcessingStatusDto } from '../dto/processing-status.dto';
import { PrismaService } from '../../database/prisma/service/prisma.service';

@Controller('api/video-processing')
export class VideoProcessingController {
  private readonly logger = new Logger(VideoProcessingController.name);
  private progressStreams = new Map<string, Subject<MessageEvent>>();
  private videoBuffers = new Map<string, Buffer>(); // Store video buffers temporarily

  constructor(
    private videoAnalyzer: VideoAnalyzerService,
    private queueManager: QueueManagerService,
    private videoUploadJobService: VideoUploadJobService,
    private prisma: PrismaService,
  ) {}

  /**
   * Analyze uploaded video and return available qualities
   * Store buffer in memory for processing
   */
  @Post('analyze')
  @UseInterceptors(FileInterceptor('file'))
  async analyzeVideo(@UploadedFile() file: any) {
    this.logger.log('=== VIDEO ANALYSIS REQUEST ===');
    
    if (!file) {
      this.logger.error('❌ No file provided in request');
      throw new BadRequestException('No file provided');
    }

    this.logger.log(`📁 File received: ${file.originalname}`);
    this.logger.log(`📊 File size: ${(file.buffer.length / 1024 / 1024).toFixed(2)} MB`);

    try {
      // Generate unique ID for this upload
      const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Store buffer in memory temporarily
      this.videoBuffers.set(uploadId, file.buffer);
      
      this.logger.log('🔍 Starting video analysis from buffer...');
      
      // Analyze video from buffer
      const analysis = await this.videoAnalyzer.analyzeVideoFromBuffer(file.buffer);

      this.logger.log('✅ Video analysis complete:');
      this.logger.log(`   Resolution: ${analysis.width}x${analysis.height}`);
      this.logger.log(`   Duration: ${analysis.duration}s`);
      this.logger.log(`   Valid: ${analysis.isValid}`);
      this.logger.log(`   Available qualities: ${analysis.availableQualities.join(', ')}`);

      if (!analysis.isValid) {
        this.logger.warn(`⚠️ Video validation failed: ${analysis.error}`);
        // Clean up buffer
        this.videoBuffers.delete(uploadId);
      }

      return {
        success: true,
        analysis,
        uploadId, // Return upload ID instead of temp path
      };
    } catch (error) {
      this.logger.error('❌ Video analysis failed:', error);
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Failed to analyze video'
      );
    }
  }

  /**
   * Start video processing with selected qualities
   * Uses BullMQ for background processing
   */
  @Post('process')
  async processVideo(@Body() dto: ProcessVideoRequestDto & { uploadId: string; courseId?: string; moduleName?: string }) {
    this.logger.log('=== VIDEO PROCESSING REQUEST ===');
    this.logger.log(`📝 Lesson ID from frontend: ${dto.lessonId}`);
    this.logger.log(`📝 Lesson Name: ${dto.lessonName}`);
    this.logger.log(`📝 Course ID: ${dto.courseId || 'new'}`);
    this.logger.log(`📝 Module ID: ${dto.moduleId || 'not provided'}`);
    this.logger.log(`🎬 Selected Qualities: ${dto.qualities.join(', ')}`);
    this.logger.log(`📍 Upload ID: ${dto.uploadId}`);

    try {
      const { lessonId: frontendLessonId, lessonName, qualities, uploadId, courseId, moduleName, moduleId, description, order } = dto;

      this.logger.log(`📝 Frontend sent lessonId: ${frontendLessonId}`);
      this.logger.log(`📝 Lesson name: ${lessonName}`);
      this.logger.log(`📝 Module ID: ${moduleId}`);

      // CRITICAL FIX: Backend creates Lesson automatically
      // Frontend doesn't need to send valid lessonId - we create it here
      let lessonId: string;
      
      // Check if lessonId is a valid MongoDB ObjectID (24 hex characters)
      const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(frontendLessonId);
      
      if (isValidObjectId) {
        // Lesson already exists in database (editing existing lesson)
        this.logger.log(`✅ Using existing lessonId: ${frontendLessonId}`);
        lessonId = frontendLessonId;
        
        // Update existing lesson to "processing" status
        await this.prisma.lesson.update({
          where: { id: lessonId },
          data: {
            videoUrl: 'processing',
            updatedAt: new Date(),
          },
        });
        this.logger.log(`✅ Existing lesson marked as processing: ${lessonId}`);
      } else {
        // Lesson doesn't exist yet - CREATE IT NOW
        this.logger.log(`🆕 Creating new Lesson in database...`);
        
        if (!moduleId) {
          throw new BadRequestException(
            'moduleId is required to create a new lesson. Please include moduleId in the request.'
          );
        }
        
        // CRITICAL FIX: Validate moduleId is a valid MongoDB ObjectID
        const isValidModuleId = /^[0-9a-fA-F]{24}$/.test(moduleId);
        if (!isValidModuleId) {
          this.logger.error(`❌ Invalid moduleId: ${moduleId} (length: ${moduleId.length})`);
          throw new BadRequestException(
            `moduleId must be a valid MongoDB ObjectID (24 hex characters). Received: "${moduleId}" (${moduleId.length} characters). ` +
            `This error occurs when trying to upload a video to a new course that hasn't been saved yet. ` +
            `Please save the course as a draft first, then upload videos.`
          );
        }
        
        // Create new lesson in database
        const newLesson = await this.prisma.lesson.create({
          data: {
            title: lessonName,
            description: description || '',
            duration: '0', // Will be updated after video processing
            videoUrl: 'processing', // Mark as processing
            videoType: 'UPLOAD',
            contentType: 'VIDEO',
            order: order || 0,
            moduleId: moduleId,
          },
        });
        
        lessonId = newLesson.id;
        this.logger.log(`✅ New lesson created with ID: ${lessonId}`);
      }

      // Get video buffer from memory
      const videoBuffer = this.videoBuffers.get(uploadId);
      if (!videoBuffer) {
        this.logger.error(`❌ Video buffer not found for upload ID: ${uploadId}`);
        throw new BadRequestException('Video buffer not found. Please re-upload the video.');
      }

      this.logger.log('✅ Video buffer retrieved from memory');
      this.logger.log(`📊 Buffer size: ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`);
      this.logger.log('🔍 Re-analyzing video for metadata...');

      // Get video metadata from buffer
      const analysis = await this.videoAnalyzer.analyzeVideoFromBuffer(videoBuffer);
      
      if (!analysis.isValid) {
        this.logger.error(`❌ Video validation failed: ${analysis.error}`);
        this.videoBuffers.delete(uploadId);
        throw new BadRequestException(analysis.error || 'Invalid video');
      }

      this.logger.log('✅ Video metadata retrieved');
      this.logger.log(`   Resolution: ${analysis.width}x${analysis.height}`);
      this.logger.log(`   Duration: ${analysis.duration}s`);

      // CRITICAL FIX: Save video buffer to disk BEFORE adding to queue
      // Worker needs to read from disk (can't access in-memory buffer)
      const fs = require('fs');
      const tempVideoPath = `/tmp/video_${uploadId}.mp4`;
      
      this.logger.log(`💾 Saving video to disk: ${tempVideoPath}`);
      fs.writeFileSync(tempVideoPath, videoBuffer);
      this.logger.log(`✅ Video saved to disk (${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB)`);
      
      // CRITICAL FIX: Generate job ID for BullMQ
      const bullmqJobId = `video_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      this.logger.log('📝 Updating Lesson status to "processing"...');
      
      // CRITICAL: Update Lesson directly (no VideoUploadJob)
      // Mark lesson as processing so UI shows status
      try {
        await this.prisma.lesson.update({
          where: { id: lessonId },
          data: {
            videoUrl: 'processing', // Mark as processing
            updatedAt: new Date(),
          },
        });
        this.logger.log(`✅ Lesson marked as processing: ${lessonId}`);
      } catch (error) {
        this.logger.error(`❌ Failed to update lesson status: ${error}`);
        // Continue anyway - worker will update when complete
      }
      
      // Add job to BullMQ queue with pre-generated ID
      this.logger.log('➕ Adding video to BullMQ queue...');
      this.logger.log(`📝 Selected qualities: ${qualities.join(', ')}`);
      
      const job = await this.queueManager.addVideoProcessingJob({
        type: 'process_video',
        courseId: courseId || undefined, // CRITICAL: Pass undefined for new courses (not "new")
        lessonId, // CRITICAL: Use lessonId from frontend (real MongoDB ObjectID)
        lessonName, // CRITICAL: Pass lessonName for display
        videoId: lessonId, // CRITICAL: Use lessonId as videoId for Redis progress tracking
        qualities: qualities as ('460p' | '720p' | '1080p')[], // CRITICAL FIX: Pass ALL selected qualities
        inputPath: tempVideoPath,
        outputPath: `/tmp/output_${uploadId}`,
        userId: 'admin1', // TODO: Get from auth context
      }, {
        jobId: bullmqJobId, // Pass pre-generated ID to BullMQ
      });

      this.logger.log(`✅ Video job added to BullMQ: ${job.id}`);

      // Get queue position
      const queuePosition = await this.queueManager.getVideoQueuePosition(job.id as string);
      this.logger.log(`📋 Queue position: ${queuePosition || 'processing'}`);

      // Clean up buffer after a delay (worker will process from disk)
      setTimeout(() => {
        this.videoBuffers.delete(uploadId);
        this.logger.log(`🧹 Video buffer cleaned up for ${uploadId}`);
      }, 5000);

      return {
        success: true,
        message: 'Video added to processing queue',
        lessonId, // Return lessonId from frontend (real MongoDB ObjectID)
        jobId: job.id, // Return BullMQ job ID for tracking
        bullmqJobId: job.id,
        queuePosition,
      };
    } catch (error) {
      this.logger.error('❌ Failed to start processing:', error);
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Failed to start processing'
      );
    }
  }

  /**
   * SSE endpoint for real-time progress updates
   * Keep connection alive with heartbeat
   * DISABLED: Using polling with GET endpoint instead
   */
  /*
  @Sse('progress/:lessonId')
  streamProgress(@Param('lessonId') lessonId: string): Observable<MessageEvent> {
    this.logger.log(`📡 SSE connection established for lesson: ${lessonId}`);
    
    // Get or create progress stream
    let subject = this.progressStreams.get(lessonId);
    if (!subject) {
      subject = new Subject<MessageEvent>();
      this.progressStreams.set(lessonId, subject);
      this.logger.log(`📡 New progress stream created for ${lessonId}`);
      
      // Send initial heartbeat to keep connection alive
      subject.next({
        data: {
          lessonId,
          status: 'connecting',
          progress: 0,
          message: 'Connected to progress stream',
        },
      } as MessageEvent);
    }
    
    // Send heartbeat every 15 seconds to keep connection alive
    const heartbeatInterval = setInterval(() => {
      const currentSubject = this.progressStreams.get(lessonId);
      if (currentSubject && !currentSubject.closed) {
        currentSubject.next({
          data: {
            lessonId,
            status: 'heartbeat',
            progress: 0,
            message: 'Connection alive',
          },
        } as MessageEvent);
      } else {
        clearInterval(heartbeatInterval);
      }
    }, 15000);
    
    return subject.asObservable();
  }
  */

  /**
   * Get queue status from BullMQ
   */
  @Get('queue-status')
  async getQueueStatus() {
    const stats = await this.queueManager.getQueueStats();
    const waitingCount = await this.queueManager.getVideoQueueWaitingCount();
    
    this.logger.log(`📋 Queue status requested: ${waitingCount} waiting`);
    
    return {
      success: true,
      video: stats.video,
      waitingCount,
    };
  }

  /**
   * Get job progress from Lesson table (for polling)
   * Admin polls this endpoint every 15 seconds
   * CRITICAL FIX: Query Lesson directly, not VideoUploadJob
   */
  @Get('jobs/:lessonId')
  async getJobProgress(@Param('lessonId') lessonId: string) {
    this.logger.log(`📊 Job progress requested for lessonId: ${lessonId}`);
    
    try {
      // Query Lesson directly
      const lesson = await this.prisma.lesson.findUnique({
        where: { id: lessonId },
      });
      
      if (!lesson) {
        this.logger.warn(`❌ No lesson found for lessonId: ${lessonId}`);
        throw new NotFoundException(`Lesson ${lessonId} not found`);
      }
      
      this.logger.log(`✅ Found lesson: ${lessonId}`);
      this.logger.log(`   Video URL: ${lesson.videoUrl}`);
      this.logger.log(`   Video URLs: ${lesson.videoUrls ? 'YES ✅' : 'NO ❌'}`);
      
      // Determine status from lesson data
      let status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' = 'COMPLETED';
      let message = 'Video ready';
      
      if (lesson.videoUrl === 'processing') {
        status = 'PROCESSING';
        message = 'Video is being processed';
      } else if (!lesson.videoUrls) {
        status = 'QUEUED';
        message = 'Video queued for processing';
      }
      
      return {
        success: true,
        job: {
          id: lesson.id,
          lessonId: lesson.id,
          status,
          progress: status === 'COMPLETED' ? 100 : 0,
          stage: status === 'COMPLETED' ? 'completed' : 'processing',
          message,
          videoUrls: lesson.videoUrls,
          thumbnailUrl: lesson.thumbnail,
          masterPlaylistUrl: lesson.hlsMasterPlaylist,
          createdAt: lesson.createdAt,
          updatedAt: lesson.updatedAt,
        },
      };
    } catch (error) {
      this.logger.error(`❌ Failed to get lesson progress: ${error}`);
      throw error;
    }
  }

  /**
   * Get real-time progress from Redis (faster than database)
   * NEW ENDPOINT: Primary source for progress updates
   * CRITICAL FIX: Use videoId instead of courseId for key
   */
  @Get('progress/:videoId')
  async getProgressFromRedis(@Param('videoId') videoId: string) {
    this.logger.log(`📊 ========== REDIS PROGRESS REQUEST ==========`);
    this.logger.log(`📊 VideoId: ${videoId}`);
    
    try {
      // Import Redis client (we'll need to inject it)
      const Redis = require('ioredis');
      const redisClient = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
      });

      const progressKey = `video:progress:${videoId}`;
      this.logger.log(`📊 Redis Key: ${progressKey}`);
      
      const progressData = await redisClient.get(progressKey);
      
      await redisClient.quit();

      if (!progressData) {
        this.logger.log(`📊 ❌ No data found in Redis for key: ${progressKey}`);
        return {
          success: true,
          progress: null,
          message: 'No active upload for this video',
        };
      }

      const progress = JSON.parse(progressData);
      
      this.logger.log(`📊 ✅ Redis Data Found:`);
      this.logger.log(`   - Status: ${progress.status}`);
      this.logger.log(`   - Progress: ${progress.progress}%`);
      this.logger.log(`   - Stage: ${progress.stage}`);
      this.logger.log(`   - CurrentStep: ${progress.currentStep}`);
      this.logger.log(`   - StepProgress: ${progress.stepProgress}`);
      this.logger.log(`   - Message: ${progress.message}`);
      this.logger.log(`   - SegmentsUploaded: ${progress.segmentsUploaded}`);
      this.logger.log(`   - TotalSegments: ${progress.totalSegments}`);
      
      const responseData = {
        success: true,
        progress: {
          courseId: progress.courseId,
          lessonId: progress.lessonId,
          videoId: progress.videoId,
          fileName: progress.fileName,
          uploadedBy: progress.uploadedBy,
          status: progress.status,
          progress: progress.progress,
          stage: progress.stage,
          message: progress.message,
          updatedAt: progress.updatedAt,
          // CRITICAL: Include step data in response
          currentStep: progress.currentStep,
          stepProgress: progress.stepProgress,
          segmentsUploaded: progress.segmentsUploaded,
          totalSegments: progress.totalSegments,
        },
      };
      
      this.logger.log(`📊 📤 Sending to frontend:`, JSON.stringify(responseData.progress, null, 2));
      this.logger.log(`📊 ========== END REDIS PROGRESS REQUEST ==========`);
      
      return responseData;
    } catch (error) {
      this.logger.error('❌ Failed to get progress from Redis', {
        videoId,
        error: error,
        stack: error,
      });
      
      return {
        success: false,
        progress: null,
        message: 'Failed to get progress',
        error: error,
      };
    }
  }

  /**
   * Get all active jobs (for admin dashboard)
   * Query Lesson table for lessons being processed
   */
  @Get('jobs')
  async getAllActiveJobs() {
    this.logger.log('📊 All active jobs requested');
    
    // Query lessons that are currently processing
    const lessons = await this.prisma.lesson.findMany({
      where: {
        videoUrl: 'processing',
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
    
    return {
      success: true,
      count: lessons.length,
      jobs: lessons.map(lesson => ({
        id: lesson.id,
        lessonId: lesson.id,
        title: lesson.title,
        status: 'PROCESSING',
        progress: 0,
        stage: 'processing',
        message: 'Video is being processed',
        updatedAt: lesson.updatedAt,
      })),
    };
  }
}
