import { Controller, Post, Body, BadRequestException, NotFoundException, Sse, MessageEvent, Param, Get } from '@nestjs/common';
import { Observable, interval, map, from, switchMap } from 'rxjs';
import { VideoAnalyzerService } from '../../services/video-analyzer.service';
import { ChunkUploadService } from '../../services/chunk-upload.service';
import { QueueManagerService } from '../../../queues/queue-manager.service';
import { VideoUploadJobService } from '../../services/video-upload-job.service';
import { ProcessingStatusDto } from '../../dto/processing-status.dto';
import { RedisService } from '../../../redis/redis.service';
import { PrismaService } from '../../../database/prisma/service/prisma.service';

@Controller('api/video-process')
export class VideoProcessController {
  constructor(
    private videoAnalyzerService: VideoAnalyzerService,
    private chunkUploadService: ChunkUploadService,
    private queueManager: QueueManagerService,
    private videoUploadJobService: VideoUploadJobService,
    private redisService: RedisService,
    private prisma: PrismaService,
  ) {}

  @Sse('status/:lessonId')
  streamStatus(@Param('lessonId') lessonId: string): Observable<MessageEvent> {
    console.log(`📡 SSE connection opened for lesson: ${lessonId}`);
    
    return interval(1000).pipe(
      switchMap(() => from(this.getProcessingStatus(lessonId))),
      map((status) => {
        return {
          data: status || {
            lessonId,
            status: 'pending',
            progress: 0,
            qualityProgress: [],
            message: 'Waiting for processing to start...',
          },
        } as MessageEvent;
      }),
    );
  }

  /**
   * Get processing status from Redis
   */
  private async getProcessingStatus(lessonId: string): Promise<ProcessingStatusDto | null> {
    try {
      // Try to get from Redis first (worker updates this)
      const redisKey = `video:progress:${lessonId}`;
      const redisStatus = await this.redisService.get(redisKey);
      
      if (redisStatus) {
        console.log(`📊 Got status from Redis for ${lessonId}:`, redisStatus.status, redisStatus.progress + '%');
        
        // Convert Redis data to ProcessingStatusDto format
        return {
          lessonId,
          status: redisStatus.status,
          progress: redisStatus.progress,
          currentQuality: redisStatus.currentQuality,
          qualityProgress: redisStatus.qualityProgress || [],
          message: redisStatus.message,
          error: redisStatus.error,
          videoUrls: redisStatus.videoUrls,
          thumbnailUrl: redisStatus.thumbnailUrl,
        };
      }

      // Fallback: check Lesson table
      const lesson = await this.prisma.lesson.findUnique({
        where: { id: lessonId },
      });
      
      if (lesson) {
        // Determine status from lesson data
        let status: 'queued' | 'processing' | 'complete' | 'error' = 'complete';
        let message = 'Video ready';
        
        if (lesson.videoUrl === 'processing') {
          status = 'processing';
          message = 'Video is being processed';
        } else if (lesson.videoUrl === 'failed') {
          status = 'error';
          message = 'Video processing failed';
        } else if (!lesson.videoUrls) {
          status = 'queued';
          message = 'Video queued for processing';
        }
        
        return {
          lessonId,
          status,
          progress: status === 'complete' ? 100 : 0,
          qualityProgress: [],
          message,
          videoUrls: lesson.videoUrls as Record<string, string> | undefined,
          thumbnailUrl: lesson.thumbnail || undefined,
        };
      }

      return null;
    } catch (error) {
      console.error(`❌ Error getting processing status for ${lessonId}:`, error.message);
      return null;
    }
  }

  @Post('start')
  async startProcessing(@Body() body: { uploadIds: string[]; lessonId: string; lessonName: string; courseId?: string; moduleName?: string }) {
    const { uploadIds, lessonId, lessonName, courseId, moduleName } = body;

    if (!uploadIds || uploadIds.length === 0) {
      throw new BadRequestException('No upload IDs provided');
    }

    console.log('🎬 Starting video processing via BullMQ');
    console.log(`   Lesson ID: ${lessonId}`);
    console.log(`   Course ID: ${courseId || 'new'}`);
    console.log(`   Upload IDs: ${uploadIds.join(', ')}`);

    // Get all upload sessions from Redis (now async)
    const sessionPromises = uploadIds.map(id => this.chunkUploadService.getSession(id));
    const sessionResults = await Promise.all(sessionPromises);
    const sessions = sessionResults.filter(Boolean);

    if (sessions.length === 0) {
      throw new BadRequestException('No valid upload sessions found');
    }

    // Get file paths for all qualities
    const filePaths = sessions.map(session => ({
      quality: session!.quality,
      filePath: session!.filePath,
      fileName: session!.fileName,
    }));

    console.log('📁 File paths:', filePaths);

    // Mark lesson as processing
    try {
      await this.prisma.lesson.update({
        where: { id: lessonId },
        data: {
          videoUrl: 'processing',
          updatedAt: new Date(),
        },
      });
      console.log(`✅ Lesson marked as processing: ${lessonId}`);
    } catch (error) {
      console.error(`❌ Failed to update lesson status: ${error.message}`);
      // Continue anyway - worker will update when complete
    }

    // Initialize status in Redis
    await this.redisService.set(`video:progress:${lessonId}`, {
      lessonId,
      status: 'analyzing',
      progress: 0,
      qualityProgress: [],
      message: 'Adding to processing queue...',
    }, 10800); // 3 hours TTL

    // CRITICAL FIX: Add single job with ALL qualities (not one job per quality)
    // The worker will process all qualities sequentially in one job
    const qualities = filePaths.map(({ quality }) => quality) as ('460p' | '720p' | '1080p')[];
    const firstFile = filePaths[0]; // Use first file as input (all should be same video)
    
    const job = await this.queueManager.addVideoProcessingJob({
      type: 'process_video',
      courseId: courseId || 'new',
      lessonId,
      videoId: lessonId, // Use lessonId as videoId
      qualities, // Pass ALL selected qualities
      inputPath: firstFile.filePath,
      outputPath: `/tmp/output_${lessonId}`,
      userId: 'admin1', // TODO: Get from auth context
      fileName: firstFile.fileName,
    });

    console.log(`✅ Job added with ${qualities.length} qualities: ${job.id}`);

    // Update status in Redis
    await this.redisService.set(`video:progress:${lessonId}`, {
      lessonId,
      status: 'processing',
      progress: 0,
      qualityProgress: qualities.map((quality) => ({
        quality,
        status: 'pending',
        progress: 0,
      })),
      message: 'Video added to processing queue',
    }, 10800); // 3 hours TTL

    return {
      success: true,
      message: 'Video processing started',
      jobId: job.id,
      qualities,
    };
  }

  /**
   * Get job status from Lesson table
   */
  @Get('job/:lessonId')
  async getJobStatus(@Param('lessonId') lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
    });
    
    if (!lesson) {
      throw new NotFoundException(`Lesson ${lessonId} not found`);
    }
    
    // Determine status from lesson data
    let status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' = 'COMPLETED';
    let message = 'Video ready';
    
    if (lesson.videoUrl === 'processing') {
      status = 'PROCESSING';
      message = 'Video is being processed';
    } else if (lesson.videoUrl === 'failed') {
      status = 'FAILED';
      message = 'Video processing failed';
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
      },
    };
  }
}
