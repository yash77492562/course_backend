import { IsString, IsNumber, IsArray, IsEnum, IsOptional, Min, IsBoolean } from 'class-validator';
import { CourseLevel, CourseStatus } from '@prisma/client';

export class CreateCourseDto {
  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  shortDescription?: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  originalPrice?: number;

  @IsString()
  duration: string;

  @IsEnum(CourseLevel)
  level: CourseLevel;

  @IsString()
  category: string;

  @IsString()
  thumbnail: string;

  @IsString()
  instructor: string;

  @IsOptional()
  @IsString()
  instructorBio?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  spotsLeft?: number;

  @IsOptional()
  @IsString()
  nextCohort?: string;

  @IsArray()
  @IsString({ each: true })
  features: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tools?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  outcomes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  careerPaths?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  jobTitles?: string[];

  @IsOptional()
  @IsNumber()
  totalModules?: number;

  @IsOptional()
  @IsNumber()
  totalLessons?: number;

  @IsOptional()
  @IsString()
  totalHours?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  prerequisites?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requirements?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  careerSupport?: string[];

  @IsOptional()
  @IsBoolean()
  certification?: boolean;

  @IsOptional()
  @IsString()
  certificateName?: string;

  @IsOptional()
  @IsArray()
  faqs?: any[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  highlights?: string[];

  @IsOptional()
  @IsArray()
  modules?: any[];

  @IsOptional()
  @IsEnum(CourseStatus)
  status?: CourseStatus;
}

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  shortDescription?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  originalPrice?: number;

  @IsOptional()
  @IsString()
  duration?: string;

  @IsOptional()
  @IsEnum(CourseLevel)
  level?: CourseLevel;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  thumbnail?: string;

  @IsOptional()
  @IsString()
  instructor?: string;

  @IsOptional()
  @IsString()
  instructorBio?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  spotsLeft?: number;

  @IsOptional()
  @IsString()
  nextCohort?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tools?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  outcomes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  careerPaths?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  jobTitles?: string[];

  @IsOptional()
  @IsNumber()
  totalModules?: number;

  @IsOptional()
  @IsNumber()
  totalLessons?: number;

  @IsOptional()
  @IsString()
  totalHours?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  prerequisites?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requirements?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  careerSupport?: string[];

  @IsOptional()
  @IsBoolean()
  certification?: boolean;

  @IsOptional()
  @IsString()
  certificateName?: string;

  @IsOptional()
  @IsArray()
  faqs?: any[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  highlights?: string[];

  @IsOptional()
  @IsArray()
  modules?: any[];

  @IsOptional()
  @IsEnum(CourseStatus)
  status?: CourseStatus;
}

export class CreateModuleDto {
  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsString()
  duration: string;

  @IsNumber()
  order: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  objectives?: string[];
}

export class UpdateModuleDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  duration?: string;

  @IsOptional()
  @IsNumber()
  order?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  objectives?: string[];
}