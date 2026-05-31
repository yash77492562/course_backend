// Mock winston first
jest.mock('winston', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
  format: {
    combine: jest.fn(() => jest.fn()),
    timestamp: jest.fn(() => jest.fn()),
    colorize: jest.fn(() => jest.fn()),
    errors: jest.fn(() => jest.fn()),
    printf: jest.fn(() => jest.fn()),
    json: jest.fn(() => jest.fn()),
  },
  transports: {
    Console: jest.fn(),
    File: jest.fn(),
  },
}));

// Mock ioredis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    keys: jest.fn(),
    ping: jest.fn(),
    on: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
  }));
});

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis.service';
import Redis from 'ioredis';

describe('RedisService - Unit Tests', () => {
  let service: RedisService;
  let mockRedis: jest.Mocked<Redis>;

  beforeEach(async () => {
    // Clear all mocks
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
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

    service = module.get<RedisService>(RedisService);
    
    // Mock the client property
    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      exists: jest.fn(),
      keys: jest.fn(),
      ping: jest.fn(),
      on: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
    } as any;

    // Set the mocked client
    service['client'] = mockRedis;
  });

  describe('get', () => {
    it('should get value from Redis', async () => {
      // Arrange
      const key = 'test:key';
      const value = { test: 'data' };
      mockRedis.get.mockResolvedValue(JSON.stringify(value));

      // Act
      const result = await service.get(key);

      // Assert
      expect(result).toEqual(value);
      expect(mockRedis.get).toHaveBeenCalledWith(key);
    });

    it('should return null for non-existent key', async () => {
      // Arrange
      const key = 'non-existent:key';
      mockRedis.get.mockResolvedValue(null);

      // Act
      const result = await service.get(key);

      // Assert
      expect(result).toBeNull();
      expect(mockRedis.get).toHaveBeenCalledWith(key);
    });
  });

  describe('set', () => {
    it('should set value in Redis without TTL', async () => {
      // Arrange
      const key = 'test:key';
      const value = 'test-value';
      mockRedis.set.mockResolvedValue('OK');

      // Act
      await service.set(key, value);

      // Assert
      expect(mockRedis.set).toHaveBeenCalledWith(key, JSON.stringify(value));
    });

    it('should set value in Redis with TTL', async () => {
      // Arrange
      const key = 'test:key';
      const value = 'test-value';
      const ttl = 3600;
      mockRedis.setex.mockResolvedValue('OK');

      // Act
      await service.set(key, value, ttl);

      // Assert
      expect(mockRedis.setex).toHaveBeenCalledWith(key, ttl, JSON.stringify(value));
    });

    it('should serialize objects to JSON', async () => {
      // Arrange
      const key = 'test:object';
      const value = { id: 1, name: 'Test' };
      mockRedis.set.mockResolvedValue('OK');

      // Act
      await service.set(key, value);

      // Assert
      expect(mockRedis.set).toHaveBeenCalledWith(key, JSON.stringify(value));
    });
  });

  describe('del', () => {
    it('should delete key from Redis', async () => {
      // Arrange
      const key = 'test:key';
      mockRedis.del.mockResolvedValue(1);

      // Act
      await service.del(key);

      // Assert
      expect(mockRedis.del).toHaveBeenCalledWith(key);
    });
  });

  describe('exists', () => {
    it('should check if key exists', async () => {
      // Arrange
      const key = 'test:key';
      mockRedis.exists.mockResolvedValue(1);

      // Act
      const result = await service.exists(key);

      // Assert
      expect(result).toBe(true);
      expect(mockRedis.exists).toHaveBeenCalledWith(key);
    });

    it('should return false for non-existent key', async () => {
      // Arrange
      const key = 'non-existent:key';
      mockRedis.exists.mockResolvedValue(0);

      // Act
      const result = await service.exists(key);

      // Assert
      expect(result).toBe(false);
      expect(mockRedis.exists).toHaveBeenCalledWith(key);
    });
  });

  describe('deletePattern', () => {
    it('should delete keys matching pattern', async () => {
      // Arrange
      const pattern = 'course:*';
      const matchingKeys = ['course:1', 'course:2', 'course:3'];
      mockRedis.keys.mockResolvedValue(matchingKeys);
      mockRedis.del.mockResolvedValue(3);

      // Act
      const result = await service.deletePattern(pattern);

      // Assert
      expect(result).toBe(3);
      expect(mockRedis.keys).toHaveBeenCalledWith(pattern);
      expect(mockRedis.del).toHaveBeenCalledWith(...matchingKeys);
    });

    it('should return 0 when no keys match pattern', async () => {
      // Arrange
      const pattern = 'non-existent:*';
      mockRedis.keys.mockResolvedValue([]);

      // Act
      const result = await service.deletePattern(pattern);

      // Assert
      expect(result).toBe(0);
      expect(mockRedis.keys).toHaveBeenCalledWith(pattern);
      expect(mockRedis.del).not.toHaveBeenCalled();
    });
  });

  describe('getOrSet', () => {
    it('should return cached value if exists', async () => {
      // Arrange
      const key = 'test:key';
      const cachedValue = { id: 1, name: 'Cached' };
      mockRedis.get.mockResolvedValue(JSON.stringify(cachedValue));

      const fallbackFn = jest.fn();

      // Act
      const result = await service.getOrSet(key, fallbackFn, 3600);

      // Assert
      expect(result).toEqual(cachedValue);
      expect(mockRedis.get).toHaveBeenCalledWith(key);
      expect(fallbackFn).not.toHaveBeenCalled();
    });

    it('should call fallback and cache result if key does not exist', async () => {
      // Arrange
      const key = 'test:key';
      const fallbackValue = { id: 1, name: 'Fresh' };
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');

      const fallbackFn = jest.fn().mockResolvedValue(fallbackValue);

      // Act
      const result = await service.getOrSet(key, fallbackFn, 3600);

      // Assert
      expect(result).toEqual(fallbackValue);
      expect(mockRedis.get).toHaveBeenCalledWith(key);
      expect(fallbackFn).toHaveBeenCalled();
      expect(mockRedis.setex).toHaveBeenCalledWith(key, 3600, JSON.stringify(fallbackValue));
    });

    it('should handle fallback function errors', async () => {
      // Arrange
      const key = 'test:key';
      const error = new Error('Fallback failed');
      mockRedis.get.mockResolvedValue(null);

      const fallbackFn = jest.fn().mockRejectedValue(error);

      // Act & Assert
      await expect(service.getOrSet(key, fallbackFn, 3600)).rejects.toThrow('Fallback failed');
      expect(mockRedis.get).toHaveBeenCalledWith(key);
      expect(fallbackFn).toHaveBeenCalled();
    });
  });

  describe('cacheCourse', () => {
    it('should cache course data with proper TTL', async () => {
      // Arrange
      const courseId = '1';
      const courseData = {
        id: '1',
        title: 'Test Course',
        description: 'Test Description',
      };
      mockRedis.setex.mockResolvedValue('OK');

      // Act
      await service.cacheCourse(courseId, courseData);

      // Assert
      expect(mockRedis.setex).toHaveBeenCalledWith(
        `course:detail:${courseId}`,
        1800, // 30 minutes
        JSON.stringify(courseData)
      );
    });
  });

  describe('error handling', () => {
    it('should handle Redis connection errors gracefully', async () => {
      // Arrange
      const key = 'test:key';
      const error = new Error('Redis connection failed');
      mockRedis.get.mockRejectedValue(error);

      // Act
      const result = await service.get(key);

      // Assert
      expect(result).toBeNull();
    });

    it('should handle JSON parsing errors', async () => {
      // Arrange
      const key = 'test:key';
      const invalidJson = 'invalid-json';
      mockRedis.get.mockResolvedValue(invalidJson);

      const fallbackFn = jest.fn().mockResolvedValue({ fallback: true });

      // Act
      const result = await service.getOrSet(key, fallbackFn, 3600);

      // Assert
      expect(result).toEqual({ fallback: true });
      expect(fallbackFn).toHaveBeenCalled();
    });
  });
});