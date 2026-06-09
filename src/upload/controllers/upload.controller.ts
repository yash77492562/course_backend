import {
  Controller,
  Post,
  Delete,
  Body,
  UseInterceptors,
  UploadedFile,
  HttpStatus,
  HttpException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from '../services/upload.service';
import { InitiateUploadDto, UploadChunkDto, YouTubeUploadDto } from '../dto/upload.dto';
import { DeleteFileDto } from '../dto/delete-file.dto';
import { R2UploadService } from '../services/r2-upload.service';

@Controller('upload')
export class UploadController {
  private readonly logger = new Logger(UploadController.name);

  constructor(
    private readonly uploadService: UploadService,
    private readonly r2UploadService: R2UploadService,
  ) {}

  @Post('initiate')
  async initiateUpload(@Body() dto: InitiateUploadDto) {
    try {
      const result = await this.uploadService.initiateUpload(dto);
      return {
        success: true,
        ...result,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to initiate upload',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('chunk')
  @UseInterceptors(FileInterceptor('chunk'))
  async uploadChunk(
    @UploadedFile() chunk: any,
    @Body() dto: UploadChunkDto,
  ) {
    try {
      if (!chunk) {
        throw new HttpException('No chunk provided', HttpStatus.BAD_REQUEST);
      }

      const result = await this.uploadService.uploadChunk(chunk, dto);
      return {
        success: true,
        ...result,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to upload chunk',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('youtube')
  async addYouTubeVideo(@Body() dto: YouTubeUploadDto) {
    try {
      await this.uploadService.addYouTubeVideo(dto);
      return {
        success: true,
        message: 'YouTube video added successfully',
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to add YouTube video',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('thumbnail')
  @UseInterceptors(FileInterceptor('thumbnail'))
  async uploadThumbnail(
    @UploadedFile() file: any,
    @Body('lessonId') lessonId: string
  ) {
    try {
      console.log('📸 Backend: Thumbnail upload request received');
      console.log('   Lesson ID:', lessonId);
      console.log('   File:', file ? `${file.originalname} (${file.size} bytes)` : 'NO FILE');
      
      const thumbnailUrl = await this.uploadService.uploadThumbnail(file, lessonId);
      
      console.log('✅ Backend: Thumbnail uploaded successfully:', thumbnailUrl);
      
      return {
        success: true,
        thumbnailUrl,
      };
    } catch (error) {
      console.error('❌ Backend: Thumbnail upload failed:', error);
      throw new BadRequestException(error.message);
    }
  }

  @Post('lesson-qualities')
  async updateLessonQualities(@Body() dto: any) {
    try {
      console.log('💾 Backend: Update lesson qualities request received');
      console.log('   Lesson ID:', dto.lessonId);
      console.log('   Video URLs:', dto.videoUrls);
      console.log('   Thumbnail:', dto.thumbnailUrl);
      console.log('   Metadata:', {
        width: dto.originalWidth,
        height: dto.originalHeight,
        duration: dto.videoDuration
      });
      
      await this.uploadService.updateLessonQualities(dto);
      
      console.log('✅ Backend: Lesson updated successfully');
      
      return { success: true };
    } catch (error) {
      console.error('❌ Backend: Update lesson qualities failed:', error);
      throw new BadRequestException(error.message);
    }
  }

  @Post('direct-video')
  @UseInterceptors(FileInterceptor('file'))
  async uploadDirectVideo(
    @UploadedFile() file: any,
    @Body('quality') quality: string,
    @Body('lessonName') lessonName: string
  ) {
    try {
      console.log('🎞️ Backend: Direct video upload');
      console.log('   Quality:', quality);
      console.log('   Lesson name:', lessonName);
      console.log('   File size:', file?.size);
      
      const videoUrl = await this.uploadService.uploadDirectVideo(file, quality, lessonName);
      
      console.log('✅ Backend: Video uploaded to R2:', videoUrl);
      
      return {
        success: true,
        url: videoUrl,
      };
    } catch (error) {
      console.error('❌ Backend: Direct video upload failed:', error);
      throw new BadRequestException(error.message);
    }
  }

  @Post('direct-thumbnail')
  @UseInterceptors(FileInterceptor('file'))
  async uploadDirectThumbnail(@UploadedFile() file: any) {
    try {
      console.log('📸 Backend: Direct thumbnail upload');
      console.log('   File object keys:', Object.keys(file || {}));
      console.log('   File size:', file?.size);
      console.log('   File buffer:', file?.buffer ? 'EXISTS' : 'MISSING');
      console.log('   Full file object:', JSON.stringify(file, null, 2));
      
      const thumbnailUrl = await this.uploadService.uploadDirectThumbnail(file);
      
      console.log('✅ Backend: Thumbnail uploaded to R2:', thumbnailUrl);
      
      return {
        success: true,
        url: thumbnailUrl,
      };
    } catch (error) {
      console.error('❌ Backend: Direct thumbnail upload failed:', error);
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Delete file from R2 storage
   * Used when removing videos, PDFs, or thumbnails from courses
   */
  @Delete('delete-file')
  async deleteFile(@Body() dto: DeleteFileDto) {
    try {
      this.logger.log(`🗑️ Delete file request: ${dto.key}`);
      
      // Try to delete from R2
      await this.r2UploadService.deleteFile(dto.key);
      
      this.logger.log(`✅ File deleted successfully: ${dto.key}`);
      
      return {
        success: true,
        message: 'File deleted successfully',
      };
    } catch (error) {
      this.logger.error(`❌ Failed to delete file: ${dto.key}`, error);
      
      // If file doesn't exist in R2, that's okay - return success
      if (error.message?.includes('NoSuchKey') || error.message?.includes('not found')) {
        this.logger.warn(`⚠️ File not found in R2 (already deleted?): ${dto.key}`);
        return {
          success: true,
          message: 'File not found (may have been already deleted)',
        };
      }
      
      // For other errors, throw exception
      throw new BadRequestException(
        `Failed to delete file: ${error.message || 'Unknown error'}`
      );
    }
  }
}