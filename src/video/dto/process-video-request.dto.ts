import { IsString, IsArray, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';

export class ProcessVideoRequestDto {
  @IsString()
  @IsNotEmpty()
  lessonId: string; // Can be fake ID from frontend - backend will create real one

  @IsString()
  @IsNotEmpty()
  lessonName: string;

  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty()
  qualities: string[]; // e.g., ['460p', '720p', '1080p']

  @IsString()
  @IsOptional()
  moduleId?: string; // Required for creating new lessons

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsOptional()
  order?: number;
}
