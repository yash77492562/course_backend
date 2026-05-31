import { Test, TestingModule } from '@nestjs/testing';
import { ChunkUploadService } from '../chunk-upload.service';
import { RedisService } from '../../../redis/redis.service';
import * as fs from 'fs';

// Mock fs module
jest.mock('fs');

describe('ChunkUploadService - Redis Session Storage', () => {
  let service: ChunkUploadService;
  let redisService: RedisService;

  beforeEach(async () => {
    // Mock fs.existsSync to return true
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
    (fs.unlinkSync as jest.Mock).mockReturnValue(undefined);
    (fs.createWriteStream as jest.Mock).mockReturnValue({
      write: jest.fn((chunk, cb) => cb()),
      end: jest.fn(),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChunkUploadService,
        {
          provide: RedisService,
          useValue: {
            set: jest.fn().mockResolvedValue(undefined),
            get: jest.fn(),
            del: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<ChunkUploadService>(ChunkUploadService);
    redisService = module.get<RedisService>(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Cross-Service Session Sharing', () => {
    it('should store session in Redis when initiating upload', async () => {
      const lessonId = 'lesson-123';
      const fileName = 'test-video.mp4';
      const fileSize = 1024 * 1024 * 100; // 100MB
      const quality = '720p';
      const totalChunks = 20;

      const result = await service.initiateUpload(
        lessonId,
        fileName,
        fileSize,
        quality,
        totalChunks,
      );

      expect(result.uploadId).toBeDefined();
      expect(redisService.set).toHaveBeenCalledWith(
        `upload:session:${result.uploadId}`,
        expect.objectContaining({
          uploadId: result.uploadId,
          lessonId,
          fileName,
          fileSize,
          quality,
          totalChunks,
          receivedChunks: [],
        }),
        3600, // TTL
      );
    });

    it('should retrieve session from Redis across different service instances', async () => {
      const uploadId = 'test-upload-id';
      const mockSession = {
        uploadId,
        lessonId: 'lesson-123',
        fileName: 'test.mp4',
        fileSize: 1024,
        quality: '720p',
        totalChunks: 10,
        receivedChunks: [0, 1, 2],
        filePath: '/tmp/test.tmp',
        createdAt: new Date().toISOString(),
      };

      (redisService.get as jest.Mock).mockResolvedValue(mockSession);

      const session = await service.getSession(uploadId);

      expect(redisService.get).toHaveBeenCalledWith(`upload:session:${uploadId}`);
      expect(session).toEqual(mockSession);
    });

    it('should return undefined when session does not exist in Redis', async () => {
      const uploadId = 'non-existent-id';

      (redisService.get as jest.Mock).mockResolvedValue(null);

      const session = await service.getSession(uploadId);

      expect(session).toBeUndefined();
    });

    it('should update session in Redis when handling chunks', async () => {
      const uploadId = 'test-upload-id';
      const mockSession = {
        uploadId,
        lessonId: 'lesson-123',
        fileName: 'test.mp4',
        fileSize: 1024,
        quality: '720p',
        totalChunks: 3,
        receivedChunks: [],
        filePath: '/tmp/test.tmp',
        createdAt: new Date().toISOString(),
      };

      (redisService.get as jest.Mock).mockResolvedValue(mockSession);

      const chunkBuffer = Buffer.from('test chunk data');
      
      await service.handleChunk(uploadId, 0, chunkBuffer);

      expect(redisService.set).toHaveBeenCalledWith(
        `upload:session:${uploadId}`,
        expect.objectContaining({
          receivedChunks: [0],
        }),
        3600,
      );
    });

    it('should delete session from Redis', async () => {
      const uploadId = 'test-upload-id';
      const mockSession = {
        uploadId,
        lessonId: 'lesson-123',
        fileName: 'test.mp4',
        fileSize: 1024,
        quality: '720p',
        totalChunks: 10,
        receivedChunks: [],
        filePath: '/tmp/non-existent.tmp', // File doesn't exist
        createdAt: new Date().toISOString(),
      };

      (redisService.get as jest.Mock).mockResolvedValue(mockSession);
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      await service.deleteSession(uploadId);

      expect(redisService.del).toHaveBeenCalledWith(`upload:session:${uploadId}`);
    });
  });

  describe('Bug Fix Verification - Cross-Service State Sharing', () => {
    it('should allow Gateway service to retrieve sessions created by upload services', async () => {
      // Simulate upload service creating sessions
      const uploadIds = ['upload-460p', 'upload-720p', 'upload-1080p'];
      const mockSessions = uploadIds.map((id, index) => ({
        uploadId: id,
        lessonId: 'lesson-123',
        fileName: 'test.mp4',
        fileSize: 1024,
        quality: ['460p', '720p', '1080p'][index],
        totalChunks: 10,
        receivedChunks: Array.from({ length: 10 }, (_, i) => i), // All chunks received
        filePath: `/tmp/${id}.tmp`,
        createdAt: new Date().toISOString(),
      }));

      // Mock Redis returning sessions
      (redisService.get as jest.Mock).mockImplementation((key: string) => {
        const uploadId = key.replace('upload:session:', '');
        return Promise.resolve(mockSessions.find(s => s.uploadId === uploadId) || null);
      });

      // Simulate Gateway service retrieving all sessions
      const sessionPromises = uploadIds.map(id => service.getSession(id));
      const sessions = await Promise.all(sessionPromises);
      const validSessions = sessions.filter(Boolean);

      // This should NOT throw "No valid upload sessions found" anymore
      expect(validSessions.length).toBe(3);
      expect(validSessions[0]?.quality).toBe('460p');
      expect(validSessions[1]?.quality).toBe('720p');
      expect(validSessions[2]?.quality).toBe('1080p');
    });
  });
});
