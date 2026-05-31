import { IsString, IsNumber, IsOptional, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class InitiateUploadDto {
  @IsString()
  fileName: string;

  @IsNumber()
  @Transform(({ value }) => parseInt(value))
  fileSize: number;

  @IsString()
  fileType: string;

  @IsString()
  lessonId: string;
}

export class UploadChunkDto {
  @IsNumber()
  @Transform(({ value }) => parseInt(value))
  @Min(0)
  chunkIndex: number;

  @IsNumber()
  @Transform(({ value }) => parseInt(value))
  @Min(1)
  totalChunks: number;

  @IsString()
  uploadId: string;

  @IsString()
  lessonId: string;
}

export class YouTubeUploadDto {
  @IsString()
  lessonId: string;

  @IsString()
  youtubeUrl: string;
}