import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { PrismaService } from '../../database/prisma/service/prisma.service';

@Injectable()
export class CourseOptimizationService {
  constructor(
    private redisService: RedisService,
    private prisma: PrismaService,
  ) {}

  /**
   * Get course with minimal data for listing
   */
  async getCourseListItem(courseId: string) {
    return this.redisService.getOrSet(
      `course:list:${courseId}`,
      async () => {
        return this.prisma.course.findUnique({
          where: { id: courseId },
          select: {
            id: true,
            title: true,
            description: true,
            thumbnail: true,
            price: true,
            status: true,
            createdAt: true,
            _count: {
              select: {
                modules: true, // Count modules instead of enrollments for now
              },
            },
          },
        });
      },
      900 // 15 minutes for list items
    );
  }

  /**
   * Get course modules without lessons (for navigation)
   */
  async getCourseModules(courseId: string) {
    return this.redisService.getOrSet(
      `course:modules:${courseId}`,
      async () => {
        return this.prisma.courseModule.findMany({
          where: { courseId },
          orderBy: { order: 'asc' },
          select: {
            id: true,
            title: true,
            description: true,
            order: true,
            _count: {
              select: { lessons: true },
            },
          },
        });
      },
      1800 // 30 minutes
    );
  }

  /**
   * Get single lesson with minimal data
   */
  async getLessonMinimal(lessonId: string) {
    return this.redisService.getOrSet(
      `lesson:minimal:${lessonId}`,
      async () => {
        return this.prisma.lesson.findUnique({
          where: { id: lessonId },
          select: {
            id: true,
            title: true,
            description: true,
            duration: true,
            order: true,
            videoUrl: true,
            module: {
              select: {
                id: true,
                title: true,
                courseId: true,
              },
            },
          },
        });
      },
      1800 // 30 minutes
    );
  }

  /**
   * Warm cache for popular courses
   */
  async warmPopularCoursesCache() {
    // TODO: Update when enrollment model is available
    const popularCourses = await this.prisma.course.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { createdAt: 'desc' }, // Use createdAt for now instead of enrollment count
      take: 10,
      select: { id: true },
    });

    await Promise.all(
      popularCourses.map(course => 
        this.getCourseListItem(course.id)
      )
    );
  }

  /**
   * Batch load course list items
   */
  async batchLoadCourseListItems(courseIds: string[]) {
    const cacheKeys = courseIds.map(id => `course:list:${id}`);
    const cached = await Promise.all(
      cacheKeys.map(key => this.redisService.get(key))
    );

    const missingIds = courseIds.filter((_, index) => cached[index] === null);
    
    if (missingIds.length > 0) {
      const freshData = await this.prisma.course.findMany({
        where: { id: { in: missingIds } },
        select: {
          id: true,
          title: true,
          description: true,
          thumbnail: true,
          price: true,
          status: true,
          createdAt: true,
          _count: {
            select: {
              modules: true, // Count modules instead of enrollments for now
            },
          },
        },
      });

      // Cache the fresh data
      await Promise.all(
        freshData.map(course =>
          this.redisService.set(`course:list:${course.id}`, course, 900)
        )
      );

      // Merge cached and fresh data
      const result = courseIds.map(id => {
        const cachedIndex = courseIds.indexOf(id);
        return cached[cachedIndex] || freshData.find(course => course.id === id);
      });

      return result.filter(Boolean);
    }

    return cached.filter(Boolean);
  }
}