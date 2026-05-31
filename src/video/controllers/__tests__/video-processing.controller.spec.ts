import { Test, TestingModule } from '@nestjs/testing';
import { VideoProcessingController } from '../video-processing.controller';
import { VideoAnalyzerService } from '../../services/video-analyzer.service';
import { QueueManagerService } from '../../../queues/queue-manager.service';
import { VideoUploadJobService } from '../../services/video-upload-job.service';
import { PrismaService } from '../../../database/prisma/service/prisma.service';
import { BadRequestException } from '@nestjs/common';

describe('VideoProcessingController', () => {
  let controller: VideoProcessingController;
  let prismaService: PrismaService;
  let videoAnalyzer: VideoAnalyzerService;
  let queueManager: QueueManagerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VideoProcessingController],
      providers: [
        {
          provide: VideoAnalyzerService,
          useValue: {
            analyzeVideoFromBuffer: jest.fn(),
          },
        },
        {
          provide: QueueManagerService,
          useValue: {
            addVideoProcessingJob: jest.fn(),
            getVideoQueuePosition: jest.fn(),
          },
        },
        {
          provide: VideoUploadJobService,
          useValue: {},
        },
        {
          provide: PrismaService,
          useValue: {
            lesson: {
              create: jest.fn(),
              update: jest.fn(),
              findUnique: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    controller = module.get<VideoProcessingController>(VideoProcessingController);
    prismaService = module.get<PrismaService>(PrismaService);
    videoAnalyzer = module.get<VideoAnalyzerService>(VideoAnalyzerService);
    queueManager = module.get<QueueManagerService>(QueueManagerService);
  });

  describe('processVideo', () => {
    it('should reject invalid moduleId when creating new lesson', async () => {
      // Arrange
      const invalidModuleId = '1736345678901'; // 13 characters - NOT a valid ObjectID
      const dto = {
        lessonId: 'frontend_123',
        lessonName: 'Test Lesson',
        qualities: ['720p'],
        uploadId: 'upload_123',
        moduleId: invalidModuleId,
        description: 'Test',
        order: 1,
      };

      // Mock video buffer
      (controller as any).videoBuffers.set('upload_123', Buffer.from('test'));

      // Mock video analysis
      jest.spyOn(videoAnalyzer, 'analyzeVideoFromBuffer').mockResolvedValue({
        width: 1920,
        height: 1080,
        duration: 60,
        isValid: true,
        availableQualities: ['720p', '1080p'],
      });

      // Act & Assert
      await expect(controller.processVideo(dto as any)).rejects.toThrow(
        BadRequestException
      );
      await expect(controller.processVideo(dto as any)).rejects.toThrow(
        'moduleId must be a valid MongoDB ObjectID (24 hex characters)'
      );
    });

    it('should accept valid MongoDB ObjectID for moduleId', async () => {
      // Arrange
      const validModuleId = '507f1f77bcf86cd799439011'; // Valid 24-char ObjectID
      const dto = {
        lessonId: 'frontend_123',
        lessonName: 'Test Lesson',
        qualities: ['720p'],
        uploadId: 'upload_123',
        moduleId: validModuleId,
        description: 'Test',
        order: 1,
      };

      // Mock video buffer
      (controller as any).videoBuffers.set('upload_123', Buffer.from('test'));

      // Mock video analysis
      jest.spyOn(videoAnalyzer, 'analyzeVideoFromBuffer').mockResolvedValue({
        width: 1920,
        height: 1080,
        duration: 60,
        isValid: true,
        availableQualities: ['720p', '1080p'],
      });

      // Mock lesson creation
      jest.spyOn(prismaService.lesson, 'create').mockResolvedValue({
        id: '507f1f77bcf86cd799439012',
        title: 'Test Lesson',
        moduleId: validModuleId,
      } as any);

      // Mock queue job
      jest.spyOn(queueManager, 'addVideoProcessingJob').mockResolvedValue({
        id: 'job_123',
      } as any);

      jest.spyOn(queueManager, 'getVideoQueuePosition').mockResolvedValue(1);

      // Mock fs.writeFileSync
      const fs = require('fs');
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      // Act
      const result = await controller.processVideo(dto as any);

      // Assert
      expect(result.success).toBe(true);
      expect(result.lessonId).toBeDefined();
      expect(prismaService.lesson.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'Test Lesson',
          moduleId: validModuleId,
        }),
      });
    });

    it('should require moduleId when creating new lesson', async () => {
      // Arrange
      const dto = {
        lessonId: 'frontend_123',
        lessonName: 'Test Lesson',
        qualities: ['720p'],
        uploadId: 'upload_123',
        // moduleId is missing
        description: 'Test',
        order: 1,
      };

      // Mock video buffer
      (controller as any).videoBuffers.set('upload_123', Buffer.from('test'));

      // Mock video analysis
      jest.spyOn(videoAnalyzer, 'analyzeVideoFromBuffer').mockResolvedValue({
        width: 1920,
        height: 1080,
        duration: 60,
        isValid: true,
        availableQualities: ['720p', '1080p'],
      });

      // Act & Assert
      await expect(controller.processVideo(dto as any)).rejects.toThrow(
        BadRequestException
      );
      await expect(controller.processVideo(dto as any)).rejects.toThrow(
        'moduleId is required to create a new lesson'
      );
    });
  });
});
