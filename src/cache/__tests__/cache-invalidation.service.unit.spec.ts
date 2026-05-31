import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { CacheInvalidationService } from '../cache-invalidation.service';

describe('CacheInvalidationService - Unit Tests', () => {
  let service: CacheInvalidationService;
  let cacheManager: jest.Mocked<any>;

  beforeEach(async () => {
    const mockCacheManager = {
      del: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheInvalidationService,
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
      ],
    }).compile();

    service = module.get<CacheInvalidationService>(CacheInvalidationService);
    cacheManager = module.get(CACHE_MANAGER);
  });

  describe('invalidateCourse', () => {
    it('should invalidate all course-related cache keys', async () => {
      // Arrange
      const courseId = '123';
      cacheManager.del.mockResolvedValue(undefined);

      // Act
      await service.invalidateCourse(courseId);

      // Assert
      expect(cacheManager.del).toHaveBeenCalledWith(`course:detail:${courseId}`);
      expect(cacheManager.del).toHaveBeenCalledWith(`course:modules:${courseId}`);
      expect(cacheManager.del).toHaveBeenCalledWith(`course:lessons:${courseId}`);
      expect(cacheManager.del).toHaveBeenCalledWith('courses:published');
      expect(cacheManager.del).toHaveBeenCalledTimes(4);
    });

    it('should handle cache deletion errors gracefully', async () => {
      // Arrange
      const courseId = '123';
      const error = new Error('Cache deletion failed');
      cacheManager.del.mockRejectedValue(error);

      // Act & Assert
      await expect(service.invalidateCourse(courseId)).rejects.toThrow('Cache deletion failed');
    });
  });

  describe('invalidateUser', () => {
    it('should invalidate all user-related cache keys', async () => {
      // Arrange
      const userId = '456';
      cacheManager.del.mockResolvedValue(undefined);

      // Act
      await service.invalidateUser(userId);

      // Assert
      expect(cacheManager.del).toHaveBeenCalledWith(`user:profile:${userId}`);
      expect(cacheManager.del).toHaveBeenCalledWith(`user:session:${userId}`);
      expect(cacheManager.del).toHaveBeenCalledWith(`user:purchases:${userId}`);
      expect(cacheManager.del).toHaveBeenCalledTimes(3);
    });
  });

  describe('invalidateLesson', () => {
    it('should invalidate lesson cache', async () => {
      // Arrange
      const lessonId = '789';
      cacheManager.del.mockResolvedValue(undefined);

      // Act
      await service.invalidateLesson(lessonId);

      // Assert
      expect(cacheManager.del).toHaveBeenCalledWith(`lesson:${lessonId}`);
      expect(cacheManager.del).toHaveBeenCalledTimes(1);
    });
  });

  describe('invalidateOrder', () => {
    it('should invalidate order cache', async () => {
      // Arrange
      const orderId = 'order-123';
      cacheManager.del.mockResolvedValue(undefined);

      // Act
      await service.invalidateOrder(orderId);

      // Assert
      expect(cacheManager.del).toHaveBeenCalledWith(`order:${orderId}`);
      expect(cacheManager.del).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should handle cache manager errors', async () => {
      // Arrange
      const userId = '123';
      const error = new Error('Cache manager connection failed');
      cacheManager.del.mockRejectedValue(error);

      // Act & Assert
      await expect(service.invalidateUser(userId)).rejects.toThrow('Cache manager connection failed');
    });
  });
});