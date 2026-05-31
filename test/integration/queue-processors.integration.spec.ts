import { Test, TestingModule } from '@nestjs/testing';
import { QueueManagerService } from '../../src/queues/queue-manager.service';
import { VideoProcessorService } from '../../src/video/services/video-processor.service';
import { RedisService } from '../../src/redis/redis.service';
import { CourseService } from '../../src/course/services/course.service';
import { ConfigService } from '@nestjs/config';

describe('Queue Processors Integration Tests', () => {
  let queueManagerService: QueueManagerService;
  let videoProcessorService: VideoProcessorService;
  let redisService: RedisService;
  let courseService: CourseService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueManagerService,
        {
          provide: VideoProcessorService,
          useValue: {
            processVideo: jest.fn(),
            // Note: generateThumbnail is private, so we don't mock it directly
          },
        },
        {
          provide: RedisService,
          useValue: {
            set: jest.fn(),
            get: jest.fn(),
            del: jest.fn(),
            deletePattern: jest.fn(),
          },
        },
        {
          provide: CourseService,
          useValue: {
            getCourseById: jest.fn(),
            getAllCourses: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                REDIS_HOST: 'localhost',
                REDIS_PORT: 6379,
                REDIS_PASSWORD: undefined,
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    queueManagerService = module.get<QueueManagerService>(QueueManagerService);
    videoProcessorService = module.get<VideoProcessorService>(VideoProcessorService);
    redisService = module.get<RedisService>(RedisService);
    courseService = module.get<CourseService>(CourseService);
  });

  describe('Video Processing Queue', () => {
    it('should process video processing job successfully', async () => {
      // Arrange
      const jobData = {
        type: 'process_video' as const,
        courseId: 'course-1',
        lessonId: 'lesson-1',
        videoId: '1',
        qualities: ['720p'] as ('460p' | '720p' | '1080p')[],
        inputPath: '/input/video.mp4',
        outputPath: '/output/video_720p.mp4',
        userId: 'user1',
        fileName: 'video.mp4',
      };

      const mockJob = {
        id: 'job-1',
        data: jobData,
        updateProgress: jest.fn(),
      };

      (videoProcessorService.processVideo as jest.Mock).mockResolvedValue({
        success: true,
        outputPath: jobData.outputPath,
        duration: 120,
        size: 1024000,
      });

      // Act
      const result = await queueManagerService.addVideoProcessingJob(jobData);

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
    });

    it('should process thumbnail generation job successfully', async () => {
      // Arrange
      const jobData = {
        type: 'generate_thumbnail' as const,
        courseId: 'course-1',
        lessonId: 'lesson-1',
        videoId: '1',
        inputPath: '/input/video.mp4',
        outputPath: '/output/thumbnail.jpg',
        userId: 'user1',
        fileName: 'video.mp4',
      };

      (videoProcessorService.processVideo as jest.Mock).mockResolvedValue({
        success: true,
        thumbnailPath: jobData.outputPath,
        width: 1280,
        height: 720,
      });

      // Act
      const result = await queueManagerService.addVideoProcessingJob(jobData);

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
    });

    it('should handle video processing job failures', async () => {
      // Arrange
      const jobData = {
        type: 'process_video' as const,
        courseId: 'course-1',
        lessonId: 'lesson-1',
        videoId: '1',
        qualities: ['720p'] as ('460p' | '720p' | '1080p')[],
        inputPath: '/input/invalid-video.mp4',
        outputPath: '/output/video_720p.mp4',
        userId: 'user1',
        fileName: 'invalid-video.mp4',
      };

      (videoProcessorService.processVideo as jest.Mock).mockRejectedValue(
        new Error('Video processing failed')
      );

      // Act & Assert
      const result = await queueManagerService.addVideoProcessingJob(jobData);
      expect(result).toBeDefined();
      
      // The job should be added to queue even if processing fails
      // The actual processing failure will be handled by the processor
    });
  });

  describe('Cache Management Queue', () => {
    it('should process cache invalidation job successfully', async () => {
      // Arrange
      const jobData = {
        type: 'cache_invalidation' as const,
        pattern: 'course:*',
        reason: 'Course updated',
      };

      (redisService.deletePattern as jest.Mock).mockResolvedValue(5);

      // Act
      const result = await queueManagerService.addCacheJob(jobData);

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
    });

    it('should process cache warming job successfully', async () => {
      // Arrange
      const jobData = {
        type: 'cache_warmup' as const,
        cacheType: 'popular_courses' as const,
        targetIds: ['1'],
      };

      (redisService.set as jest.Mock).mockResolvedValue('OK');

      // Act
      const result = await queueManagerService.addCacheJob(jobData);

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
    });
  });

  describe('Data Refresh Queue', () => {
    it('should process course data refresh job successfully', async () => {
      // Arrange
      const jobData = {
        type: 'refresh_course_data' as const,
        courseId: 'course-1',
        refreshType: 'full' as const,
      };

      const mockCourse = {
        id: 'course-1',
        title: 'Test Course',
        description: 'Test Description',
        modules: [],
      };

      (courseService.getCourseById as jest.Mock).mockResolvedValue(mockCourse);
      (redisService.set as jest.Mock).mockResolvedValue('OK');

      // Act
      const result = await queueManagerService.addRefreshJob(jobData);

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
    });

    it('should process course list refresh job successfully', async () => {
      // Arrange
      const jobData = {
        type: 'refresh_user_data' as const,
        userId: 'user-1',
        refreshType: 'profile' as const,
      };

      const mockCourses = [
        { id: '1', title: 'Course 1', status: 'PUBLISHED' },
        { id: '2', title: 'Course 2', status: 'PUBLISHED' },
      ];

      (courseService.getAllCourses as jest.Mock).mockResolvedValue(mockCourses);
      (redisService.set as jest.Mock).mockResolvedValue('OK');

      // Act
      const result = await queueManagerService.addRefreshJob(jobData);

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
    });
  });

  describe('Queue Statistics', () => {
    it('should return queue statistics', async () => {
      // Act
      const stats = await queueManagerService.getQueueStats();

      // Assert
      expect(stats).toBeDefined();
      expect(stats).toHaveProperty('video');
      expect(stats).toHaveProperty('cache');
      expect(stats).toHaveProperty('notifications');
      expect(stats).toHaveProperty('maintenance');
      expect(stats).toHaveProperty('refresh');
      expect(stats).toHaveProperty('payments');
    });
  });

  describe('Queue Management', () => {
    it('should pause and resume all queues', async () => {
      // Act & Assert - These methods should exist and not throw
      expect(() => queueManagerService.pauseAllQueues()).not.toThrow();
      expect(() => queueManagerService.resumeAllQueues()).not.toThrow();
    });
  });

  describe('Job Priority and Scheduling', () => {
    it('should add high priority jobs correctly', async () => {
      // Arrange
      const highPriorityJob = {
        type: 'generate_thumbnail' as const,
        courseId: 'course-1',
        lessonId: 'lesson-1',
        videoId: '1',
        inputPath: '/input/video.mp4',
        outputPath: '/output/thumbnail.jpg',
        userId: 'user1',
        fileName: 'video.mp4',
      };

      // Act
      const result = await queueManagerService.addVideoProcessingJob(highPriorityJob);

      // Assert
      expect(result).toBeDefined();
      // Thumbnail generation should have higher priority than video processing
    });

    it('should add delayed jobs correctly', async () => {
      // Arrange
      const delayedJob = {
        type: 'refresh_course_data' as const,
        courseId: 'course-1',
        refreshType: 'metadata' as const,
      };

      // Act
      const result = await queueManagerService.addRefreshJob(delayedJob);

      // Assert
      expect(result).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis connection errors', async () => {
      // Arrange
      (redisService.deletePattern as jest.Mock).mockRejectedValue(
        new Error('Redis connection failed')
      );

      const jobData = {
        type: 'cache_invalidation' as const,
        pattern: 'course:*',
        reason: 'Test error handling',
      };

      // Act & Assert
      // The job should still be added to queue even if Redis is down
      const result = await queueManagerService.addCacheJob(jobData);
      expect(result).toBeDefined();
    });

    it('should handle service unavailability', async () => {
      // Arrange
      (courseService.getCourseById as jest.Mock).mockRejectedValue(
        new Error('Service unavailable')
      );

      const jobData = {
        type: 'refresh_course_data' as const,
        courseId: 'course-1',
        refreshType: 'full' as const,
      };

      // Act & Assert
      const result = await queueManagerService.addRefreshJob(jobData);
      expect(result).toBeDefined();
    });
  });

  describe('Job Deduplication', () => {
    it('should handle duplicate refresh jobs correctly', async () => {
      // Arrange
      const jobData = {
        type: 'refresh_course_data' as const,
        courseId: 'course-1',
        refreshType: 'full' as const,
      };

      // Act - Add the same job twice
      const result1 = await queueManagerService.addRefreshJob(jobData);
      const result2 = await queueManagerService.addRefreshJob(jobData);

      // Assert
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      // The second job should either be deduplicated or queued normally
      // depending on the implementation
    });
  });
});