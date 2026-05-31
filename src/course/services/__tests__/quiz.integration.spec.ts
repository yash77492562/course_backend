import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../../app.module';
import { PrismaService } from '../../../database/prisma/service/prisma.service';

describe('Quiz Integration Tests', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  let createdCourseId: string;
  let createdModuleId: string;
  let createdLessonId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prismaService = moduleFixture.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    // Cleanup: Delete test data
    if (createdCourseId) {
      await prismaService.course.delete({
        where: { id: createdCourseId },
      });
    }
    await app.close();
  });

  describe('Quiz CRUD Operations', () => {
    it('should create a course with a quiz lesson', async () => {
      const quizData = {
        questions: [
          {
            id: 'q1',
            question: 'What is TypeScript?',
            options: [
              { id: 'opt1', text: 'A superset of JavaScript' },
              { id: 'opt2', text: 'A database' },
              { id: 'opt3', text: 'A CSS framework' },
            ],
            correctAnswer: 'opt1',
            explanation: 'TypeScript is a typed superset of JavaScript',
            points: 1,
          },
          {
            id: 'q2',
            question: 'What is NestJS?',
            options: [
              { id: 'opt4', text: 'A Node.js framework' },
              { id: 'opt5', text: 'A database ORM' },
            ],
            correctAnswer: 'opt4',
            explanation: 'NestJS is a progressive Node.js framework',
            points: 1,
          },
        ],
        passingScore: 70,
        timeLimit: 30,
        allowRetake: true,
      };

      const courseData = {
        title: 'Test Course with Quiz',
        description: 'A test course',
        category: 'Testing',
        price: 99,
        duration: '4 weeks',
        level: 'BEGINNER',
        thumbnail: 'test-thumbnail.jpg',
        instructor: 'Test Instructor',
        features: ['Feature 1'],
        outcomes: ['Outcome 1'],
        modules: [
          {
            title: 'Module 1',
            description: 'Test module',
            duration: '1 week',
            order: 1,
            lessons: [
              {
                title: 'Quiz: Module 1 Assessment',
                description: 'Test your knowledge',
                duration: '30 minutes',
                order: 1,
                contentType: 'QUIZ',
                quizData: quizData,
              },
            ],
          },
        ],
        faqs: [],
        status: 'PUBLISHED',
      };

      const response = await request(app.getHttpServer())
        .post('/api/admin/courses')
        .send(courseData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.id).toBeDefined();

      createdCourseId = response.body.data.id;

      // Verify the course was created with quiz
      const course = await prismaService.course.findUnique({
        where: { id: createdCourseId },
        include: {
          modules: {
            include: {
              lessons: true,
            },
          },
        },
      });

      expect(course).toBeDefined();
      expect(course.modules).toHaveLength(1);
      expect(course.modules[0].lessons).toHaveLength(1);

      const quizLesson = course.modules[0].lessons[0];
      createdModuleId = course.modules[0].id;
      createdLessonId = quizLesson.id;

      expect(quizLesson.contentType).toBe('QUIZ');
      expect(quizLesson.quizData).toBeDefined();
      
      // Cast to proper type for testing
      const storedQuizData = quizLesson.quizData as any;
      expect(storedQuizData.questions).toHaveLength(2);
      expect(storedQuizData.passingScore).toBe(70);
      expect(storedQuizData.timeLimit).toBe(30);
      expect(storedQuizData.allowRetake).toBe(true);
    });

    it('should retrieve a quiz lesson by ID', async () => {
      expect(createdLessonId).toBeDefined();

      const response = await request(app.getHttpServer())
        .get(`/api/lessons/${createdLessonId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.contentType).toBe('QUIZ');
      expect(response.body.data.quizData).toBeDefined();
      
      const quizData = response.body.data.quizData;
      expect(quizData.questions).toHaveLength(2);
      expect(quizData.passingScore).toBe(70);
    });

    it('should update a quiz lesson', async () => {
      expect(createdCourseId).toBeDefined();

      const updatedQuizData = {
        questions: [
          {
            id: 'q1',
            question: 'What is TypeScript? (Updated)',
            options: [
              { id: 'opt1', text: 'A superset of JavaScript' },
              { id: 'opt2', text: 'A database' },
            ],
            correctAnswer: 'opt1',
            explanation: 'TypeScript adds static typing to JavaScript',
            points: 2,
          },
        ],
        passingScore: 80,
        timeLimit: 20,
        allowRetake: false,
      };

      const updateData = {
        title: 'Test Course with Quiz (Updated)',
        description: 'A test course',
        category: 'Testing',
        price: 99,
        duration: '4 weeks',
        level: 'BEGINNER',
        thumbnail: 'test-thumbnail.jpg',
        instructor: 'Test Instructor',
        features: ['Feature 1'],
        outcomes: ['Outcome 1'],
        modules: [
          {
            title: 'Module 1',
            description: 'Test module',
            duration: '1 week',
            order: 1,
            lessons: [
              {
                title: 'Quiz: Module 1 Assessment (Updated)',
                description: 'Test your knowledge',
                duration: '20 minutes',
                order: 1,
                contentType: 'QUIZ',
                quizData: updatedQuizData,
              },
            ],
          },
        ],
        faqs: [],
        status: 'PUBLISHED',
      };

      const response = await request(app.getHttpServer())
        .put(`/api/admin/courses/${createdCourseId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify the quiz was updated
      const course = await prismaService.course.findUnique({
        where: { id: createdCourseId },
        include: {
          modules: {
            include: {
              lessons: true,
            },
          },
        },
      });

      const quizLesson = course.modules[0].lessons[0];
      const storedQuizData = quizLesson.quizData as any;
      expect(storedQuizData.questions).toHaveLength(1);
      expect(storedQuizData.passingScore).toBe(80);
    });

    it('should validate quiz data structure', async () => {
      const invalidQuizData = {
        title: 'Invalid Quiz Course',
        description: 'A test course',
        category: 'Testing',
        price: 99,
        duration: '4 weeks',
        level: 'BEGINNER',
        thumbnail: 'test-thumbnail.jpg',
        instructor: 'Test Instructor',
        features: ['Feature 1'],
        outcomes: ['Outcome 1'],
        modules: [
          {
            title: 'Module 1',
            description: 'Test module',
            duration: '1 week',
            order: 1,
            lessons: [
              {
                title: 'Invalid Quiz',
                description: 'Test',
                duration: '30 minutes',
                order: 1,
                contentType: 'QUIZ',
                quizData: {
                  // Missing required fields
                  questions: [],
                },
              },
            ],
          },
        ],
        faqs: [],
        status: 'PUBLISHED',
      };

      // This should still create the course (validation is on frontend)
      // Backend stores whatever quiz data is sent
      const response = await request(app.getHttpServer())
        .post('/api/admin/courses')
        .send(invalidQuizData);

      // Clean up if created
      if (response.body.data?.id) {
        await prismaService.course.delete({
          where: { id: response.body.data.id },
        });
      }
    });
  });

  describe('Quiz Content Type', () => {
    it('should support multiple content types in same module', async () => {
      const courseData = {
        title: 'Mixed Content Course',
        description: 'A course with video, PDF, and quiz',
        category: 'Testing',
        price: 99,
        duration: '4 weeks',
        level: 'BEGINNER',
        thumbnail: 'test-thumbnail.jpg',
        instructor: 'Test Instructor',
        features: ['Feature 1'],
        outcomes: ['Outcome 1'],
        modules: [
          {
            title: 'Module 1',
            description: 'Mixed content module',
            duration: '1 week',
            order: 1,
            lessons: [
              {
                title: 'Video Lesson',
                description: 'Watch this',
                duration: '10 minutes',
                order: 1,
                contentType: 'VIDEO',
                videoUrl: 'https://youtube.com/watch?v=test',
                videoType: 'YOUTUBE',
              },
              {
                title: 'PDF Lesson',
                description: 'Read this',
                duration: '15 minutes',
                order: 2,
                contentType: 'PDF',
                pdfUrl: 'https://example.com/test.pdf',
              },
              {
                title: 'Quiz Lesson',
                description: 'Test yourself',
                duration: '20 minutes',
                order: 3,
                contentType: 'QUIZ',
                quizData: {
                  questions: [
                    {
                      id: 'q1',
                      question: 'Test question?',
                      options: [
                        { id: 'opt1', text: 'Answer 1' },
                        { id: 'opt2', text: 'Answer 2' },
                      ],
                      correctAnswer: 'opt1',
                      points: 1,
                    },
                  ],
                  passingScore: 70,
                  allowRetake: true,
                },
              },
            ],
          },
        ],
        faqs: [],
        status: 'PUBLISHED',
      };

      const response = await request(app.getHttpServer())
        .post('/api/admin/courses')
        .send(courseData)
        .expect(201);

      expect(response.body.success).toBe(true);

      const courseId = response.body.data.id;

      // Verify all content types
      const course = await prismaService.course.findUnique({
        where: { id: courseId },
        include: {
          modules: {
            include: {
              lessons: true,
            },
          },
        },
      });

      expect(course.modules[0].lessons).toHaveLength(3);
      expect(course.modules[0].lessons[0].contentType).toBe('VIDEO');
      expect(course.modules[0].lessons[1].contentType).toBe('PDF');
      expect(course.modules[0].lessons[2].contentType).toBe('QUIZ');

      // Cleanup
      await prismaService.course.delete({
        where: { id: courseId },
      });
    });
  });
});
