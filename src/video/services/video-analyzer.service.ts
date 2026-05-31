import { Injectable, Logger } from '@nestjs/common';
import * as ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs';
import * as path from 'path';
import { VideoAnalysisResult } from '../dto/process-video.dto';

// Set FFprobe path
const ffprobePath = require('@ffprobe-installer/ffprobe').path;
ffmpeg.setFfprobePath(ffprobePath);

@Injectable()
export class VideoAnalyzerService {
  private readonly logger = new Logger(VideoAnalyzerService.name);
  private readonly tempDir = './temp-analysis';

  constructor() {
    // Ensure temp directory exists for buffer analysis
    if (!fs.existsSync(this.tempDir)) {
      this.logger.log(`📁 Creating temp-analysis directory: ${this.tempDir}`);
      fs.mkdirSync(this.tempDir, { recursive: true });
      this.logger.log(`✅ Temp directory created successfully`);
    } else {
      this.logger.log(`✅ Temp directory already exists: ${this.tempDir}`);
    }
  }

  /**
   * Analyze video from buffer (no permanent temp file)
   */
  async analyzeVideoFromBuffer(buffer: Buffer): Promise<VideoAnalysisResult> {
    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      this.logger.log(`📁 Creating temp directory: ${this.tempDir}`);
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
    
    // Create temporary file for analysis only
    const tempFile = path.join(this.tempDir, `analyze_${Date.now()}.tmp`);
    
    try {
      this.logger.log(`📝 Writing buffer to temp file: ${tempFile}`);
      // Write buffer to temp file
      fs.writeFileSync(tempFile, buffer);
      
      this.logger.log(`🔍 Analyzing video from temp file...`);
      // Analyze
      const result = await this.analyzeVideo(tempFile);
      
      this.logger.log(`🧹 Cleaning up temp file: ${tempFile}`);
      // Clean up immediately
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
      
      return result;
    } catch (error) {
      this.logger.error(`❌ Analysis failed:`, error);
      // Clean up on error
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
      throw error;
    }
  }

  /**
   * Analyze video and determine available qualities
   * Minimum 460p required
   */
  async analyzeVideo(filePath: string): Promise<VideoAnalysisResult> {
    return new Promise((resolve) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          this.logger.error('Failed to analyze video:', err);
          resolve({
            width: 0,
            height: 0,
            duration: 0,
            availableQualities: [],
            isValid: false,
            error: 'Failed to analyze video',
          });
          return;
        }

        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        
        if (!videoStream || !videoStream.width || !videoStream.height) {
          resolve({
            width: 0,
            height: 0,
            duration: 0,
            availableQualities: [],
            isValid: false,
            error: 'No video stream found',
          });
          return;
        }

        const width = videoStream.width;
        const height = videoStream.height;
        const duration = metadata.format.duration || 0;

        // Check minimum 460p requirement
        if (height < 460) {
          resolve({
            width,
            height,
            duration,
            availableQualities: [],
            isValid: false,
            error: 'Video quality too low (minimum 460p required)',
          });
          return;
        }

        // Determine available qualities based on resolution
        const availableQualities: string[] = [];
        
        if (height >= 460) availableQualities.push('460p');
        if (height >= 720) availableQualities.push('720p');
        if (height >= 1080) availableQualities.push('1080p');

        this.logger.log(`Video analyzed: ${width}x${height}, ${duration}s, qualities: ${availableQualities.join(', ')}`);

        resolve({
          width,
          height,
          duration,
          availableQualities,
          isValid: true,
        });
      });
    });
  }
}
