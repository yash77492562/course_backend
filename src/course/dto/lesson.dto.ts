import { IsString, IsNotEmpty, IsOptional, IsNumber, IsObject } from 'class-validator';

export class CreateLessonDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsNotEmpty()
  duration: string;

  @IsNumber()
  order: number;

  @IsString()
  @IsNotEmpty()
  moduleId: string;

  @IsOptional()
  @IsObject()
  videoUrls?: Record<string, string>; // { "460p": "uuid", "720p": "uuid", "1080p": "uuid" }

  @IsOptional()
  @IsString()
  thumbnail?: string;

  @IsOptional()
  @IsNumber()
  originalWidth?: number;

  @IsOptional()
  @IsNumber()
  originalHeight?: number;

  @IsOptional()
  @IsNumber()
  videoDuration?: number;
}

export class UpdateLessonDto {
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
  @IsObject()
  videoUrls?: Record<string, string>;

  @IsOptional()
  @IsString()
  thumbnail?: string;

  @IsOptional()
  @IsNumber()
  originalWidth?: number;

  @IsOptional()
  @IsNumber()
  originalHeight?: number;

  @IsOptional()
  @IsNumber()
  videoDuration?: number;
}

export class LessonNavigationDto {
  currentLesson: {
    id: string;
    title: string;
    order: number;
  };
  previousLesson?: {
    id: string;
    title: string;
    order: number;
  } | null;
  nextLesson?: {
    id: string;
    title: string;
    order: number;
  } | null;
  module: {
    id: string;
    title: string;
    order: number;
  };
  course: {
    id: string;
    title: string;
  };
}
