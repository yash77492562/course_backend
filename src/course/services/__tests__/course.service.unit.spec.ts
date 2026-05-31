import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CourseService } from '../course.service';
import { PrismaService } from '../../../database/prisma/service/prisma.service';
import { PaginationService } from '../../../pagination/services/pagination.service';
import { R2UploadService } from '../../../upload/services/r2-upload.service';
import { RedisService } from '../../../redis/redis.service';
import { CacheInvalidationService } from '../../../cache/cache-invalidation.service';
import { QueueManagerService } from '../../../queues/queue-manager.service';

describe('CourseService - Unit Tests', () => {
  let service: CourseService;
  let prismaService: jest.Mocked<PrismaService>;
  let redisService: jest.Mocked<RedisService>;
  let queueManagerService: jest.Mocked<QueueManagerService>;

  const mockCourse = {
    id: '1',
    title: 'Test Course',
    description: 'Test Description',
    status: 'PUBLISHED',
    price: 100,
    discountPrice: 80,
    thumbnailUrl: 'test-thumbnail.jpg',
    duration: '10 hours',
    level: 'Beginner',
    category: 'Data Science',
    thumbnail: 'thumbnail.jpg',
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    modules: [],
    _count: { enrollments: 5 },
  };

  beforeEach(async () => {
    const mockPrismaService = {
      course: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      courseModule: {
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      lesson: {
        create: jest.fn(),
      },
    };

    const mockRedisService = {
      getOrSet: jest.fn(),
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
      deletePattern: jest.fn(),
      cacheCourse: jest.fn(),
    };

    const mockQueueManagerService = {
      addRefreshJob: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CourseService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: PaginationService,
          useValue: {
            paginate: jest.fn(),
          },
        },
        {
          provide: R2UploadService,
          useValue: {
            uploadFile: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: CacheInvalidationService,
          useValue: {
            invalidateCourse: jest.fn(),
          },
        },
        {
          provide: QueueManagerService,
          useValue: mockQueueManagerService,
        },
      ],
    }).compile();

    service = module.get<CourseService>(CourseService);
    prismaService = module.get(PrismaService);
    redisService = module.get(RedisService);
    queueManagerService = module.get(QueueManagerService);
  });

  describe('getCourseById', () => {
    it('should return course from cache if available', async () => {
      // Arrange
      redisService.getOrSet.mockResolvedValue(mockCourse);

      // Act
      const result = await service.getCourseById('1');

      // Assert
      expect(result).toEqual(mockCourse);
      expect(redisService.getOrSet).toHaveBeenCalledWith(
        'course:detail:1',
        expect.any(Function),
        1800
      );
    });

    it('should fetch from database if not in cache', async () => {
      // Arrange
      redisService.getOrSet.mockImplementation(async (_, fallback) => {
        return await fallback();
      });
      (prismaService.course.findUnique as jest.Mock).mockResolvedValue(mockCourse);

      // Act
      const result = await service.getCourseById('1');

      // Assert
      expect(result).toEqual(mockCourse);
    });

    it('should throw NotFoundException if course not found', async () => {
      // Arrange
      redisService.getOrSet.mockImplementation(async (_, fallback) => {
        return await fallback();
      });
      (prismaService.course.findUnique as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.getCourseById('1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createCourse', () => {
    const createCourseDto = {
      title: 'New Course',
      description: 'New Description',
      price: 150,
      duration: '8 hours',
      level: 'INTERMEDIATE' as const,
      category: 'Data Science',
      thumbnail: 'new-thumbnail.jpg',
      instructor: 'John Doe',
      features: ['Feature 1', 'Feature 2'],
    };

    it('should create a new course', async () => {
      // Arrange
      const newCourse = { ...mockCourse, ...createCourseDto };
      (prismaService.course.create as jest.Mock).mockResolvedValue(newCourse);

      // Act
      const result = await service.createCourse(createCourseDto);

      // Assert
      expect(result).toEqual(newCourse);
      expect(prismaService.course.create).toHaveBeenCalledWith({
        data: expect.objectContaining(createCourseDto),
      });
    });

    it('should handle creation errors', async () => {
      // Arrange
      (prismaService.course.create as jest.Mock).mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(service.createCourse(createCourseDto)).rejects.toThrow('Database error');
    });
  });

  describe('updateCourse', () => {
    const updateCourseDto = {
      title: 'Updated Course',
      description: 'Updated Description',
    };

    it('should update course and queue refresh job', async () => {
      // Arrange
      (prismaService.course.findUnique as jest.Mock).mockResolvedValue(mockCourse);
      (prismaService.course.update as jest.Mock).mockResolvedValue({ ...mockCourse, ...updateCourseDto });
      (prismaService.courseModule.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
      queueManagerService.addRefreshJob.mockResolvedValue({} as any);

      // Act
      await service.updateCourse('1', updateCourseDto);

      // Assert
      expect(queueManagerService.addRefreshJob).toHaveBeenCalledWith({
        type: 'refresh_course_data',
        courseId: '1',
        refreshType: 'full',
      });
    });

    it('should throw NotFoundException if course not found', async () => {
      // Arrange
      (prismaService.course.findUnique as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.updateCourse('1', updateCourseDto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteCourse', () => {
    it('should delete course successfully', async () => {
      // Arrange
      (prismaService.course.findUnique as jest.Mock).mockResolvedValue(mockCourse);
      (prismaService.course.delete as jest.Mock).mockResolvedValue(mockCourse);

      // Act
      await service.deleteCourse('1');

      // Assert
      expect(prismaService.course.delete).toHaveBeenCalledWith({
        where: { id: '1' },
      });
    });

    it('should throw NotFoundException if course not found', async () => {
      // Arrange
      (prismaService.course.findUnique as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.deleteCourse('1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAllCourses', () => {
    it('should return all courses without pagination', async () => {
      // Arrange
      const courses = [mockCourse];
      (prismaService.course.findMany as jest.Mock).mockResolvedValue(courses);

      // Act
      const result = await service.getAllCourses();

      // Assert
      expect(result).toEqual(courses);
      expect(prismaService.course.findMany).toHaveBeenCalled();
    });
  });
});