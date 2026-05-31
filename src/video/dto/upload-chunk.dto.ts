import { IsString, IsNumber, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';

export class UploadChunkDto {
  @IsString()
  @IsNotEmpty()
  uploadId: string;

  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  chunkIndex: number;

  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  totalChunks: number;

  @IsString()
  @IsNotEmpty()
  quality: string; // '460p', '720p', or '1080p'
}

export class InitiateChunkUploadDto {
  @IsString()
  @IsNotEmpty()
  lessonId: string;

  @IsString()
  @IsNotEmpty()
  fileName: string;

  @Transform(({ value }) => typeof value === 'string' ? parseInt(value, 10) : value)
  @IsNumber()
  fileSize: number;

  @IsString()
  @IsNotEmpty()
  quality: string; // '460p', '720p', or '1080p'
}
