import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/service/prisma.service';
import { R2UploadService } from './r2-upload.service';
import { InitiateUploadDto, UploadChunkDto, YouTubeUploadDto } from '../dto/upload.dto';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

interface UploadSession {
  uploadId: string;
  lessonId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  chunks: Buffer[];
  totalChunks: number;
  receivedChunks: number;
  createdAt: Date;
}

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private uploadSessions = new Map<string, UploadSession>();
  private readonly chunkSize = 5 * 1024 * 1024; // 5MB
  private readonly tempDir = './temp-uploads';

  constructor(
    private prisma: PrismaService,
    private r2UploadService: R2UploadService,
  ) {
    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    // Clean up old sessions every hour
    setInterval(() => this.cleanupOldSessions(), 60 * 60 * 1000);
  }

  async initiateUpload(dto: InitiateUploadDto) {
    // Verify lesson exists
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: dto.lessonId },
    });

    if (!lesson) {
      throw new BadRequestException('Lesson not found');
    }

    // Validate file type
    if (!dto.fileType.startsWith('video/')) {
      throw new BadRequestException('Only video files are allowed');
    }

    const uploadId = uuidv4();
    const totalChunks = Math.ceil(dto.fileSize / this.chunkSize);

    // Create upload session
    const session: UploadSession = {
      uploadId,
      lessonId: dto.lessonId,
      fileName: dto.fileName,
      fileSize: dto.fileSize,
      fileType: dto.fileType,
      chunks: new Array(totalChunks),
      totalChunks,
      receivedChunks: 0,
      createdAt: new Date(),
    };

    this.uploadSessions.set(uploadId, session);

    return {
      uploadId,
      chunkSize: this.chunkSize,
    };
  }

  async uploadChunk(chunk: any, dto: UploadChunkDto) {
    const session = this.uploadSessions.get(dto.uploadId);
    if (!session) {
      throw new BadRequestException('Upload session not found');
    }

    // Validate chunk index
    if (dto.chunkIndex < 0 || dto.chunkIndex >= session.totalChunks) {
      throw new BadRequestException('Invalid chunk index');
    }

    // Store chunk
    session.chunks[dto.chunkIndex] = chunk.buffer;
    session.receivedChunks++;

    // Check if all chunks received
    if (session.receivedChunks === session.totalChunks) {
      const videoUrl = await this.assembleAndStoreVideo(session);
      
      // Clean up session
      this.uploadSessions.delete(dto.uploadId);
      
      return {
        chunkIndex: dto.chunkIndex,
        uploadId: dto.uploadId,
        isComplete: true,
        videoUrl,
      };
    }

    return {
      chunkIndex: dto.chunkIndex,
      uploadId: dto.uploadId,
      isComplete: false,
    };
  }

  private async assembleAndStoreVideo(session: UploadSession): Promise<string> {
    try {
      // Assemble chunks into complete file buffer
      const chunks: Buffer[] = [];
      let totalSize = 0;

      for (let i = 0; i < session.totalChunks; i++) {
        if (!session.chunks[i]) {
          throw new Error(`Missing chunk ${i}`);
        }
        chunks.push(session.chunks[i]);
        totalSize += session.chunks[i].length;
      }

      // Combine all chunks into a single buffer
      const completeBuffer = Buffer.concat(chunks, totalSize);
      this.logger.log(`Assembled video buffer: ${totalSize} bytes`);

      // Upload to R2 - just store the video as-is
      const videoUrl = await this.r2UploadService.uploadVideo(
        completeBuffer,
        session.fileName,
        session.fileType
      );

      this.logger.log('Video successfully uploaded to R2:', videoUrl);
      return videoUrl;
    } catch (error) {
      this.logger.error('Failed to assemble and upload video:', error);
      throw new BadRequestException('Failed to process video');
    }
  }

  async addYouTubeVideo(dto: YouTubeUploadDto) {
    // Verify lesson exists
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: dto.lessonId },
    });

    if (!lesson) {
      throw new BadRequestException('Lesson not found');
    }

    // Validate YouTube URL
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
    if (!youtubeRegex.test(dto.youtubeUrl)) {
      throw new BadRequestException('Invalid YouTube URL');
    }

    // Convert to embed URL
    const embedUrl = this.convertToEmbedUrl(dto.youtubeUrl);

    // Update lesson with YouTube URL
    await this.prisma.lesson.update({
      where: { id: dto.lessonId },
      data: {
        videoUrl: embedUrl,
        videoType: 'YOUTUBE',
      },
    });
  }

  private convertToEmbedUrl(youtubeUrl: string): string {
    let videoId = '';
    
    if (youtubeUrl.includes('youtube.com/watch?v=')) {
      videoId = youtubeUrl.split('v=')[1].split('&')[0];
    } else if (youtubeUrl.includes('youtu.be/')) {
      videoId = youtubeUrl.split('youtu.be/')[1].split('?')[0];
    } else if (youtubeUrl.includes('youtube.com/embed/') || youtubeUrl.includes('youtube-nocookie.com/embed/')) {
      // Extract video ID from embed URL
      videoId = youtubeUrl.split('/embed/')[1].split('?')[0];
    }

    // Use nocookie domain to minimize tracking and branding
    return `https://www.youtube-nocookie.com/embed/${videoId}`;
  }

  private cleanupOldSessions() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    for (const [uploadId, session] of this.uploadSessions.entries()) {
      if (session.createdAt < oneHourAgo) {
        this.uploadSessions.delete(uploadId);
        console.log(`Cleaned up old upload session: ${uploadId}`);
      }
    }
  }

  async uploadThumbnail(file: any, lessonId: string): Promise<string> {
    try {
      console.log('📸 UploadService: uploadThumbnail called');
      console.log('   File buffer size:', file?.buffer?.length || 'NO BUFFER');
      console.log('   Lesson ID:', lessonId);
      
      // Upload thumbnail to R2
      const thumbnailUrl = await this.r2UploadService.uploadVideo(
        file.buffer,
        `thumbnail_${lessonId}.jpg`,
        'image/jpeg'
      );

      console.log('✅ UploadService: Thumbnail uploaded to R2:', thumbnailUrl);
      return thumbnailUrl;
    } catch (error) {
      console.error('❌ UploadService: Thumbnail upload failed:', error);
      throw new BadRequestException('Failed to upload thumbnail');
    }
  }

  async updateLessonQualities(data: {
    lessonId: string;
    videoUrls: Record<string, string>;
    thumbnailUrl: string;
    originalWidth: number;
    originalHeight: number;
    videoDuration: number;
    availableQualities: string[]; // Track which qualities were created
  }): Promise<void> {
    try {
      console.log('💾 UploadService: updateLessonQualities called');
      console.log('   Lesson ID:', data.lessonId);
      console.log('   Video URLs:', data.videoUrls);
      console.log('   Available Qualities:', data.availableQualities);
      console.log('   Thumbnail:', data.thumbnailUrl);
      
      // Update lesson with multiple video qualities and metadata
      const updatedLesson = await this.prisma.lesson.update({
        where: { id: data.lessonId },
        data: {
          videoUrls: data.videoUrls,
          thumbnail: data.thumbnailUrl,
          originalWidth: data.originalWidth,
          originalHeight: data.originalHeight,
          videoDuration: data.videoDuration,
          videoType: 'UPLOAD',
        },
      });

      console.log('✅ UploadService: Lesson updated in database:', updatedLesson.id);
      console.log('   Updated fields:', {
        videoUrls: updatedLesson.videoUrls,
        thumbnail: updatedLesson.thumbnail,
        videoType: updatedLesson.videoType,
        availableQualities: data.availableQualities,
      });
    } catch (error) {
      console.error('❌ UploadService: Failed to update lesson qualities:', error);
      throw new BadRequestException('Failed to update lesson with video qualities');
    }
  }

  async uploadDirectVideo(file: any, quality: string, lessonName: string): Promise<string> {
    try {
      console.log('🎞️ UploadService: Direct video upload');
      console.log('   Quality:', quality);
      console.log('   Lesson name:', lessonName);
      console.log('   File buffer size:', file?.buffer?.length || 'NO BUFFER');
      
      // Get buffer from file object
      const buffer = file.buffer || Buffer.from(await file.arrayBuffer());
      
      // Generate UUID for unique filename
      const videoId = uuidv4();
      const sanitizedLessonName = lessonName.replace(/[^a-zA-Z0-9-_]/g, '_');
      const fileName = `${sanitizedLessonName}_${quality}_${videoId}.webm`;
      
      const videoUrl = await this.r2UploadService.uploadVideo(
        buffer,
        fileName,
        'video/webm'
      );
      
      console.log('✅ UploadService: Video uploaded:', videoUrl);
      return videoUrl;
    } catch (error) {
      console.error('❌ UploadService: Direct video upload failed:', error);
      throw new BadRequestException('Failed to upload video');
    }
  }

  async uploadDirectThumbnail(file: any): Promise<string> {
    try {
      console.log('📸 UploadService: Direct thumbnail upload');
      console.log('   File object:', file);
      console.log('   File buffer size:', file?.buffer?.length || 'NO BUFFER');
      
      // Get buffer from file object - Multer stores it in file.buffer
      const buffer = file.buffer;
      
      if (!buffer) {
        console.error('❌ No buffer found in file object');
        throw new BadRequestException('No file buffer provided');
      }
      
      const thumbnailUrl = await this.r2UploadService.uploadVideo(
        buffer,
        `thumbnail_${Date.now()}.jpg`,
        'image/jpeg'
      );
      
      console.log('✅ UploadService: Thumbnail uploaded:', thumbnailUrl);
      return thumbnailUrl;
    } catch (error) {
      console.error('❌ UploadService: Direct thumbnail upload failed:', error);
      throw new BadRequestException('Failed to upload thumbnail');
    }
  }
}