import { Injectable, Logger } from '@nestjs/common';
import * as ffmpeg from 'fluent-ffmpeg';
import * as path from 'path';
import * as fs from 'fs';
import { R2UploadService } from '../../upload/services/r2-upload.service';
import { PrismaService } from '../../database/prisma/service/prisma.service';
import { ProcessingStatusDto } from '../dto/processing-status.dto';

// Set FFmpeg and FFprobe paths
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffprobePath = require('@ffprobe-installer/ffprobe').path;
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

interface ProcessingProgress {
  quality: string;
  progress: number;
  status: 'processing' | 'uploading' | 'complete' | 'error';
}

type ProgressCallback = (status: ProcessingStatusDto) => void;

@Injectable()
export class VideoProcessorService {
  private readonly logger = new Logger(VideoProcessorService.name);
  private readonly outputDir = './temp-processed';
  private progressCallbacks = new Map<string, ProgressCallback>();

  constructor(
    private r2UploadService: R2UploadService,
    private prisma: PrismaService,
  ) {
    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Upload files in batches to prevent socket exhaustion
   * Processes uploads in chunks with controlled concurrency
   */
  private async batchUpload<T>(
    items: T[],
    uploadFn: (item: T) => Promise<any>,
    batchSize: number = 50
  ): Promise<any[]> {
    const results: any[] = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(uploadFn));
      results.push(...batchResults);
      
      // Small delay between batches to prevent overwhelming the system
      if (i + batchSize < items.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return results;
  }

  /**
   * Process video from buffer (no temp files needed)
   * Write buffer to temp file only for FFmpeg processing, then delete immediately
   */
  async processVideoFromBuffer(
    videoBuffer: Buffer,
    qualities: string[],
    lessonId: string,
    lessonName: string,
    originalWidth: number,
    originalHeight: number,
    duration: number,
  ): Promise<{ success: boolean; message: string; videoUrls?: Record<string, string>; thumbnailUrl?: string; masterPlaylistUrl?: string }> {
    const tempInputPath = path.join(this.outputDir, `input_${Date.now()}.tmp`);
    
    try {
      // Write buffer to temp file for FFmpeg
      this.logger.log('📝 Writing video buffer to temp file for processing...');
      fs.writeFileSync(tempInputPath, videoBuffer);
      
      // Process using existing method
      const result = await this.processVideo(
        tempInputPath,
        qualities,
        lessonId,
        lessonName,
        originalWidth,
        originalHeight,
        duration
      );
      
      // Clean up temp input file
      if (fs.existsSync(tempInputPath)) {
        fs.unlinkSync(tempInputPath);
        this.logger.log('🧹 Temp input file cleaned up');
      }
      
      return result;
    } catch (error) {
      // Clean up on error
      if (fs.existsSync(tempInputPath)) {
        fs.unlinkSync(tempInputPath);
      }
      throw error;
    }
  }

  /**
   * Register progress callback for a lesson
   */
  registerProgressCallback(lessonId: string, callback: ProgressCallback): void {
    this.progressCallbacks.set(lessonId, callback);
  }

  /**
   * Unregister progress callback
   */
  unregisterProgressCallback(lessonId: string): void {
    this.progressCallbacks.delete(lessonId);
  }

  /**
   * Send progress update
   */
  private sendProgress(lessonId: string, status: ProcessingStatusDto): void {
    const callback = this.progressCallbacks.get(lessonId);
    if (callback) {
      callback(status);
    }
  }

  /**
   * Process video into multiple qualities in PARALLEL
   * Keep original width/height (no resizing)
   * Upload to R2 immediately after each quality is processed
   * Store in database immediately after all processing completes
   */
  async processVideo(
    inputPath: string,
    qualities: string[],
    lessonId: string,
    lessonName: string,
    originalWidth: number,
    originalHeight: number,
    duration: number,
  ): Promise<{ success: boolean; message: string; videoUrls?: Record<string, string>; thumbnailUrl?: string; masterPlaylistUrl?: string }> {
    this.logger.log(`Processing video for ${qualities.length} qualities in PARALLEL`);
    
    // Initialize progress tracking
    const qualityProgress: {
      quality: string;
      status: 'pending' | 'processing' | 'uploading' | 'complete' | 'error';
      progress: number;
      error?: string;
    }[] = qualities.map(quality => ({
      quality,
      status: 'pending' as const,
      progress: 0,
    }));

    // Send initial status
    this.sendProgress(lessonId, {
      lessonId,
      status: 'analyzing',
      progress: 0,
      qualityProgress,
      message: 'Analyzing video...',
    });

    // Generate thumbnail first
    let thumbnailUrl: string;
    try {
      this.sendProgress(lessonId, {
        lessonId,
        status: 'processing',
        progress: 5,
        qualityProgress,
        message: 'Generating thumbnail...',
      });

      thumbnailUrl = await this.generateThumbnail(inputPath, lessonName);
      
      this.logger.log(`Thumbnail generated: ${thumbnailUrl}`);
    } catch (error) {
      this.logger.error('Thumbnail generation failed:', error);
      this.sendProgress(lessonId, {
        lessonId,
        status: 'error',
        progress: 0,
        qualityProgress,
        error: 'Failed to generate thumbnail',
      });
      throw error;
    }

    // Update progress - starting quality processing
    qualityProgress.forEach(qp => qp.status = 'processing');
    this.sendProgress(lessonId, {
      lessonId,
      status: 'processing',
      progress: 10,
      qualityProgress: [...qualityProgress],
      message: `Processing ${qualities.length} qualities in parallel...`,
    });
    
    // Process all qualities in parallel with progress tracking
    const processingPromises = qualities.map((quality, index) => 
      this.processQuality(
        inputPath,
        quality,
        lessonName,
        (progress) => {
          // Update this quality's progress
          qualityProgress[index] = {
            quality,
            status: progress.status,
            progress: progress.progress,
            error: progress.error,
          };

          // Calculate overall progress (10% for thumbnail, 90% for processing)
          const totalProgress = qualityProgress.reduce((sum, qp) => sum + qp.progress, 0);
          const avgProgress = totalProgress / qualities.length;
          const overallProgress = 10 + (avgProgress * 0.9);

          // Send progress update (debounced by FFmpeg's own progress events)
          this.sendProgress(lessonId, {
            lessonId,
            status: 'processing',
            progress: Math.round(overallProgress),
            currentQuality: quality,
            qualityProgress: [...qualityProgress],
            message: `Processing ${quality}...`,
          });
        }
      )
    );

    const results = await Promise.allSettled(processingPromises);
    
    // Collect successful results
    const videoUrls: Record<string, string> = {};
    const successfulQualities: string[] = [];
    const failedQualities: string[] = [];
    
    results.forEach((result, index) => {
      const quality = qualities[index];
      
      if (result.status === 'fulfilled') {
        videoUrls[quality] = result.value;
        successfulQualities.push(quality);
        qualityProgress[index].status = 'complete';
        qualityProgress[index].progress = 100;
        this.logger.log(`✅ ${quality} processed and uploaded successfully`);
      } else {
        failedQualities.push(quality);
        qualityProgress[index].status = 'error';
        qualityProgress[index].error = result.reason?.message || 'Processing failed';
        this.logger.error(`❌ ${quality} processing failed:`, result.reason);
      }
    });

    // Check if at least one quality succeeded
    if (successfulQualities.length === 0) {
      this.sendProgress(lessonId, {
        lessonId,
        status: 'error',
        progress: 0,
        qualityProgress: [...qualityProgress],
        error: 'All quality processing failed',
      });
      throw new Error('All quality processing failed');
    }

    // Generate and upload master playlist
    let masterPlaylistUrl = '';
    if (successfulQualities.length > 1) {
      try {
        masterPlaylistUrl = await this.generateMasterPlaylist(
          lessonName,
          videoUrls,
          successfulQualities
        );
        this.logger.log(`✅ Master playlist created: ${masterPlaylistUrl}`);
      } catch (error) {
        this.logger.error(`⚠️ Failed to create master playlist:`, error);
        // Continue without master playlist - individual qualities will still work
      }
    } else if (successfulQualities.length === 1) {
      // For single quality, use that quality's playlist as the master
      const singleQuality = successfulQualities[0];
      masterPlaylistUrl = videoUrls[singleQuality];
      this.logger.log(`✅ Single quality detected, using ${singleQuality} playlist as master: ${masterPlaylistUrl}`);
    }

    // Send final success status (DO NOT save to database yet - only on publish)
    this.sendProgress(lessonId, {
      lessonId,
      status: 'complete',
      progress: 100,
      qualityProgress: [...qualityProgress],
      message: `Video processed successfully! ${successfulQualities.length}/${qualities.length} qualities created and uploaded to R2. Will be saved to database on publish.`,
      videoUrls,
      thumbnailUrl,
      masterPlaylistUrl,
    });

    this.logger.log(`✅ Video processing complete: ${successfulQualities.length}/${qualities.length} qualities uploaded to R2`);

    // Cleanup temp files
    this.cleanupTempFiles(inputPath);

    return {
      success: true,
      message: `Video processed successfully! ${successfulQualities.length}/${qualities.length} qualities created`,
      videoUrls,
      thumbnailUrl,
      masterPlaylistUrl,
    };
  }

  /**
   * Generate HLS master playlist that references all quality variants
   */
  private async generateMasterPlaylist(
    lessonName: string,
    qualityPlaylists: Record<string, string>,
    qualities: string[]
  ): Promise<string> {
    const sanitizedName = lessonName.replace(/[^a-zA-Z0-9-_]/g, '_');
    const timestamp = Date.now();

    // Bandwidth estimates for each quality
    const bandwidthMap: Record<string, number> = {
      '460p': 900000,   // 900 Kbps
      '480p': 1000000,  // 1 Mbps
      '720p': 3000000,  // 3 Mbps
      '1080p': 6000000, // 6 Mbps
    };

    // Resolution map
    const resolutionMap: Record<string, string> = {
      '460p': '816x460',
      '480p': '854x480',
      '720p': '1280x720',
      '1080p': '1920x1080',
    };

    // Build master playlist content
    let masterContent = '#EXTM3U\n';
    masterContent += '#EXT-X-VERSION:3\n\n';

    // Sort qualities by height (ascending)
    const sortedQualities = qualities.sort((a, b) => {
      return parseInt(a) - parseInt(b);
    });

    this.logger.log(`📝 Generating master playlist with ${sortedQualities.length} qualities:`);
    
    // Add each quality variant
    for (const quality of sortedQualities) {
      const playlistUrl = qualityPlaylists[quality];
      const bandwidth = bandwidthMap[quality] || 2000000;
      const resolution = resolutionMap[quality] || '1280x720';

      this.logger.log(`   Adding ${quality}: ${resolution} @ ${bandwidth} bps`);
      
      masterContent += `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${resolution}\n`;
      masterContent += `${playlistUrl}\n\n`;
    }

    this.logger.log(`📄 Master playlist content:\n${masterContent}`);

    // Upload master playlist
    const masterPlaylistKey = `videos/${sanitizedName}_${timestamp}/master.m3u8`;
    const masterBuffer = Buffer.from(masterContent, 'utf-8');

    await this.r2UploadService.uploadHLSFile(
      masterBuffer,
      masterPlaylistKey,
      'application/vnd.apple.mpegurl'
    );

    // Generate signed URL for master playlist
    const signedMasterUrl = await this.r2UploadService.getSignedUrl(
      masterPlaylistKey,
      7 * 24 * 60 * 60 // 7 days
    );

    return signedMasterUrl;
  }

  /**
   * Process a single quality using FFmpeg - Generate HLS segments
   * Upload segments and playlist to R2 immediately after processing
   */
  private async processQuality(
    inputPath: string,
    quality: string,
    lessonName: string,
    onProgress: (progress: { quality: string; status: 'processing' | 'uploading' | 'complete' | 'error'; progress: number; error?: string }) => void,
  ): Promise<string> {
    const targetHeight = parseInt(quality);
    const sanitizedName = lessonName.replace(/[^a-zA-Z0-9-_]/g, '_');
    const timestamp = Date.now();
    const qualityDir = path.join(this.outputDir, `${sanitizedName}_${quality}_${timestamp}`);
    
    // Create directory for this quality's segments
    if (!fs.existsSync(qualityDir)) {
      fs.mkdirSync(qualityDir, { recursive: true });
    }

    const playlistFileName = `${quality}.m3u8`;
    const playlistPath = path.join(qualityDir, playlistFileName);
    const segmentPattern = path.join(qualityDir, `${quality}_%03d.ts`);

    // Bitrate settings based on quality
    const bitrateSettings: Record<string, { video: string; audio: string }> = {
      '460p': { video: '700k', audio: '128k' },
      '480p': { video: '800k', audio: '128k' },
      '720p': { video: '2500k', audio: '128k' },
      '1080p': { video: '5000k', audio: '192k' },
    };
    const bitrates = bitrateSettings[quality] || { video: '2500k', audio: '128k' };

    return new Promise((resolve, reject) => {
      this.logger.log(`🎬 Starting HLS ${quality} processing...`);

      let lastProgressUpdate = Date.now();
      const PROGRESS_THROTTLE = 5000; // 5 seconds

      ffmpeg(inputPath)
        .outputOptions([
          `-vf scale=-2:${targetHeight}`, // Keep aspect ratio, set height
          '-c:v libx264',
          '-preset fast',
          '-crf 23',
          `-b:v ${bitrates.video}`,
          '-c:a aac',
          `-b:a ${bitrates.audio}`,
          // HLS options
          '-f hls',
          '-hls_time 10', // 10 second segments
          '-hls_list_size 0', // Keep all segments in playlist
          '-hls_segment_type mpegts',
          `-hls_segment_filename ${segmentPattern}`,
        ])
        .output(playlistPath)
        .on('start', (cmd) => {
          this.logger.log(`📝 FFmpeg HLS command: ${cmd}`);
          onProgress({
            quality,
            status: 'processing',
            progress: 0,
          });
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            const now = Date.now();
            if (now - lastProgressUpdate >= PROGRESS_THROTTLE) {
              this.logger.log(`${quality}: ${progress.percent.toFixed(1)}%`);
              onProgress({
                quality,
                status: 'processing',
                progress: Math.round(progress.percent * 0.7), // 0-70% for processing
              });
              lastProgressUpdate = now;
            }
          }
        })
        .on('end', async () => {
          try {
            onProgress({
              quality,
              status: 'uploading',
              progress: 75,
            });

            this.logger.log(`✅ ${quality}: HLS segments generated, uploading to R2...`);

            // Read all generated files (playlist + segments)
            const files = fs.readdirSync(qualityDir);
            const uploadPromises: Promise<{ key: string; url: string }>[] = [];
            let playlistFile = '';
            const segmentUrls: Map<string, string> = new Map();

            // First, collect all segments to upload
            const segmentFiles: Array<{ file: string; buffer: Buffer; r2Key: string }> = [];
            
            for (const file of files) {
              if (file.endsWith('.ts')) {
                const filePath = path.join(qualityDir, file);
                const buffer = fs.readFileSync(filePath);
                
                // Generate R2 key with lesson structure
                const r2Key = `videos/${sanitizedName}_${timestamp}/${quality}/${file}`;
                
                segmentFiles.push({ file, buffer, r2Key });
              } else if (file.endsWith('.m3u8')) {
                playlistFile = file;
              }
            }

            // Upload segments in batches to prevent socket exhaustion
            this.logger.log(`Uploading ${segmentFiles.length} segments for ${quality} in batches of 50`);
            
            const uploadedSegments = await this.batchUpload(
              segmentFiles,
              async ({ file, buffer, r2Key }) => {
                const key = await this.r2UploadService.uploadHLSFile(
                  buffer,
                  r2Key,
                  'video/mp2t'
                );
                const signedUrl = await this.r2UploadService.getSignedUrl(key, 7 * 24 * 60 * 60);
                return { key, url: signedUrl, filename: file };
              },
              50 // Batch size
            );
            
            // Build segment URL map
            uploadedSegments.forEach(({ filename, url }) => {
              segmentUrls.set(filename, url);
            });

            // Now modify the playlist to use absolute URLs
            const playlistPath = path.join(qualityDir, playlistFile);
            let playlistContent = fs.readFileSync(playlistPath, 'utf-8');
            
            // Replace relative segment paths with absolute signed URLs
            segmentUrls.forEach((url, filename) => {
              playlistContent = playlistContent.replace(
                new RegExp(filename, 'g'),
                url
              );
            });

            // Upload modified playlist
            const playlistBuffer = Buffer.from(playlistContent, 'utf-8');
            const playlistR2Key = `videos/${sanitizedName}_${timestamp}/${quality}/${playlistFile}`;
            
            await this.r2UploadService.uploadHLSFile(
              playlistBuffer,
              playlistR2Key,
              'application/vnd.apple.mpegurl'
            );

            // Generate signed URL for the playlist
            const signedPlaylistUrl = await this.r2UploadService.getSignedUrl(playlistR2Key, 7 * 24 * 60 * 60);

            // Cleanup local files
            fs.rmSync(qualityDir, { recursive: true, force: true });

            this.logger.log(`✅ ${quality} HLS uploaded to R2: ${signedPlaylistUrl}`);
            
            onProgress({
              quality,
              status: 'complete',
              progress: 100,
            });

            resolve(signedPlaylistUrl);
          } catch (error) {
            this.logger.error(`❌ Failed to upload ${quality} HLS:`, error);
            onProgress({
              quality,
              status: 'error',
              progress: 0,
              error: error instanceof Error ? error.message : 'Upload failed',
            });
            reject(error);
          }
        })
        .on('error', (error) => {
          this.logger.error(`❌ FFmpeg error for ${quality}:`, error);
          onProgress({
            quality,
            status: 'error',
            progress: 0,
            error: error.message,
          });
          reject(error);
        })
        .run();
    });
  }

  /**
   * Generate thumbnail from video
   */
  private async generateThumbnail(
    inputPath: string,
    lessonName: string,
  ): Promise<string> {
    const sanitizedName = lessonName.replace(/[^a-zA-Z0-9-_]/g, '_');
    const thumbnailFileName = `${sanitizedName}_thumbnail_${Date.now()}.jpg`;
    const thumbnailPath = path.join(this.outputDir, thumbnailFileName);

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .screenshots({
          timestamps: ['1'], // 1 second in
          filename: thumbnailFileName,
          folder: this.outputDir,
          size: '1280x720',
        })
        .on('end', async () => {
          try {
            // Read thumbnail
            const buffer = fs.readFileSync(thumbnailPath);
            
            // Upload to R2
            const thumbnailUrl = await this.r2UploadService.uploadVideo(
              buffer,
              thumbnailFileName,
              'image/jpeg'
            );

            // Cleanup local file
            fs.unlinkSync(thumbnailPath);

            this.logger.log(`Thumbnail uploaded: ${thumbnailUrl}`);
            resolve(thumbnailUrl);
          } catch (error) {
            this.logger.error('Failed to upload thumbnail:', error);
            reject(error);
          }
        })
        .on('error', (error) => {
          this.logger.error('Thumbnail generation error:', error);
          reject(error);
        });
    });
  }

  /**
   * Cleanup temporary files
   */
  private cleanupTempFiles(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        this.logger.log(`Cleaned up temp file: ${filePath}`);
      }
    } catch (error) {
      this.logger.error('Failed to cleanup temp files:', error);
    }
  }
}
