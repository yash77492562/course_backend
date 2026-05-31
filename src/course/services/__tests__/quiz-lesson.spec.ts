import { Test, TestingModule } from '@nestjs/testing';
import { CourseService } from '../course.service';
import { PrismaService } from '../../../database/prisma/service/prisma.service';
import { PaginationService } from '../../../pagination/services/pagination.service';
import { R2UploadService } from '../../../upload/services/r2-upload.service';
import { RedisService } from '../../../redis/redis.service';
import { CacheInvalidationService } from '../../../cache/cache-invalidation.service';
import { QueueManagerService } from '../../../queues/queue-manager.service';
import { CourseLevel, CourseStatus, ContentType } from '@prisma/client';

describe('CourseService - Quiz Lessons', () => {
  let service: CourseService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    course: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    courseModule: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    lesson: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    deletePattern: jest.fn(),
    getOrSet: jest.fn((key, callback) => callback()),
  };

  const mockR2UploadService = {
    getSignedUrl: jest.fn(),
    getSignedUrlsForQualities: jest.fn(),
    getProxyUrl: jest.fn(),
    getProxyUrlsForQualities: jest.fn(),
  };

  const mockCacheInvalidationService = {};
  const mockQueueManagerService = {};
  const mockPaginationService = {
    buildPrismaQuery: jest.fn(),
    buildSearchFilter: jest.fn(),
    createPaginatedResult: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CourseService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: PaginationService, useValue: mockPaginationService },
        { provide: R2UploadService, useValue: mockR2UploadService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: CacheInvalidationService, useValue: mockCacheInvalidationService },
        { provide: QueueManagerService, useValue: mockQueueManagerService },
      ],
    }).compile();

    service = module.get<CourseService>(CourseService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createCourse with quiz lessons', () => {
    it('should create a course with quiz lessons and preserve contentType and quizData', async () => {
      const quizData = {
        questions: [
          {
            id: 'q1',
            question: 'What is SQL?',
            options: [
              { id: 'a', text: 'Structured Query Language' },
              { id: 'b', text: 'Simple Query Language' },
            ],
            correctAnswer: 'a',
            explanation: 'SQL stands for Structured Query Language',
            points: 1,
          },
        ],
        passingScore: 70,
        timeLimit: 30,
        allowRetake: true,
      };

      const createCourseDto = {
        title: 'Test Course',
        description: 'Test Description',
        price: 100,
        duration: '8 weeks',
        level: CourseLevel.BEGINNER,
        category: 'test',
        thumbnail: 'test.jpg',
        instructor: 'Test Instructor',
        features: ['feature1'],
        skills: [],
        tools: [],
        outcomes: [],
        careerPaths: [],
        jobTitles: [],
        totalModules: 1,
        totalLessons: 1,
        prerequisites: [],
        requirements: [],
        careerSupport: [],
        certification: false,
        faqs: [],
        highlights: [],
        status: CourseStatus.DRAFT,
        modules: [
          {
            title: 'Module 1',
            description: 'Test Module',
            duration: '1 week',
            order: 1,
            objectives: [],
            lessons: [
              {
                title: 'Quiz Lesson',
                description: 'Test Quiz',
                duration: '30 min',
                order: 1,
                contentType: ContentType.QUIZ,
                videoType: 'UPLOAD',
                quizData: quizData,
              },
            ],
          },
        ],
      };

      const mockCourse = {
        id: 'course-1',
        ...createCourseDto,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockModule = {
        id: 'module-1',
        title: 'Module 1',
        description: 'Test Module',
        duration: '1 week',
        order: 1,
        objectives: [],
        courseId: 'course-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockLesson = {
        id: 'lesson-1',
        title: 'Quiz Lesson',
        description: 'Test Quiz',
        duration: '30 min',
        order: 1,
        contentType: ContentType.QUIZ,
        videoType: 'UPLOAD',
        videoUrl: null,
        videoUrls: null,
        hlsMasterPlaylist: null,
        hlsQualities: null,
        pdfUrl: null,
        pdfPassword: null,
        isPasswordProtected: false,
        quizData: quizData,
        moduleId: 'module-1',
        originalWidth: null,
        originalHeight: null,
        videoDuration: null,
        thumbnail: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockCompleteCourse = {
        ...mockCourse,
        modules: [
          {
            ...mockModule,
            lessons: [mockLesson],
          },
        ],
      };

      mockPrismaService.course.create.mockResolvedValue(mockCourse);
      mockPrismaService.courseModule.create.mockResolvedValue(mockModule);
      mockPrismaService.lesson.create.mockResolvedValue(mockLesson);
      mockPrismaService.course.findUnique.mockResolvedValue(mockCompleteCourse);

      const result = await service.createCourse(createCourseDto as any);

      // Verify course was created
      expect(mockPrismaService.course.create).toHaveBeenCalled();
      expect(mockPrismaService.courseModule.create).toHaveBeenCalled();
      expect(mockPrismaService.lesson.create).toHaveBeenCalled();

      // Verify lesson was created with contentType and quizData
      const lessonCreateCall = mockPrismaService.lesson.create.mock.calls[0][0];
      expect(lessonCreateCall.data.contentType).toBe(ContentType.QUIZ);
      expect(lessonCreateCall.data.quizData).toEqual(quizData);

      // Verify the returned course has the quiz lesson with contentType and quizData
      const courseWithModules = result as any;
      expect(courseWithModules.modules).toHaveLength(1);
      expect(courseWithModules.modules[0].lessons).toHaveLength(1);
      expect(courseWithModules.modules[0].lessons[0].contentType).toBe(ContentType.QUIZ);
      expect(courseWithModules.modules[0].lessons[0].quizData).toEqual(quizData);
    });
  });

  describe('getCourseById with quiz lessons', () => {
    it('should return course with quiz lessons including contentType and quizData', async () => {
      const quizData = {
        questions: [
          {
            id: 'q1',
            question: 'What is SQL?',
            options: [
              { id: 'a', text: 'Structured Query Language' },
              { id: 'b', text: 'Simple Query Language' },
            ],
            correctAnswer: 'a',
            explanation: 'SQL stands for Structured Query Language',
            points: 1,
          },
        ],
        passingScore: 70,
        timeLimit: 30,
        allowRetake: true,
      };

      const mockCourse = {
        id: 'course-1',
        title: 'Test Course',
        description: 'Test Description',
        price: 100,
        duration: '8 weeks',
        level: CourseLevel.BEGINNER,
        category: 'test',
        thumbnail: 'test.jpg',
        instructor: 'Test Instructor',
        rating: 0,
        studentsCount: 0,
        features: ['feature1'],
        skills: [],
        tools: [],
        outcomes: [],
        careerPaths: [],
        jobTitles: [],
        totalModules: 1,
        totalLessons: 1,
        prerequisites: [],
        requirements: [],
        careerSupport: [],
        certification: false,
        faqs: [],
        highlights: [],
        status: CourseStatus.DRAFT,
        createdAt: new Date(),
        updatedAt: new Date(),
        modules: [
          {
            id: 'module-1',
            title: 'Module 1',
            description: 'Test Module',
            duration: '1 week',
            order: 1,
            objectives: [],
            courseId: 'course-1',
            createdAt: new Date(),
            updatedAt: new Date(),
            lessons: [
              {
                id: 'lesson-1',
                title: 'Quiz Lesson',
                order: 1,
                duration: '30 min',
                videoUrl: null,
                contentType: ContentType.QUIZ,
                quizData: quizData,
              },
            ],
          },
        ],
        _count: {
          enrollments: 0,
        },
      };

      // Mock Redis to return the course directly
      mockRedisService.getOrSet.mockImplementation((key, callback) => callback());
      mockPrismaService.course.findUnique.mockResolvedValue(mockCourse);

      const result = await service.getCourseById('course-1');

      // Verify the course has quiz lesson with contentType and quizData
      const courseWithModules = result as any;
      expect(courseWithModules.modules).toHaveLength(1);
      expect(courseWithModules.modules[0].lessons).toHaveLength(1);
      
      const lesson = courseWithModules.modules[0].lessons[0];
      expect(lesson.contentType).toBe(ContentType.QUIZ);
      expect(lesson.quizData).toEqual(quizData);
    });
  });

  describe('getAllCourses with quiz lessons', () => {
    it('should return all courses with quiz lessons including contentType and quizData', async () => {
      const quizData = {
        questions: [
          {
            id: 'q1',
            question: 'What is SQL?',
            options: [
              { id: 'a', text: 'Structured Query Language' },
              { id: 'b', text: 'Simple Query Language' },
            ],
            correctAnswer: 'a',
            explanation: 'SQL stands for Structured Query Language',
            points: 1,
          },
        ],
        passingScore: 70,
        timeLimit: 30,
        allowRetake: true,
      };

      const mockCourses = [
        {
          id: 'course-1',
          title: 'Test Course',
          description: 'Test Description',
          price: 100,
          duration: '8 weeks',
          level: CourseLevel.BEGINNER,
          category: 'test',
          thumbnail: 'test.jpg',
          instructor: 'Test Instructor',
          rating: 0,
          studentsCount: 0,
          features: ['feature1'],
          skills: [],
          tools: [],
          outcomes: [],
          careerPaths: [],
          jobTitles: [],
          totalModules: 1,
          totalLessons: 1,
          prerequisites: [],
          requirements: [],
          careerSupport: [],
          certification: false,
          faqs: [],
          highlights: [],
          status: CourseStatus.PUBLISHED,
          createdAt: new Date(),
          updatedAt: new Date(),
          modules: [
            {
              id: 'module-1',
              title: 'Module 1',
              description: 'Test Module',
              duration: '1 week',
              order: 1,
              objectives: [],
              courseId: 'course-1',
              createdAt: new Date(),
              updatedAt: new Date(),
              lessons: [
                {
                  id: 'lesson-1',
                  title: 'Quiz Lesson',
                  description: 'Test Quiz',
                  duration: '30 min',
                  order: 1,
                  contentType: ContentType.QUIZ,
                  videoType: 'UPLOAD',
                  videoUrl: null,
                  videoUrls: null,
                  hlsMasterPlaylist: null,
                  hlsQualities: null,
                  pdfUrl: null,
                  pdfPassword: null,
                  isPasswordProtected: false,
                  quizData: quizData,
                  moduleId: 'module-1',
                  originalWidth: null,
                  originalHeight: null,
                  videoDuration: null,
                  thumbnail: null,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
              ],
            },
          ],
          _count: {
            enrollments: 0,
          },
        },
      ];

      // Mock Redis to return the courses directly
      mockRedisService.getOrSet.mockImplementation((key, callback) => callback());
      mockPrismaService.course.findMany.mockResolvedValue(mockCourses);

      const result = await service.getAllCourses();

      // Verify courses have quiz lessons with contentType and quizData
      expect(Array.isArray(result)).toBe(true);
      const courses = result as any[];
      expect(courses).toHaveLength(1);
      expect(courses[0].modules).toHaveLength(1);
      expect(courses[0].modules[0].lessons).toHaveLength(1);
      
      const lesson = courses[0].modules[0].lessons[0];
      expect(lesson.contentType).toBe(ContentType.QUIZ);
      expect(lesson.quizData).toEqual(quizData);
    });
  });
});
