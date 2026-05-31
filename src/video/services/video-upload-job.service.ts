import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/service/prisma.service';
import { VideoJobStatus } from '@prisma/client';
import { logger } from '../../lib/logger.service';

@Injectable()
export class VideoUploadJobService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create new video upload job in database
   * Uses upsert to handle duplicate bullmqJobId (BullMQ reuses IDs)
   */
  async createJob(data: {
    courseId: string;
    lessonId: string;
    userId?: string; // Optional until we have auth context
    fileName: string;
    fileSize: number;
    moduleName?: string;
    lessonName?: string;
    bullmqJobId: string;
  }) {
    try {
      logger.info('Creating video upload job', {
        bullmqJobId: data.bullmqJobId,
        courseId: data.courseId,
        lessonId: data.lessonId,
      });

      // Use upsert to handle case where BullMQ reuses job IDs
      const job = await this.prisma.videoUploadJob.upsert({
        where: { bullmqJobId: data.bullmqJobId },
        update: {
          // Update existing job with new data
          courseId: data.courseId,
          lessonId: data.lessonId,
          userId: data.userId,
          fileName: data.fileName,
          fileSize: data.fileSize,
          moduleName: data.moduleName,
          lessonName: data.lessonName,
          status: 'QUEUED',
          progress: 0,
          stage: 'queued',
          message: 'Video queued for processing',
          error: null,
          completedAt: null,
          videoUrls: null,
          thumbnailUrl: null,
          masterPlaylistUrl: null,
        },
        create: {
          ...data,
          status: 'QUEUED',
          progress: 0,
          stage: 'queued',
          message: 'Video queued for processing',
        },
      });

      logger.info('Video upload job created successfully', {
        id: job.id,
        bullmqJobId: job.bullmqJobId,
      });

      return job;
    } catch (error) {
      logger.error('Failed to create video upload job', {
        error: error.message,
        stack: error.stack,
        data,
      });
      throw error;
    }
  }

  /**
   * Update job progress in database
   */
  async updateProgress(bullmqJobId: string, data: {
    status?: VideoJobStatus;
    progress?: number;
    stage?: string;
    message?: string;
    queuePosition?: number;
  }) {
    try {
      return await this.prisma.videoUploadJob.update({
        where: { bullmqJobId },
        data: {
          ...data,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      // Job might not exist yet, log but don't throw
      logger.warn('Failed to update video upload job progress', {
        bullmqJobId,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Mark job as completed with result data
   */
  async completeJob(bullmqJobId: string, result: {
    videoUrls: any;
    thumbnailUrl: string;
    masterPlaylistUrl?: string;
  }) {
    try {
      return await this.prisma.videoUploadJob.update({
        where: { bullmqJobId },
        data: {
          status: 'COMPLETED',
          progress: 100,
          stage: 'completed',
          message: 'Video processing complete',
          completedAt: new Date(),
          ...result,
        },
      });
    } catch (error) {
      logger.error('Failed to complete video upload job', {
        bullmqJobId,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Mark job as failed
   */
  async failJob(bullmqJobId: string, error: string) {
    try {
      return await this.prisma.videoUploadJob.update({
        where: { bullmqJobId },
        data: {
          status: 'FAILED',
          stage: 'failed',
          error,
          message: 'Video processing failed',
        },
      });
    } catch (err) {
      logger.error('Failed to mark video upload job as failed', {
        bullmqJobId,
        error: err.message,
      });
      return null;
    }
  }

  /**
   * Get job by ID
   */
  async getJob(id: string) {
    return await this.prisma.videoUploadJob.findUnique({
      where: { id },
    });
  }

  /**
   * Get job by BullMQ job ID
   */
  async getJobByBullmqId(bullmqJobId: string) {
    return await this.prisma.videoUploadJob.findUnique({
      where: { bullmqJobId },
    });
  }

  /**
   * Get active jobs for a course
   */
  async getActiveJobsForCourse(courseId: string) {
    return await this.prisma.videoUploadJob.findMany({
      where: {
        courseId,
        status: {
          in: ['QUEUED', 'PROCESSING'],
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  /**
   * Get all active jobs (for admin dashboard)
   */
  async getAllActiveJobs() {
    return await this.prisma.videoUploadJob.findMany({
      where: {
        status: {
          in: ['QUEUED', 'PROCESSING'],
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  /**
   * Get jobs by lesson ID
   */
  async getJobsByLessonId(lessonId: string) {
    return await this.prisma.videoUploadJob.findMany({
      where: { lessonId },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}
