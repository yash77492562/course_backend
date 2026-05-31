import { IsString, IsNotEmpty, IsArray } from 'class-validator';

export class ProcessVideoDto {
  @IsString()
  @IsNotEmpty()
  lessonId: string;

  @IsString()
  @IsNotEmpty()
  filePath: string;

  @IsArray()
  qualities: string[]; // ['460p', '720p', '1080p']
}

export class VideoAnalysisResult {
  width: number;
  height: number;
  duration: number;
  availableQualities: string[];
  isValid: boolean;
  error?: string;
}
