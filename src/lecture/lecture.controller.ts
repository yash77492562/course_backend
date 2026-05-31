import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Body,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { LectureService } from './lecture.service';

@Controller('lecture')
export class LectureController {
  private readonly logger = new Logger(LectureController.name);

  constructor(private lectureService: LectureService) {}

  /**
   * Upload PDF lecture to R2
   */
  @Post('upload-pdf')
  @UseInterceptors(FileInterceptor('file'))
  async uploadPDF(
    @UploadedFile() file: any,
    @Body('title') title: string,
    @Body('password') password?: string,
  ) {
    this.logger.log('=== PDF UPLOAD REQUEST ===');
    
    if (!file) {
      this.logger.error('❌ No file provided');
      throw new BadRequestException('No file provided');
    }

    if (!title) {
      this.logger.error('❌ No title provided');
      throw new BadRequestException('Title is required');
    }

    this.logger.log(`📄 PDF received: ${file.originalname}`);
    this.logger.log(`📊 File size: ${(file.buffer.length / 1024 / 1024).toFixed(2)} MB`);
    this.logger.log(`🔒 Password protected: ${password ? 'Yes' : 'No'}`);

    try {
      const result = await this.lectureService.uploadPDF(
        file.buffer,
        file.originalname,
        title,
        password,
      );

      this.logger.log('✅ PDF uploaded successfully');
      this.logger.log(`   URL: ${result.pdfUrl}`);

      return {
        success: true,
        ...result,
      };
    } catch (error) {
      this.logger.error('❌ PDF upload failed:', error);
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Failed to upload PDF'
      );
    }
  }
}
