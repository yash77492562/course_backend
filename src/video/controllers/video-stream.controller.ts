import { Controller, Get, Param, Res, HttpException, HttpStatus, Headers } from '@nestjs/common';
import { Response } from 'express';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';

@Controller('api/video/stream')
export class VideoStreamController {
  private s3Client: S3Client;
  private bucketName: string;

  constructor(private configService: ConfigService) {
    this.s3Client = new S3Client({
      region: this.configService.get('R2_REGION') || 'auto',
      endpoint: this.configService.get('R2_ENDPOINT'),
      credentials: {
        accessKeyId: this.configService.get('R2_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.get('R2_SECRET_ACCESS_KEY'),
      },
    });
    this.bucketName = this.configService.get('R2_BUCKET_NAME');
  }

  @Get(':path(*)')
  async streamVideo(
    @Param('path') path: string,
    @Headers('range') range: string,
    @Res() res: Response,
  ) {
    try {
      console.log('🎥 Proxy request for:', path);
      
      // Decode the path (it might be URL encoded)
      const decodedPath = decodeURIComponent(path);
      console.log('📂 Decoded path:', decodedPath);

      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: decodedPath,
        Range: range, // Support range requests for video seeking
      });

      console.log('☁️ Fetching from R2:', this.bucketName, '/', decodedPath);
      const response = await this.s3Client.send(command);
      console.log('✅ R2 response received');

      // Set CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type');

      // Set content type
      if (response.ContentType) {
        res.setHeader('Content-Type', response.ContentType);
        console.log('📄 Content-Type:', response.ContentType);
      }

      // Set content range for partial content
      if (response.ContentRange) {
        res.setHeader('Content-Range', response.ContentRange);
        res.status(206); // Partial Content
      }

      // Set cache headers
      res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour cache

      // Check if this is an m3u8 playlist file - we need to rewrite URLs
      const isPlaylist = decodedPath.endsWith('.m3u8');
      
      if (isPlaylist && response.Body) {
        console.log('📝 Rewriting m3u8 playlist URLs to use proxy');
        
        // Read the entire playlist content
        const chunks: Buffer[] = [];
        // @ts-ignore
        for await (const chunk of response.Body) {
          chunks.push(chunk);
        }
        const playlistContent = Buffer.concat(chunks).toString('utf-8');
        
        // Rewrite URLs in the playlist
        const rewrittenContent = this.rewritePlaylistUrls(playlistContent, decodedPath);
        
        // Update content length
        res.setHeader('Content-Length', Buffer.byteLength(rewrittenContent));
        
        // Send the rewritten playlist
        res.send(rewrittenContent);
      } else if (response.Body) {
        // For non-playlist files (video segments), just stream as-is
        if (!response.ContentLength) {
          // If no content length, we need to buffer to set it
          const chunks: Buffer[] = [];
          // @ts-ignore
          for await (const chunk of response.Body) {
            chunks.push(chunk);
          }
          const buffer = Buffer.concat(chunks);
          res.setHeader('Content-Length', buffer.length);
          res.send(buffer);
        } else {
          // Stream directly
          // @ts-ignore - Body is a readable stream
          response.Body.pipe(res);
        }
      } else {
        throw new HttpException('Video not found', HttpStatus.NOT_FOUND);
      }
    } catch (error) {
      console.error('❌ Error streaming video:', error);
      console.error('Error details:', error.message);
      throw new HttpException(
        `Failed to stream video: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Rewrite URLs in HLS playlist to go through our proxy
   * This prevents CORS issues with direct R2 URLs
   */
  private rewritePlaylistUrls(playlistContent: string, playlistPath: string): string {
    const lines = playlistContent.split('\n');
    const rewrittenLines: string[] = [];
    
    // Get the directory of the current playlist
    const playlistDir = playlistPath.substring(0, playlistPath.lastIndexOf('/'));
    
    for (const line of lines) {
      // Skip comments and empty lines
      if (line.startsWith('#') || line.trim() === '') {
        rewrittenLines.push(line);
        continue;
      }
      
      // Check if this line is a URL
      if (line.startsWith('http://') || line.startsWith('https://')) {
        // This is a full URL (likely a signed R2 URL)
        // Extract the key from the URL and convert to proxy URL
        try {
          const url = new URL(line);
          const key = url.pathname.substring(1); // Remove leading slash
          const proxyUrl = `/api/video/stream/${key}`;
          console.log('  Rewriting URL:', line.substring(0, 100), '→', proxyUrl);
          rewrittenLines.push(proxyUrl);
        } catch (e) {
          console.error('  Failed to parse URL:', line);
          rewrittenLines.push(line);
        }
      } else if (line.trim().length > 0) {
        // This is a relative path
        // Convert to absolute proxy path
        const absolutePath = `${playlistDir}/${line.trim()}`;
        const proxyUrl = `/api/video/stream/${absolutePath}`;
        console.log('  Rewriting relative path:', line, '→', proxyUrl);
        rewrittenLines.push(proxyUrl);
      } else {
        rewrittenLines.push(line);
      }
    }
    
    return rewrittenLines.join('\n');
  }

  @Get('*')
  async handleOptions(@Res() res: Response) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    res.status(200).send();
  }
}
