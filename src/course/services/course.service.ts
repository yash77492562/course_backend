import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/service/prisma.service';
import { PaginationService } from '../../pagination/services/pagination.service';
import { R2UploadService } from '../../upload/services/r2-upload.service';
import { RedisService } from '../../redis/redis.service';
import { CacheInvalidationService } from '../../cache/cache-invalidation.service';
import { QueueManagerService } from '../../queues/queue-manager.service';
import { CreateCourseDto, UpdateCourseDto, CreateModuleDto, UpdateModuleDto } from '../dto/course.dto';
import { PaginationDto, PaginatedResult } from '../../pagination/dto/pagination.dto';
import { Course, CourseModule, CourseStatus } from '@prisma/client';

@Injectable()
export class CourseService {
  constructor(
    private prisma: PrismaService,
    private paginationService: PaginationService,
    private r2UploadService: R2UploadService,
    private redisService: RedisService,
    private cacheInvalidationService: CacheInvalidationService,
    private queueManagerService: QueueManagerService,
  ) {}

  async createCourse(createCourseDto: CreateCourseDto): Promise<Course> {
    console.log('\n💾 ========== COURSE SERVICE: CREATE COURSE ==========');
    console.log('📦 Received DTO:', JSON.stringify(createCourseDto, null, 2));
    
    // Extract modules and other nested data that need special handling
    const { modules, ...courseData } = createCourseDto as any;

    console.log('📝 Creating course with basic data...');
    console.log('📋 FAQs being saved:', courseData.faqs);
    
    // Create the course basic data first (excluding modules and nested relations)
    const createdCourse = await this.prisma.course.create({
      data: courseData,
    });

    console.log('✅ Course created:', createdCourse.id);

    // Handle modules separately if provided
    if (modules && Array.isArray(modules)) {
      console.log(`📚 Creating ${modules.length} modules...`);
      
      // Create new modules
      for (const moduleData of modules) {
        const { lessons, ...moduleInfo } = moduleData;
        
        console.log(`\n📖 Creating module: ${moduleInfo.title}`);
        console.log(`   Module ID from frontend: ${moduleInfo.id || 'NOT PROVIDED'}`);
        
        // CRITICAL FIX: Use the ID from frontend if provided (for video upload compatibility)
        // This ensures videos uploaded before saving use the same module ID
        const moduleCreateData: any = {
          ...moduleInfo,
          courseId: createdCourse.id,
        };
        
        // If frontend provided a valid MongoDB ObjectID, use it
        if (moduleInfo.id && /^[0-9a-fA-F]{24}$/.test(moduleInfo.id)) {
          moduleCreateData.id = moduleInfo.id;
          console.log(`   ✅ Using frontend-provided module ID: ${moduleInfo.id}`);
        } else {
          console.log(`   ⚠️ No valid module ID from frontend, Prisma will generate one`);
        }
        
        const createdModule = await this.prisma.courseModule.create({
          data: moduleCreateData,
        });

        console.log(`✅ Module created: ${createdModule.id}`);

        // Create lessons for this module if provided
        if (lessons && Array.isArray(lessons)) {
          console.log(`   📹 Processing ${lessons.length} lessons...`);
          
          for (const lessonData of lessons) {
            console.log(`\n   🎬 Processing lesson: ${lessonData.title}`);
            console.log(`      Lesson ID: ${lessonData.id || 'NOT PROVIDED'}`);
            console.log(`      contentType: ${lessonData.contentType}`);
            console.log(`      videoType: ${lessonData.videoType}`);
            console.log(`      hlsQualities: ${lessonData.hlsQualities ? 'YES ✅' : 'NO ❌'}`);
            console.log(`      hlsMasterPlaylist: ${lessonData.hlsMasterPlaylist ? 'YES ✅' : 'NO ❌'}`);
            console.log(`      thumbnail: ${lessonData.thumbnail ? 'YES ✅' : 'NO ❌'}`);
            
            if (lessonData.hlsQualities) {
              console.log(`      HLS Data:`, JSON.stringify(lessonData.hlsQualities, null, 2));
            }
            
            // CRITICAL FIX: Check if lesson already exists (from video upload)
            // If lesson has an ID and exists in database, UPDATE it instead of creating duplicate
            let finalLesson;
            
            if (lessonData.id && /^[0-9a-fA-F]{24}$/.test(lessonData.id)) {
              // Check if lesson exists
              const existingLesson = await this.prisma.lesson.findUnique({
                where: { id: lessonData.id },
              });
              
              if (existingLesson) {
                console.log(`   ⚠️  Lesson already exists (from video upload), UPDATING instead of creating`);
                console.log(`      Existing lesson ID: ${existingLesson.id}`);
                
                // Update existing lesson with new data from course editor
                finalLesson = await this.prisma.lesson.update({
                  where: { id: lessonData.id },
                  data: {
                    ...lessonData,
                    moduleId: createdModule.id, // Ensure correct module association
                  },
                });
                
                console.log(`   ✅ Lesson UPDATED: ${finalLesson.id}`);
              } else {
                console.log(`   ℹ️  Lesson ID provided but not found in database, creating new lesson`);
                
                // Lesson ID provided but doesn't exist - create with provided ID
                finalLesson = await this.prisma.lesson.create({
                  data: {
                    ...lessonData,
                    moduleId: createdModule.id,
                  },
                });
                
                console.log(`   ✅ Lesson CREATED: ${finalLesson.id}`);
              }
            } else {
              console.log(`   ℹ️  No valid lesson ID provided, creating new lesson`);
              
              // No ID provided - create new lesson
              finalLesson = await this.prisma.lesson.create({
                data: {
                  ...lessonData,
                  moduleId: createdModule.id,
                },
              });
              
              console.log(`   ✅ Lesson CREATED: ${finalLesson.id}`);
            }
            
            console.log(`      Stored hlsQualities: ${finalLesson.hlsQualities ? 'YES ✅' : 'NO ❌'}`);
            
            if (finalLesson.hlsQualities) {
              console.log(`      Stored HLS Data:`, JSON.stringify(finalLesson.hlsQualities, null, 2));
            }
          }
        }
      }
    }

    console.log('\n✅ All modules and lessons created');
    console.log('📦 Fetching complete course with relations...');

    // Return the created course with all relations
    const completeCourse = await this.prisma.course.findUnique({
      where: { id: createdCourse.id },
      include: {
        modules: {
          orderBy: { order: 'asc' },
          include: {
            lessons: {
              orderBy: { order: 'asc' },
            },
          },
        },
      },
    });
    
    console.log('✅ Complete course fetched');
    console.log('💾 ========== END COURSE SERVICE ==========\n');

    return completeCourse;
  }

  async getAllCourses(paginationDto?: PaginationDto): Promise<PaginatedResult<Course> | Course[]> {
    // Check if pagination is actually being used (not just default values)
    // If only defaults are present (page=1, limit=10) and no search/sort, treat as non-paginated
    const hasCustomPagination = paginationDto && (
      (paginationDto.page !== undefined && paginationDto.page !== 1) ||
      (paginationDto.limit !== undefined && paginationDto.limit !== 10) ||
      paginationDto.search !== undefined ||
      paginationDto.sortBy !== undefined
    );

    if (!hasCustomPagination) {
      // Use cache for non-paginated requests (default pagination values)
      const cacheKey = 'courses:all';
      return this.redisService.getOrSet(
        cacheKey,
        async () => {
          return this.prisma.course.findMany({
            include: {
              modules: {
                orderBy: { order: 'asc' },
                include: {
                  lessons: {
                    orderBy: { order: 'asc' },
                  },
                },
              },
              _count: {
                select: {
                  modules: true, // Count modules instead of enrollments for now
                },
              },
            },
            orderBy: { createdAt: 'desc' },
          });
        },
        900 // 15 minutes cache for course lists
      );
    }

    const query = this.paginationService.buildPrismaQuery(paginationDto);
    const searchFilter = paginationDto.search 
      ? this.paginationService.buildSearchFilter(paginationDto.search, ['title', 'description', 'category'])
      : {};

    const [courses, total] = await Promise.all([
      this.prisma.course.findMany({
        ...query,
        where: searchFilter,
        include: {
          modules: {
            orderBy: { order: 'asc' },
            include: {
              lessons: {
                orderBy: { order: 'asc' },
              },
            },
          },
          _count: {
            select: {
              enrollments: true,
            },
          },
        },
      }),
      this.prisma.course.count({
        where: searchFilter,
      }),
    ]);

    return this.paginationService.createPaginatedResult(courses, total, paginationDto);
  }

  async getPublishedCourses(paginationDto?: PaginationDto): Promise<PaginatedResult<Course> | Course[]> {
    // Check if pagination is actually being used (not just default values)
    // If only defaults are present (page=1, limit=10) and no search/sort, treat as non-paginated
    const hasCustomPagination = paginationDto && (
      (paginationDto.page !== undefined && paginationDto.page !== 1) ||
      (paginationDto.limit !== undefined && paginationDto.limit !== 10) ||
      paginationDto.search !== undefined ||
      paginationDto.sortBy !== undefined
    );

    if (!hasCustomPagination) {
      // Use cache for non-paginated requests (default pagination values)
      const cacheKey = 'courses:published';
      console.log(`\n🎯 ========== CALLING getOrSet() ==========`);
      console.log(`🔑 Cache key: ${cacheKey}`);
      console.log(`📊 Pagination params:`, paginationDto);
      console.log(`🎯 Using cache because: ${!paginationDto ? 'no pagination' : 'only default values'}`);
      console.log(`🎯 ==========================================\n`);
      
      return this.redisService.getOrSet(
        cacheKey,
        async () => {
          return this.prisma.course.findMany({
            where: {
              status: CourseStatus.PUBLISHED,
            },
            include: {
              modules: {
                orderBy: { order: 'asc' },
                include: {
                  lessons: {
                    orderBy: { order: 'asc' },
                  },
                },
              },
              _count: {
                select: {
                  enrollments: true,
                },
              },
            },
            orderBy: { createdAt: 'desc' },
          });
        },
        900 // 15 minutes cache for published course lists
      );
    }

    const query = this.paginationService.buildPrismaQuery(paginationDto);
    const searchFilter = paginationDto.search 
      ? this.paginationService.buildSearchFilter(paginationDto.search, ['title', 'description', 'category'])
      : {};

    const whereClause = {
      status: CourseStatus.PUBLISHED,
      ...searchFilter,
    };

    const [courses, total] = await Promise.all([
      this.prisma.course.findMany({
        ...query,
        where: whereClause,
        include: {
          modules: {
            orderBy: { order: 'asc' },
            include: {
              lessons: {
                orderBy: { order: 'asc' },
              },
            },
          },
          _count: {
            select: {
              enrollments: true,
            },
          },
        },
      }),
      this.prisma.course.count({
        where: whereClause,
      }),
    ]);

    return this.paginationService.createPaginatedResult(courses, total, paginationDto);
  }

  async getCourseById(id: string): Promise<Course> {
    return this.redisService.getOrSet(
      `course:detail:${id}`,
      async () => {
        const course = await this.prisma.course.findUnique({
          where: { id },
          include: {
            modules: {
              orderBy: { order: 'asc' },
              include: {
                lessons: {
                  orderBy: { order: 'asc' },
                  // Include ALL fields - needed for quiz, PDF, and video lessons
                },
              },
            },
            _count: {
              select: {
                enrollments: true,
              },
            },
          },
        });

        if (!course) {
          throw new NotFoundException(`Course with ID ${id} not found`);
        }

        return course;
      },
      1800 // 30 minutes cache
    );
  }

  async updateCourse(id: string, updateCourseDto: UpdateCourseDto): Promise<Course> {
    const course = await this.prisma.course.findUnique({ where: { id } });
    
    if (!course) {
      throw new NotFoundException(`Course with ID ${id} not found`);
    }

    console.log(`\n🔄 ========== UPDATING COURSE ==========`);
    console.log(`📝 Course ID: ${id}`);

    // Extract modules and other nested data that need special handling
    const { modules, ...courseData } = updateCourseDto as any;

    console.log('📋 FAQs being updated:', courseData.faqs);

    // Determine if this is a simple update (only course metadata) or complex (modules/lessons changed)
    const isSimpleUpdate = !modules || modules.length === 0;

    // Update the course basic data first (excluding modules and nested relations)
    await this.prisma.course.update({
      where: { id },
      data: courseData,
    });

    // Handle modules separately if provided
    if (modules && Array.isArray(modules) && modules.length > 0) {
      // Delete existing modules for this course
      await this.prisma.courseModule.deleteMany({
        where: { courseId: id },
      });

      // Create new modules
      for (const moduleData of modules) {
        const { lessons, ...moduleInfo } = moduleData;
        
        const createdModule = await this.prisma.courseModule.create({
          data: {
            ...moduleInfo,
            courseId: id,
          },
        });

        // Create lessons for this module if provided
        if (lessons && Array.isArray(lessons)) {
          for (const lessonData of lessons) {
            // CRITICAL FIX: Check if lesson already exists (from video upload)
            // If lesson has an ID and exists in database, UPDATE it instead of creating duplicate
            if (lessonData.id && /^[0-9a-fA-F]{24}$/.test(lessonData.id)) {
              const existingLesson = await this.prisma.lesson.findUnique({
                where: { id: lessonData.id },
              });
              
              if (existingLesson) {
                // Update existing lesson
                await this.prisma.lesson.update({
                  where: { id: lessonData.id },
                  data: {
                    ...lessonData,
                    moduleId: createdModule.id,
                  },
                });
                continue; // Skip to next lesson
              }
            }
            
            // Create new lesson if it doesn't exist
            await this.prisma.lesson.create({
              data: {
                ...lessonData,
                moduleId: createdModule.id,
              },
            });
          }
        }
      }
    }

    // SMART CACHE UPDATE STRATEGY
    if (isSimpleUpdate) {
      console.log(`🎯 Simple update detected (only metadata changed)`);
      console.log(`🔄 Attempting partial cache update...`);
      
      // Try to update cache partially
      const success = await this.updateCourseInCache(id, courseData);
      
      if (success) {
        console.log(`✅ Partial cache update successful`);
      } else {
        console.log(`⚠️  Partial update failed, invalidating cache...`);
        await this.invalidateCourseCaches(id);
      }
    } else {
      console.log(`🎯 Complex update detected (modules/lessons changed)`);
      console.log(`🗑️  Invalidating all related caches...`);
      
      // Complex update - delete all related caches
      await this.invalidateCourseCaches(id);
    }
    
    console.log(`🔄 ========== UPDATE COMPLETE ==========\n`);

    // Return the updated course with all relations
    const updatedCourse = await this.prisma.course.findUnique({
      where: { id },
      include: {
        modules: {
          orderBy: { order: 'asc' },
          include: {
            lessons: {
              orderBy: { order: 'asc' },
            },
          },
        },
        _count: {
          select: {
            enrollments: true,
          },
        },
      },
    });

    return updatedCourse;
  }

  /**
   * Try to update course data in cache partially (only changed fields)
   * Returns true if successful, false if cache needs to be invalidated
   */
  private async updateCourseInCache(courseId: string, updatedFields: any): Promise<boolean> {
    try {
      // Get current cached data
      const cachedCourse = await this.redisService.get(`course:detail:${courseId}`);
      
      if (!cachedCourse) {
        console.log(`   ℹ️  No cache found for course:detail:${courseId}`);
        return false;
      }

      // Merge updated fields with cached data
      const updatedCourse = {
        ...cachedCourse,
        ...updatedFields,
        updatedAt: new Date().toISOString(),
      };

      // Save updated course back to cache with same TTL
      await this.redisService.set(`course:detail:${courseId}`, updatedCourse, 900);
      console.log(`   ✅ Updated cache: course:detail:${courseId}`);

      // Also update in course lists if they exist
      await this.updateCourseInLists(courseId, updatedFields);

      return true;
    } catch (error) {
      console.error(`   ❌ Partial cache update failed:`, error.message);
      return false;
    }
  }

  /**
   * Update course data in cached lists (courses:published, courses:all)
   */
  private async updateCourseInLists(courseId: string, updatedFields: any): Promise<void> {
    // Update in published courses list
    const publishedList = await this.redisService.get('courses:published');
    if (publishedList && Array.isArray(publishedList)) {
      const updatedList = publishedList.map(course => 
        course.id === courseId ? { ...course, ...updatedFields } : course
      );
      await this.redisService.set('courses:published', updatedList, 900);
      console.log(`   ✅ Updated course in courses:published list`);
    }

    // Update in all courses list
    const allList = await this.redisService.get('courses:all');
    if (allList && Array.isArray(allList)) {
      const updatedList = allList.map(course => 
        course.id === courseId ? { ...course, ...updatedFields } : course
      );
      await this.redisService.set('courses:all', updatedList, 900);
      console.log(`   ✅ Updated course in courses:all list`);
    }
  }

  /**
   * Invalidate all caches related to a course
   */
  private async invalidateCourseCaches(courseId: string): Promise<void> {
    // Delete specific course cache
    await this.redisService.del(`course:detail:${courseId}`);
    console.log(`   ✅ Deleted cache: course:detail:${courseId}`);
    
    // Delete course list caches (they need to be refreshed)
    await this.redisService.del('courses:published');
    console.log(`   ✅ Deleted cache: courses:published`);
    
    await this.redisService.del('courses:all');
    console.log(`   ✅ Deleted cache: courses:all`);
    
    // Delete all lesson caches for this course
    const deletedLessons = await this.redisService.deletePattern(`lesson:*:${courseId}:*`);
    console.log(`   ✅ Deleted ${deletedLessons} lesson caches`);
  }

  async deleteCourse(id: string): Promise<void> {
    const course = await this.prisma.course.findUnique({ where: { id } });
    
    if (!course) {
      throw new NotFoundException(`Course with ID ${id} not found`);
    }

    console.log(`\n🗑️  ========== DELETING COURSE ==========`);
    console.log(`📝 Course ID: ${id}`);
    
    // Delete from database
    await this.prisma.course.delete({ where: { id } });
    console.log(`✅ Course deleted from database`);

    // CACHE INVALIDATION ON DELETE
    // Delete specific course cache
    await this.redisService.del(`course:detail:${id}`);
    console.log(`✅ Deleted cache: course:detail:${id}`);
    
    // Delete course list caches
    await this.redisService.del('courses:published');
    console.log(`✅ Deleted cache: courses:published`);
    
    await this.redisService.del('courses:all');
    console.log(`✅ Deleted cache: courses:all`);
    
    // Delete all lesson caches for this course
    const deletedLessons = await this.redisService.deletePattern(`lesson:*:${id}:*`);
    console.log(`✅ Deleted ${deletedLessons} lesson caches`);
    
    console.log(`🗑️  ========== COURSE DELETION COMPLETE ==========\n`);
  }

  async addModuleToCourse(courseId: string, createModuleDto: CreateModuleDto): Promise<CourseModule> {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    
    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    return this.prisma.courseModule.create({
      data: {
        ...createModuleDto,
        courseId,
      },
    });
  }

  async updateModule(moduleId: string, updateModuleDto: UpdateModuleDto): Promise<CourseModule> {
    const module = await this.prisma.courseModule.findUnique({ where: { id: moduleId } });
    
    if (!module) {
      throw new NotFoundException(`Module with ID ${moduleId} not found`);
    }

    return this.prisma.courseModule.update({
      where: { id: moduleId },
      data: updateModuleDto,
    });
  }

  async deleteModule(moduleId: string): Promise<void> {
    const module = await this.prisma.courseModule.findUnique({ where: { id: moduleId } });
    
    if (!module) {
      throw new NotFoundException(`Module with ID ${moduleId} not found`);
    }

    await this.prisma.courseModule.delete({ where: { id: moduleId } });
  }

  async getLessonById(id: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id },
      include: {
        module: {
          include: {
            course: {
              include: {
                modules: {
                  include: {
                    lessons: {
                      select: {
                        id: true,
                        title: true,
                        order: true,
                        contentType: true,
                      },
                      orderBy: { order: 'asc' },
                    },
                  },
                  orderBy: { order: 'asc' },
                },
              },
            },
            lessons: {
              select: {
                id: true,
                title: true,
                order: true,
              },
              orderBy: { order: 'asc' },
            },
          },
        },
      },
    });

    if (!lesson) {
      throw new NotFoundException(`Lesson with ID ${id} not found`);
    }

    // Find previous and next lessons in the same module
    const allLessonsInModule = lesson.module.lessons;
    const currentIndex = allLessonsInModule.findIndex(l => l.id === id);
    
    const previousLesson = currentIndex > 0 ? allLessonsInModule[currentIndex - 1] : null;
    const nextLesson = currentIndex < allLessonsInModule.length - 1 ? allLessonsInModule[currentIndex + 1] : null;

    // If lesson has video URLs (R2 keys), generate signed URLs
    let videoUrls = lesson.videoUrls;
    let thumbnail = lesson.thumbnail;
    let hlsMasterPlaylist = lesson.hlsMasterPlaylist;
    let hlsQualities = lesson.hlsQualities;
    let pdfUrl = lesson.pdfUrl;

    if (videoUrls && typeof videoUrls === 'object') {
      const videoUrlsObj = videoUrls as Record<string, string>;
      const signedUrls = await this.r2UploadService.getSignedUrlsForQualities(videoUrlsObj);
      videoUrls = signedUrls;
    }

    // ALWAYS use PROXY URLs for HLS (extract keys from URLs if needed)
    if (hlsQualities && typeof hlsQualities === 'object') {
      const hlsQualitiesObj = hlsQualities as Record<string, string>;
      // Extract keys from URLs if they're full URLs
      const keys: Record<string, string> = {};
      for (const [quality, urlOrKey] of Object.entries(hlsQualitiesObj)) {
        if (urlOrKey.startsWith('http://') || urlOrKey.startsWith('https://')) {
          // Extract key from URL
          try {
            const url = new URL(urlOrKey);
            const key = url.pathname.substring(1); // Remove leading slash
            keys[quality] = key;
          } catch (e) {
            keys[quality] = urlOrKey;
          }
        } else {
          keys[quality] = urlOrKey;
        }
      }
      const proxyHlsUrls = this.r2UploadService.getProxyUrlsForQualities(keys);
      hlsQualities = proxyHlsUrls;
    }

    // ALWAYS use PROXY URL for HLS master playlist (extract key if needed)
    if (hlsMasterPlaylist) {
      let key = hlsMasterPlaylist;
      if (hlsMasterPlaylist.startsWith('http://') || hlsMasterPlaylist.startsWith('https://')) {
        // Extract key from URL
        try {
          const url = new URL(hlsMasterPlaylist);
          key = url.pathname.substring(1); // Remove leading slash
        } catch (e) {
          key = hlsMasterPlaylist;
        }
      }
      hlsMasterPlaylist = this.r2UploadService.getProxyUrl(key);
    }

    if (thumbnail) {
      thumbnail = await this.r2UploadService.getSignedUrl(thumbnail);
    }

    // Generate fresh signed URL for PDF if it exists
    if (pdfUrl) {
      // Check if it's already a full URL (expired signed URL) or just a key
      if (pdfUrl.startsWith('http://') || pdfUrl.startsWith('https://')) {
        // Extract key from expired URL
        try {
          const url = new URL(pdfUrl);
          const key = url.pathname.substring(1); // Remove leading slash
          pdfUrl = await this.r2UploadService.getSignedUrl(key);
        } catch (e) {
          // If URL parsing fails, try to use it as-is
          pdfUrl = await this.r2UploadService.getSignedUrl(pdfUrl);
        }
      } else {
        // It's a key, generate signed URL
        pdfUrl = await this.r2UploadService.getSignedUrl(pdfUrl);
      }
    }

    // Return lesson with navigation info
    return {
      ...lesson,
      videoUrls,
      thumbnail,
      hlsMasterPlaylist,
      hlsQualities,
      pdfUrl,
      navigation: {
        currentLesson: {
          id: lesson.id,
          title: lesson.title,
          order: lesson.order,
        },
        previousLesson,
        nextLesson,
        module: {
          id: lesson.module.id,
          title: lesson.module.title,
          order: lesson.module.order,
        },
        course: {
          id: lesson.module.course.id,
          title: lesson.module.course.title,
        },
      },
    };
  }

  /**
   * Save draft changes without affecting published version
   * Shopify-style: stores changes in draftData field
   */
  async saveDraft(id: string, draftChanges: any): Promise<Course> {
    const course = await this.prisma.course.findUnique({ where: { id } });
    
    if (!course) {
      throw new NotFoundException(`Course with ID ${id} not found`);
    }

    console.log(`\n📝 ========== SAVING DRAFT CHANGES ==========`);
    console.log(`Course ID: ${id}`);
    console.log(`Current Status: ${course.status}`);

    // Store changes in draftData without affecting published fields
    const updatedCourse = await this.prisma.course.update({
      where: { id },
      data: {
        draftData: draftChanges,
        hasDraftChanges: true,
        updatedAt: new Date(),
      },
      include: {
        modules: {
          orderBy: { order: 'asc' },
          include: {
            lessons: {
              orderBy: { order: 'asc' },
            },
          },
        },
      },
    });

    console.log(`✅ Draft saved successfully`);
    console.log(`📝 ========== DRAFT SAVE COMPLETE ==========\n`);

    // Invalidate caches
    await this.invalidateCourseCaches(id);

    return updatedCourse;
  }

  /**
   * Publish draft changes - merge draftData into main fields
   * This makes draft changes visible to users
   */
  async publishDraft(id: string): Promise<Course> {
    const course = await this.prisma.course.findUnique({ 
      where: { id },
      include: {
        modules: true,
      }
    });
    
    if (!course) {
      throw new NotFoundException(`Course with ID ${id} not found`);
    }

    if (!course.hasDraftChanges || !course.draftData) {
      throw new Error('No draft changes to publish');
    }

    console.log(`\n🚀 ========== PUBLISHING DRAFT ==========`);
    console.log(`Course ID: ${id}`);

    const draftData = course.draftData as any;

    // Extract modules and other nested data
    const { modules: draftModules, ...courseFields } = draftData;

    console.log('📋 Publishing FAQs:', courseFields.faqs);

    // Delete existing modules if draft has modules
    if (draftModules && Array.isArray(draftModules)) {
      await this.prisma.courseModule.deleteMany({
        where: { courseId: id },
      });
    }

    // Update course with draft data and clear draft fields
    const publishedCourse = await this.prisma.course.update({
      where: { id },
      data: {
        ...courseFields,
        status: CourseStatus.PUBLISHED,
        draftData: null,
        hasDraftChanges: false,
        lastPublishedAt: new Date(),
      },
    });

    // Create new modules from draft if present
    if (draftModules && Array.isArray(draftModules)) {
      for (const moduleData of draftModules) {
        const { lessons, ...moduleInfo } = moduleData;
        
        const createdModule = await this.prisma.courseModule.create({
          data: {
            ...moduleInfo,
            courseId: id,
          },
        });

        // Create lessons for this module
        if (lessons && Array.isArray(lessons)) {
          for (const lessonData of lessons) {
            // Check if lesson exists (from video upload)
            if (lessonData.id && /^[0-9a-fA-F]{24}$/.test(lessonData.id)) {
              const existingLesson = await this.prisma.lesson.findUnique({
                where: { id: lessonData.id },
              });
              
              if (existingLesson) {
                // Update existing lesson
                await this.prisma.lesson.update({
                  where: { id: lessonData.id },
                  data: {
                    ...lessonData,
                    moduleId: createdModule.id,
                  },
                });
                continue;
              }
            }
            
            // Create new lesson
            await this.prisma.lesson.create({
              data: {
                ...lessonData,
                moduleId: createdModule.id,
              },
            });
          }
        }
      }
    }

    console.log(`✅ Draft published successfully`);
    console.log(`🚀 ========== PUBLISH COMPLETE ==========\n`);

    // Invalidate all caches
    await this.invalidateCourseCaches(id);

    // Queue refresh job for published course
    await this.queueManagerService.addRefreshJob({
      type: 'refresh_course_data',
      courseId: id,
      refreshType: 'full',
    });

    // Return updated course with relations
    return this.prisma.course.findUnique({
      where: { id },
      include: {
        modules: {
          orderBy: { order: 'asc' },
          include: {
            lessons: {
              orderBy: { order: 'asc' },
            },
          },
        },
      },
    });
  }

  /**
   * Discard draft changes - keep published version
   * Users continue seeing published version
   */
  async discardDraft(id: string): Promise<Course> {
    const course = await this.prisma.course.findUnique({ where: { id } });
    
    if (!course) {
      throw new NotFoundException(`Course with ID ${id} not found`);
    }

    console.log(`\n🗑️  ========== DISCARDING DRAFT ==========`);
    console.log(`Course ID: ${id}`);

    const updatedCourse = await this.prisma.course.update({
      where: { id },
      data: {
        draftData: null,
        hasDraftChanges: false,
      },
      include: {
        modules: {
          orderBy: { order: 'asc' },
          include: {
            lessons: {
              orderBy: { order: 'asc' },
            },
          },
        },
      },
    });

    console.log(`✅ Draft discarded successfully`);
    console.log(`🗑️  ========== DISCARD COMPLETE ==========\n`);

    // Invalidate caches
    await this.invalidateCourseCaches(id);

    return updatedCourse;
  }

  /**
   * Get lesson navigation tree
   * Returns: Course → Module → Lesson with previous/next
   */
  async getLessonNavigation(lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        module: {
          include: {
            lessons: {
              select: {
                id: true,
                title: true,
                order: true,
              },
              orderBy: { order: 'asc' },
            },
            course: {
              include: {
                modules: {
                  include: {
                    lessons: {
                      select: {
                        id: true,
                        title: true,
                        order: true,
                      },
                      orderBy: { order: 'asc' },
                    },
                  },
                  orderBy: { order: 'asc' },
                },
              },
            },
          },
        },
      },
    });

    if (!lesson) {
      throw new NotFoundException(`Lesson with ID ${lessonId} not found`);
    }

    // Build complete navigation tree
    const course = lesson.module.course;
    const currentModule = lesson.module;
    const allLessonsInModule = currentModule.lessons;
    const currentLessonIndex = allLessonsInModule.findIndex(l => l.id === lessonId);

    return {
      course: {
        id: course.id,
        title: course.title,
        totalModules: course.modules.length,
      },
      currentModule: {
        id: currentModule.id,
        title: currentModule.title,
        order: currentModule.order,
        totalLessons: allLessonsInModule.length,
      },
      currentLesson: {
        id: lesson.id,
        title: lesson.title,
        order: lesson.order,
        position: currentLessonIndex + 1,
      },
      previousLesson: currentLessonIndex > 0 ? allLessonsInModule[currentLessonIndex - 1] : null,
      nextLesson: currentLessonIndex < allLessonsInModule.length - 1 ? allLessonsInModule[currentLessonIndex + 1] : null,
      allModules: course.modules.map(m => ({
        id: m.id,
        title: m.title,
        order: m.order,
        lessonsCount: m.lessons.length,
        lessons: m.lessons,
      })),
    };
  }
}
