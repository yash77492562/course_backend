import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma/service/prisma.service';
import { RedisService } from '../../src/redis/redis.service';

describe('Course Integration Tests', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  let redisService: RedisService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        course: {
          create: jest.fn(),
          findMany: jest.fn(),
          findUnique: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
        },
        courseModule: {
          create: jest.fn(),
          deleteMany: jest.fn(),
        },
        lesson: {
          create: jest.fn(),
        },
      })
      .overrideProvider(RedisService)
      .useValue({
        getOrSet: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
        deletePattern: jest.fn(),
        cacheCourse: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }));

    prismaService = moduleFixture.get<PrismaService>(PrismaService);
    redisService = moduleFixture.get<RedisService>(RedisService);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/courses', () => {
    it('should create a new course', async () => {
      // Arrange
      const createCourseDto = {
        title: 'Integration Test Course',
        description: 'Test Description',
        price: 100,
        discountPrice: 80,
      };

      const mockCourse = {
        id: '1',
        ...createCourseDto,
        status: 'DRAFT',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prismaService.course.create as jest.Mock).mockResolvedValue(mockCourse);

      // Act & Assert
      const response = await request(app.getHttpServer())
        .post('/api/courses')
        .send(createCourseDto)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe(createCourseDto.title);
      expect(prismaService.course.create).toHaveBeenCalledWith({
        data: expect.objectContaining(createCourseDto),
      });
    });

    it('should validate required fields', async () => {
      // Act & Assert
      await request(app.getHttpServer())
        .post('/api/courses')
        .send({
          description: 'Missing title',
        })
        .expect(400);
    });

    it('should validate field types', async () => {
      // Act & Assert
      await request(app.getHttpServer())
        .post('/api/courses')
        .send({
          title: 'Valid Title',
          price: 'invalid-price', // Should be number
        })
        .expect(400);
    });
  });

  describe('GET /api/courses', () => {
    it('should return all courses', async () => {
      // Arrange
      const mockCourses = [
        {
          id: '1',
          title: 'Course 1',
          description: 'Description 1',
          status: 'PUBLISHED',
          price: 100,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          title: 'Course 2',
          description: 'Description 2',
          status: 'DRAFT',
          price: 150,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (prismaService.course.findMany as jest.Mock).mockResolvedValue(mockCourses);

      // Act & Assert
      const response = await request(app.getHttpServer())
        .get('/api/courses')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].title).toBe('Course 1');
    });

    it('should return paginated courses when pagination params provided', async () => {
      // Arrange
      const mockPaginatedResult = {
        data: [
          {
            id: '1',
            title: 'Course 1',
            description: 'Description 1',
            status: 'PUBLISHED',
            price: 100,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
        },
      };

      // Mock the pagination service behavior
      (prismaService.course.findMany as jest.Mock).mockResolvedValue(mockPaginatedResult.data);

      // Act & Assert
      const response = await request(app.getHttpServer())
        .get('/api/courses')
        .query({ page: 1, limit: 10 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });
  });

  describe('GET /api/courses/:id', () => {
    it('should return course by id from cache', async () => {
      // Arrange
      const mockCourse = {
        id: '1',
        title: 'Cached Course',
        description: 'From Cache',
        status: 'PUBLISHED',
        price: 100,
        modules: [],
        _count: { enrollments: 5 },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (redisService.getOrSet as jest.Mock).mockResolvedValue(mockCourse);

      // Act & Assert
      const response = await request(app.getHttpServer())
        .get('/api/courses/1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe('Cached Course');
      expect(redisService.getOrSet).toHaveBeenCalledWith(
        'course:detail:1',
        expect.any(Function),
        1800
      );
    });

    it('should return 404 for non-existent course', async () => {
      // Arrange
      (redisService.getOrSet as jest.Mock).mockImplementation(async (_, fallback) => {
        const result = await fallback();
        return result;
      });
      (prismaService.course.findUnique as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await request(app.getHttpServer())
        .get('/api/courses/999')
        .expect(404);
    });
  });

  describe('PUT /api/courses/:id', () => {
    it('should update course and trigger background refresh', async () => {
      // Arrange
      const updateDto = {
        title: 'Updated Course Title',
        description: 'Updated Description',
      };

      const existingCourse = {
        id: '1',
        title: 'Original Title',
        description: 'Original Description',
        status: 'DRAFT',
        price: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedCourse = {
        ...existingCourse,
        ...updateDto,
        updatedAt: new Date(),
      };

      (prismaService.course.findUnique as jest.Mock).mockResolvedValue(existingCourse);
      (prismaService.course.update as jest.Mock).mockResolvedValue(updatedCourse);
      (prismaService.courseModule.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });

      // Act & Assert
      const response = await request(app.getHttpServer())
        .put('/api/courses/1')
        .send(updateDto)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe(updateDto.title);
      expect(prismaService.course.update).toHaveBeenCalled();
    });

    it('should return 404 for non-existent course', async () => {
      // Arrange
      (prismaService.course.findUnique as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await request(app.getHttpServer())
        .put('/api/courses/999')
        .send({ title: 'Updated Title' })
        .expect(404);
    });
  });

  describe('DELETE /api/courses/:id', () => {
    it('should delete course successfully', async () => {
      // Arrange
      const mockCourse = {
        id: '1',
        title: 'Course to Delete',
        description: 'Will be deleted',
        status: 'DRAFT',
        price: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prismaService.course.findUnique as jest.Mock).mockResolvedValue(mockCourse);
      (prismaService.course.delete as jest.Mock).mockResolvedValue(mockCourse);

      // Act & Assert
      await request(app.getHttpServer())
        .delete('/api/courses/1')
        .expect(200);

      expect(prismaService.course.delete).toHaveBeenCalledWith({
        where: { id: '1' },
      });
    });

    it('should return 404 for non-existent course', async () => {
      // Arrange
      (prismaService.course.findUnique as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await request(app.getHttpServer())
        .delete('/api/courses/999')
        .expect(404);
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      // Arrange
      (prismaService.course.findMany as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      // Act & Assert
      await request(app.getHttpServer())
        .get('/api/courses')
        .expect(500);
    });

    it('should handle Redis connection errors gracefully', async () => {
      // Arrange
      (redisService.getOrSet as jest.Mock).mockRejectedValue(
        new Error('Redis connection failed')
      );

      // Act & Assert
      await request(app.getHttpServer())
        .get('/api/courses/1')
        .expect(500);
    });
  });
});