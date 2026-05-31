import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { RedisService } from '../../redis/redis.service';

interface ChunkSession {
  uploadId: string;
  lessonId: string;
  fileName: string;
  fileSize: number;
  quality: string;
  totalChunks: number;
  receivedChunks: number[]; // Changed from Set to Array for Redis serialization
  filePath: string;
  createdAt: string; // Changed from Date to string for Redis serialization
}

@Injectable()
export class ChunkUploadService {
  private readonly logger = new Logger(ChunkUploadService.name);
  private readonly tempDir = './temp-uploads';
  private readonly SESSION_TTL = 3600; // 1 hour in seconds

  constructor(private readonly redisService: RedisService) {
    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    // Clean up old sessions every hour
    setInterval(() => this.cleanupOldSessions(), 60 * 60 * 1000);
  }

  /**
   * Initiate a new chunk upload session
   */
  async initiateUpload(
    lessonId: string,
    fileName: string,
    fileSize: number,
    quality: string,
    totalChunks: number,
  ): Promise<{ uploadId: string }> {
    const uploadId = uuidv4();
    const filePath = path.join(this.tempDir, `${uploadId}_${quality}.tmp`);

    const session: ChunkSession = {
      uploadId,
      lessonId,
      fileName,
      fileSize,
      quality,
      totalChunks,
      receivedChunks: [],
      filePath,
      createdAt: new Date().toISOString(),
    };

    // Store session in Redis with TTL
    await this.redisService.set(
      `upload:session:${uploadId}`,
      session,
      this.SESSION_TTL
    );

    this.logger.log(`Upload session initiated in Redis: ${uploadId} (${quality})`);

    return { uploadId };
  }

  /**
   * Handle incoming chunk using streaming (Busboy-based)
   */
  async handleChunk(
    uploadId: string,
    chunkIndex: number,
    chunkBuffer: Buffer,
  ): Promise<{ isComplete: boolean; filePath?: string }> {
    const session = await this.getSession(uploadId);
    
    if (!session) {
      throw new BadRequestException('Upload session not found');
    }

    // Validate chunk index
    if (chunkIndex < 0 || chunkIndex >= session.totalChunks) {
      throw new BadRequestException('Invalid chunk index');
    }

    // Append chunk to file (streaming approach)
    await this.appendChunkToFile(session.filePath, chunkBuffer);
    
    // Mark chunk as received
    if (!session.receivedChunks.includes(chunkIndex)) {
      session.receivedChunks.push(chunkIndex);
      // Update session in Redis
      await this.redisService.set(
        `upload:session:${uploadId}`,
        session,
        this.SESSION_TTL
      );
    }

    this.logger.log(`Chunk ${chunkIndex + 1}/${session.totalChunks} received for ${session.quality}`);

    // Check if all chunks received
    if (session.receivedChunks.length === session.totalChunks) {
      this.logger.log(`All chunks received for ${uploadId} (${session.quality})`);
      
      const filePath = session.filePath;
      
      // Don't delete session yet - let the caller handle cleanup
      return { isComplete: true, filePath };
    }

    return { isComplete: false };
  }

  /**
   * Append chunk to file (streaming)
   */
  private async appendChunkToFile(filePath: string, chunk: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      const stream = fs.createWriteStream(filePath, { flags: 'a' });
      
      stream.write(chunk, (err) => {
        if (err) {
          reject(err);
        } else {
          stream.end();
          resolve();
        }
      });
    });
  }

  /**
   * Get session info
   */
  async getSession(uploadId: string): Promise<ChunkSession | undefined> {
    const session = await this.redisService.get(`upload:session:${uploadId}`);
    return session || undefined;
  }

  /**
   * Delete session
   */
  async deleteSession(uploadId: string): Promise<void> {
    const session = await this.getSession(uploadId);
    
    if (session) {
      // Cleanup temp file if exists
      if (fs.existsSync(session.filePath)) {
        fs.unlinkSync(session.filePath);
      }
      
      // Delete from Redis
      await this.redisService.del(`upload:session:${uploadId}`);
      this.logger.log(`Session deleted from Redis: ${uploadId}`);
    }
  }

  /**
   * Cleanup old sessions (>1 hour)
   * Note: Redis TTL handles most cleanup, but this catches any orphaned files
   */
  private async cleanupOldSessions(): Promise<void> {
    try {
      // Clean up orphaned temp files older than 2 hours
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      
      if (fs.existsSync(this.tempDir)) {
        const files = fs.readdirSync(this.tempDir);
        
        for (const file of files) {
          const filePath = path.join(this.tempDir, file);
          const stats = fs.statSync(filePath);
          
          if (stats.mtimeMs < twoHoursAgo) {
            fs.unlinkSync(filePath);
            this.logger.log(`Cleaned up orphaned file: ${file}`);
          }
        }
      }
    } catch (error) {
      this.logger.error('Error during cleanup:', error.message);
    }
  }
}
