import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  HttpException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { UploadLockService } from '../services/upload-lock.service';
import { QueueManagerService } from '../../queues/queue-manager.service';

@Controller('upload')
export class UploadStatusController {
  constructor(
    private readonly uploadLockService: UploadLockService,
    private readonly queueManager: QueueManagerService,
  ) {}

  /**
   * Check upload status for a course
   * Called by admin panel to check if course is locked
   */
  @Get('status/:courseId')
  async getUploadStatus(@Param('courseId') courseId: string) {
    const isLocked = await this.uploadLockService.isLocked(courseId);

    if (!isLocked) {
      // Check if there are any waiting jobs in the queue
      const waitingCount = await this.queueManager.getVideoQueueWaitingCount();
      
      return {
        isLocked: false,
        currentUpload: null,
        queueInfo: {
          waitingJobs: waitingCount,
        },
      };
    }

    // Get current upload progress
    const progress = await this.uploadLockService.getProgress(courseId);
    const lockOwner = await this.uploadLockService.getLockOwner(courseId);

    // Get queue position if job is waiting
    let queuePosition = null;
    if (progress?.jobId) {
      queuePosition = await this.queueManager.getVideoQueuePosition(progress.jobId);
    }

    return {
      isLocked: true,
      lockOwner,
      currentUpload: {
        ...progress,
        queuePosition, // null if active/processing, number if waiting
      },
    };
  }

  /**
   * Start video upload and acquire lock
   */
  @Post('video/start')
  async startVideoUpload(
    @Body()
    uploadDto: {
      courseId: string;
      lessonId: string;
      userId: string;
      fileName: string;
      fileSize: number;
      moduleName?: string; // NEW: For display in UI
      lessonName?: string; // NEW: For display in UI
    },
  ) {
    const { courseId, lessonId, userId, fileName, fileSize, moduleName, lessonName } = uploadDto;

    // 1. Try to acquire lock (atomic operation)
    const lockAcquired = await this.uploadLockService.acquireLock(
      courseId,
      userId,
    );

    if (!lockAcquired) {
      const lockOwner = await this.uploadLockService.getLockOwner(courseId);
      throw new HttpException(
        {
          message: 'Course is currently locked for upload',
          error: 'COURSE_LOCKED',
          lockedBy: lockOwner,
          statusCode: 423,
        },
        423, // 423 Locked status code
      );
    }

    try {
      // 2. Set initial progress with module/lesson metadata
      await this.uploadLockService.setProgress(courseId, {
        lessonId,
        status: 'uploading',
        progress: 0,
        stage: 'upload',
        message: 'Starting upload...',
        fileName,
        fileSize,
        uploadedBy: userId,
        moduleName, // Store for display
        lessonName, // Store for display
      });

      return {
        success: true,
        message: 'Upload lock acquired',
        courseId,
        lessonId,
      };
    } catch (error) {
      // Release lock on error
      await this.uploadLockService.releaseLock(courseId);
      throw error;
    }
  }

  /**
   * Complete video upload and start processing
   */
  @Post('video/complete')
  async completeVideoUpload(
    @Body()
    completeDto: {
      courseId: string;
      lessonId: string;
      videoId: string;
      userId: string;
      fileName: string;
      inputPath: string;
      outputPath: string;
    },
  ) {
    const {
      courseId,
      lessonId,
      videoId,
      userId,
      fileName,
      inputPath,
      outputPath,
    } = completeDto;

    // Verify lock is held by this user
    const lockOwner = await this.uploadLockService.getLockOwner(courseId);
    if (lockOwner !== userId) {
      throw new HttpException(
        {
          message: 'You do not hold the upload lock for this course',
          error: 'LOCK_NOT_HELD',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    try {
      // Add job to BullMQ for video processing
      const job = await this.queueManager.addVideoProcessingJob({
        type: 'process_video',
        courseId,
        lessonId,
        videoId,
        qualities: ['1080p'],
        inputPath,
        outputPath,
        userId,
        fileName,
      });

      // Update progress with jobId for queue tracking
      await this.uploadLockService.setProgress(courseId, {
        lessonId,
        videoId,
        jobId: job.id as string, // Store BullMQ job ID
        status: 'processing',
        progress: 5,
        stage: 'queued',
        message: 'Upload complete, video queued for processing...',
        fileName,
        uploadedBy: userId,
      });

      return {
        success: true,
        jobId: job.id,
        message: 'Video processing started',
      };
    } catch (error) {
      // Don't release lock here - let the worker handle it
      throw error;
    }
  }

  /**
   * Cancel upload and release lock
   */
  @Delete('cancel/:courseId')
  async cancelUpload(
    @Param('courseId') courseId: string,
    @Body() body: { userId: string },
  ) {
    const { userId } = body;

    // Verify lock is held by this user
    const lockOwner = await this.uploadLockService.getLockOwner(courseId);
    if (lockOwner !== userId) {
      throw new HttpException(
        {
          message: 'You do not hold the upload lock for this course',
          error: 'LOCK_NOT_HELD',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    await this.uploadLockService.releaseLock(courseId);

    return {
      success: true,
      message: 'Upload cancelled and lock released',
    };
  }

  /**
   * Get all active uploads (admin dashboard)
   */
  @Get('active')
  async getActiveUploads() {
    try {
      const activeCourseIds =
        await this.uploadLockService.getActiveUploads();

      const uploads = await Promise.all(
        activeCourseIds.map(async (courseId) => {
          try {
            const progress = await this.uploadLockService.getProgress(courseId);
            const lockOwner = await this.uploadLockService.getLockOwner(courseId);
            
            // Get queue position if jobId exists
            let queuePosition = null;
            if (progress?.jobId) {
              try {
                queuePosition = await this.queueManager.getVideoQueuePosition(progress.jobId);
              } catch (err) {
                // Queue position not available, continue without it
                console.warn(`Could not get queue position for job ${progress.jobId}:`, err.message);
              }
            }
            
            return {
              courseId,
              lockOwner,
              ...progress,
              queuePosition,
            };
          } catch (err) {
            console.error(`Error getting progress for course ${courseId}:`, err);
            return null;
          }
        }),
      );

      // Filter out null values
      const validUploads = uploads.filter(upload => upload !== null);

      return {
        count: validUploads.length,
        uploads: validUploads,
      };
    } catch (error) {
      console.error('Error in getActiveUploads:', error);
      // Return empty array instead of throwing error
      return {
        count: 0,
        uploads: [],
      };
    }
  }

  /**
   * Force release lock (admin override)
   */
  @Delete('force-release/:courseId')
  async forceReleaseLock(
    @Param('courseId') courseId: string,
    @Body() body: { adminUserId: string },
  ) {
    const { adminUserId } = body;

    // TODO: Add admin role check here

    await this.uploadLockService.forceReleaseLock(courseId, adminUserId);

    return {
      success: true,
      message: 'Lock forcefully released',
    };
  }
}
