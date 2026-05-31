import { Controller, Post, Body, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ChunkUploadService } from '../../services/chunk-upload.service';
import { InitiateChunkUploadDto, UploadChunkDto } from '../../dto/upload-chunk.dto';

@Controller('video-upload-1080p')
export class VideoUpload1080pController {
  constructor(private chunkUploadService: ChunkUploadService) {}

  @Post('initiate')
  async initiateUpload(@Body() dto: InitiateChunkUploadDto) {
    if (dto.quality !== '1080p') {
      throw new BadRequestException('This port only handles 1080p uploads');
    }

    const result = await this.chunkUploadService.initiateUpload(
      dto.lessonId,
      dto.fileName,
      dto.fileSize,
      dto.quality,
      Math.ceil(dto.fileSize / (5 * 1024 * 1024)), // 5MB chunks
    );

    return {
      success: true,
      uploadId: result.uploadId,
    };
  }

  @Post('chunk')
  @UseInterceptors(FileInterceptor('chunk'))
  async uploadChunk(
    @UploadedFile() file: any,
    @Body() dto: UploadChunkDto,
  ) {
    if (!file) {
      throw new BadRequestException('No chunk provided');
    }

    if (dto.quality !== '1080p') {
      throw new BadRequestException('This port only handles 1080p uploads');
    }

    const result = await this.chunkUploadService.handleChunk(
      dto.uploadId,
      dto.chunkIndex,
      file.buffer,
    );

    return {
      success: true,
      isComplete: result.isComplete,
    };
  }
}
