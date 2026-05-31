import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { NodeHttpHandler } from '@aws-sdk/node-http-handler';
import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class R2UploadService {
  private s3Client: S3Client;
  private bucketName: string;

  constructor() {
    this.bucketName = process.env.R2_BUCKET_NAME || 'influbee';
    
    // Create HTTP/HTTPS agents with increased socket limits
    // This prevents "socket usage at capacity" errors during video processing
    const httpAgent = new HttpAgent({
      maxSockets: 500, // Increased from default 50
      keepAlive: true,
      keepAliveMsecs: 1000,
    });
    
    const httpsAgent = new HttpsAgent({
      maxSockets: 500, // Increased from default 50
      keepAlive: true,
      keepAliveMsecs: 1000,
    });
    
    // Configure S3 client with custom request handler
    this.s3Client = new S3Client({
      region: process.env.R2_REGION || 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
      maxAttempts: 3,
      requestHandler: new NodeHttpHandler({
        httpAgent,
        httpsAgent,
        connectionTimeout: 30000, // 30 seconds
        socketTimeout: 30000, // 30 seconds
      }),
    });
    
    // Enable connection reuse for better performance
    if (typeof process !== 'undefined' && process.env) {
      process.env.AWS_NODEJS_CONNECTION_REUSE_ENABLED = '1';
    }
    
    console.log('✅ R2UploadService initialized with maxSockets: 500');
  }

  async uploadVideo(
    buffer: Buffer,
    originalFileName: string,
    contentType: string
  ): Promise<string> {
    try {
      console.log('☁️ R2UploadService: uploadVideo called');
      console.log('   Buffer size:', buffer.length, 'bytes');
      console.log('   Original filename:', originalFileName);
      console.log('   Content type:', contentType);
      console.log('   Bucket:', this.bucketName);
      console.log('   Endpoint:', process.env.R2_ENDPOINT);
      
      // Generate unique filename
      const fileExtension = originalFileName.split('.').pop();
      const uniqueFileName = `videos/${uuidv4()}.${fileExtension}`;
      
      console.log('   Generated key:', uniqueFileName);

      // Upload to R2
      const upload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: this.bucketName,
          Key: uniqueFileName,
          Body: buffer,
          ContentType: contentType,
        },
      });

      console.log('   Starting upload to R2...');
      const result = await upload.done();
      console.log('   Upload result:', result);
      
      // Return just the key (path in bucket) - we'll generate signed URLs on-demand
      console.log('✅ R2UploadService: Video uploaded successfully');
      console.log('   Key:', uniqueFileName);
      
      // Return the key instead of a URL
      return uniqueFileName;
    } catch (error) {
      console.error('❌ R2UploadService: Upload failed:', error);
      console.error('   Error details:', error.message);
      console.error('   Error stack:', error.stack);
      throw new Error(`Failed to upload video to R2: ${error.message}`);
    }
  }

  /**
   * Upload file to R2 with custom key
   * Used by video worker for HLS segments and playlists
   */
  async uploadFile(
    buffer: Buffer,
    key: string,
    contentType: string
  ): Promise<string> {
    try {
      console.log('☁️ R2UploadService: uploadFile called');
      console.log('   Buffer size:', buffer.length, 'bytes');
      console.log('   Key:', key);
      console.log('   Content type:', contentType);
      
      // Upload to R2
      const upload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: this.bucketName,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        },
      });

      await upload.done();
      
      console.log('✅ R2UploadService: File uploaded successfully');
      console.log('   Key:', key);
      
      // Return the key (path in bucket)
      return key;
    } catch (error) {
      console.error('❌ R2UploadService: Upload failed:', error);
      throw error;
    }
  }

  /**
   * Generate a signed URL for accessing a video
   * Valid for 1 hour by default
   * 
   * For HLS content, we need to ensure CORS headers are properly handled
   */
  async getSignedUrl(keyOrUrl: string, expiresIn: number = 3600): Promise<string> {
    try {
      // Check if it's already a signed URL
      if (keyOrUrl.startsWith('http://') || keyOrUrl.startsWith('https://')) {
        return keyOrUrl;
      }

      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: keyOrUrl,
        // Add response headers to ensure CORS works with presigned URLs
        ResponseCacheControl: 'public, max-age=31536000',
      });

      const signedUrl = await getSignedUrl(this.s3Client, command, { 
        expiresIn,
        // Ensure the signature doesn't break CORS
        unhoistableHeaders: new Set(),
      });
      
      console.log('🔐 Generated signed URL for:', keyOrUrl, '(expires in', expiresIn, 'seconds)');
      return signedUrl;
    } catch (error) {
      console.error('❌ Failed to generate signed URL:', error);
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }
  }

  /**
   * Generate proxy URL through backend (for CORS-safe access)
   * This proxies through the backend to avoid CORS issues with private R2 buckets
   */
  getProxyUrl(keyOrUrl: string): string {
    // Check if it's already a URL
    if (keyOrUrl.startsWith('http://') || keyOrUrl.startsWith('https://')) {
      return keyOrUrl;
    }

    // Generate proxy URL through backend
    // Use PUBLIC_BACKEND_URL for client-facing URLs (browser accessible)
    // Falls back to BACKEND_URL for server-side, then localhost
    const backendUrl = process.env.PUBLIC_BACKEND_URL || process.env.BACKEND_URL || 'http://localhost:3002';
    const proxyUrl = `${backendUrl}/api/video/stream/${keyOrUrl}`;
    
    console.log('🔄 Generated proxy URL for:', keyOrUrl);
    console.log('🔄 Using backend URL:', backendUrl);
    return proxyUrl;
  }

  /**
   * Generate proxy URLs for multiple video qualities
   */
  getProxyUrlsForQualities(videoUrls: Record<string, string>): Record<string, string> {
    const proxyUrls: Record<string, string> = {};
    
    for (const [quality, keyOrUrl] of Object.entries(videoUrls)) {
      proxyUrls[quality] = this.getProxyUrl(keyOrUrl);
    }
    
    return proxyUrls;
  }

  /**
   * Generate a public URL for accessing a file (requires bucket to be public or have CORS)
   * Use this for HLS content to avoid presigned URL issues
   */
  getPublicUrl(keyOrUrl: string): string {
    // Check if it's already a URL
    if (keyOrUrl.startsWith('http://') || keyOrUrl.startsWith('https://')) {
      return keyOrUrl;
    }

    // Generate public URL
    // Format: https://bucket.account.r2.cloudflarestorage.com/key
    const endpoint = process.env.R2_ENDPOINT;
    const publicUrl = `${endpoint}/${keyOrUrl}`;
    
    console.log('🌐 Generated public URL for:', keyOrUrl);
    return publicUrl;
  }

  /**
   * Generate signed URLs for multiple video qualities
   */
  async getSignedUrlsForQualities(videoUrls: Record<string, string>): Promise<Record<string, string>> {
    const signedUrls: Record<string, string> = {};
    
    for (const [quality, keyOrUrl] of Object.entries(videoUrls)) {
      // Check if it's already a signed URL (contains http/https)
      if (keyOrUrl.startsWith('http://') || keyOrUrl.startsWith('https://')) {
        // Already a signed URL, return as-is
        signedUrls[quality] = keyOrUrl;
      } else {
        // It's a key, generate signed URL
        signedUrls[quality] = await this.getSignedUrl(keyOrUrl);
      }
    }
    
    return signedUrls;
  }

  /**
   * Generate public URLs for multiple video qualities (for HLS content)
   * Use this instead of signed URLs for HLS to avoid CORS issues
   */
  getPublicUrlsForQualities(videoUrls: Record<string, string>): Record<string, string> {
    const publicUrls: Record<string, string> = {};
    
    for (const [quality, keyOrUrl] of Object.entries(videoUrls)) {
      publicUrls[quality] = this.getPublicUrl(keyOrUrl);
    }
    
    return publicUrls;
  }

  /**
   * Upload HLS file (segment or playlist) to R2
   * Used for chunked video streaming
   */
  async uploadHLSFile(
    buffer: Buffer,
    key: string,
    contentType: string
  ): Promise<string> {
    try {
      console.log('☁️ R2UploadService: uploadHLSFile called');
      console.log('   Buffer size:', buffer.length, 'bytes');
      console.log('   Key:', key);
      console.log('   Content type:', contentType);

      const upload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: this.bucketName,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        },
      });

      await upload.done();
      
      console.log('✅ R2UploadService: HLS file uploaded successfully');
      console.log('   Key:', key);
      
      return key;
    } catch (error) {
      console.error('❌ R2UploadService: HLS upload failed:', error);
      throw new Error(`Failed to upload HLS file to R2: ${error.message}`);
    }
  }

  async deleteVideo(key: string): Promise<void> {
    try {
      await this.s3Client.send(new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }));

      console.log('Video deleted from R2:', key);
    } catch (error) {
      console.error('R2 delete failed:', error);
      throw new Error(`Failed to delete video from R2: ${error.message}`);
    }
  }
}