import { Injectable, Logger } from '@nestjs/common';
import * as ffmpeg from 'fluent-ffmpeg';
import * as ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import * as ffprobeInstaller from '@ffprobe-installer/ffprobe';
import * as fs from 'fs';
import * as path from 'path';

// Set FFmpeg and FFprobe paths
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

export interface TranscodeOptions {
  inputPath: string;
  outputDir: string;
  quality: '460p' | '720p' | '1080p';
  onProgress?: (progress: number) => void;
}

export interface TranscodeResult {
  playlistPath: string;
  segmentPaths: string[];
  thumbnailPath: string;
  duration: number;
}

@Injectable()
export class VideoTranscoderService {
  private readonly logger = new Logger(VideoTranscoderService.name);

  /**
   * Transcode video to HLS format with specific quality
   */
  async transcodeToHLS(options: TranscodeOptions): Promise<TranscodeResult> {
    const { inputPath, outputDir, quality, onProgress } = options;

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const playlistPath = path.join(outputDir, 'playlist.m3u8');
    const segmentPattern = path.join(outputDir, 'segment_%03d.ts');
    const thumbnailPath = path.join(outputDir, 'thumbnail.jpg');

    // Get video duration for progress calculation
    const duration = await this.getVideoDuration(inputPath);

    this.logger.log(`🎬 Starting transcode: ${quality}`);
    this.logger.log(`   Input: ${inputPath}`);
    this.logger.log(`   Output: ${outputDir}`);
    this.logger.log(`   Duration: ${duration}s`);

    // Transcode to HLS
    await new Promise<void>((resolve, reject) => {
      const command = ffmpeg(inputPath);

      // Set quality-specific options
      const height = this.getHeightForQuality(quality);
      const bitrate = this.getBitrateForQuality(quality);

      command
        .outputOptions([
          // Video codec
          '-c:v libx264',
          '-preset fast',
          '-crf 23',
          
          // Scale video
          `-vf scale=-2:${height}`,
          
          // Bitrate
          `-b:v ${bitrate}`,
          `-maxrate ${bitrate}`,
          `-bufsize ${parseInt(bitrate) * 2}k`,
          
          // Audio codec
          '-c:a aac',
          '-b:a 128k',
          '-ac 2',
          
          // HLS options
          '-hls_time 10', // 10 second segments
          '-hls_list_size 0', // Keep all segments in playlist
          '-hls_segment_filename', segmentPattern,
          '-f hls',
        ])
        .output(playlistPath)
        .on('start', (commandLine) => {
          this.logger.log(`FFmpeg command: ${commandLine}`);
        })
        .on('progress', (progress) => {
          if (progress.timemark && duration > 0) {
            const currentTime = this.parseTimemark(progress.timemark);
            const percent = Math.min(Math.round((currentTime / duration) * 100), 99);
            
            if (onProgress) {
              onProgress(percent);
            }
            
            this.logger.log(`Progress: ${percent}% (${progress.timemark})`);
          }
        })
        .on('end', () => {
          this.logger.log(`✅ Transcode complete: ${quality}`);
          if (onProgress) {
            onProgress(100);
          }
          resolve();
        })
        .on('error', (err, stdout, stderr) => {
          this.logger.error(`❌ Transcode failed: ${err.message}`);
          this.logger.error(`FFmpeg stderr: ${stderr}`);
          reject(err);
        })
        .run();
    });

    // Generate thumbnail
    await this.generateThumbnail(inputPath, thumbnailPath);

    // Get list of segment files
    const segmentPaths = fs.readdirSync(outputDir)
      .filter(file => file.endsWith('.ts'))
      .map(file => path.join(outputDir, file));

    this.logger.log(`✅ Generated ${segmentPaths.length} segments`);

    return {
      playlistPath,
      segmentPaths,
      thumbnailPath,
      duration,
    };
  }

  /**
   * Generate thumbnail from video
   */
  private async generateThumbnail(inputPath: string, outputPath: string): Promise<void> {
    this.logger.log('📸 Generating thumbnail...');

    return new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .screenshots({
          timestamps: ['10%'], // Take screenshot at 10% of video
          filename: path.basename(outputPath),
          folder: path.dirname(outputPath),
          size: '1280x720',
        })
        .on('end', () => {
          this.logger.log('✅ Thumbnail generated');
          resolve();
        })
        .on('error', (err) => {
          this.logger.error(`❌ Thumbnail generation failed: ${err.message}`);
          reject(err);
        });
    });
  }

  /**
   * Get video duration in seconds
   */
  private async getVideoDuration(inputPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err, metadata) => {
        if (err) {
          reject(err);
        } else {
          resolve(metadata.format.duration || 0);
        }
      });
    });
  }

  /**
   * Parse FFmpeg timemark (HH:MM:SS.MS) to seconds
   */
  private parseTimemark(timemark: string): number {
    const parts = timemark.split(':');
    if (parts.length !== 3) return 0;

    const hours = parseInt(parts[0]);
    const minutes = parseInt(parts[1]);
    const seconds = parseFloat(parts[2]);

    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Get target height for quality
   */
  private getHeightForQuality(quality: '460p' | '720p' | '1080p'): number {
    switch (quality) {
      case '460p': return 460;
      case '720p': return 720;
      case '1080p': return 1080;
    }
  }

  /**
   * Get target bitrate for quality
   */
  private getBitrateForQuality(quality: '460p' | '720p' | '1080p'): string {
    switch (quality) {
      case '460p': return '800k';
      case '720p': return '2500k';
      case '1080p': return '5000k';
    }
  }

  /**
   * Create master playlist for adaptive streaming
   */
  async createMasterPlaylist(
    outputPath: string,
    qualities: Array<{ quality: string; playlistUrl: string; bandwidth: number }>
  ): Promise<void> {
    this.logger.log('📝 Creating master playlist...');

    let content = '#EXTM3U\n#EXT-X-VERSION:3\n\n';

    for (const { quality, playlistUrl, bandwidth } of qualities) {
      const resolution = this.getResolutionForQuality(quality);
      content += `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${resolution}\n`;
      content += `${playlistUrl}\n\n`;
    }

    fs.writeFileSync(outputPath, content);
    this.logger.log('✅ Master playlist created');
  }

  /**
   * Get resolution string for quality
   */
  private getResolutionForQuality(quality: string): string {
    switch (quality) {
      case '460p': return '816x460';
      case '720p': return '1280x720';
      case '1080p': return '1920x1080';
      default: return '1280x720';
    }
  }
}
