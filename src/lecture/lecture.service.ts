import { Injectable, Logger } from '@nestjs/common';
import { R2UploadService } from '../upload/services/r2-upload.service';
import * as crypto from 'crypto';

@Injectable()
export class LectureService {
  private readonly logger = new Logger(LectureService.name);

  constructor(private r2UploadService: R2UploadService) {}

  /**
   * Upload PDF to R2 and encrypt password if provided
   */
  async uploadPDF(
    buffer: Buffer,
    originalName: string,
    title: string,
    password?: string,
  ): Promise<{
    pdfUrl: string;
    isPasswordProtected: boolean;
    encryptedPassword?: string;
  }> {
    try {
      this.logger.log('📤 Uploading PDF to R2...');
      this.logger.log(`   Title: ${title}`);
      this.logger.log(`   Original name: ${originalName}`);
      this.logger.log(`   Buffer size: ${buffer.length} bytes`);

      // Generate unique filename
      const timestamp = Date.now();
      const sanitizedTitle = title.replace(/[^a-zA-Z0-9-_]/g, '_');
      const fileName = `lecture_${sanitizedTitle}_${timestamp}.pdf`;

      this.logger.log(`   Generated filename: ${fileName}`);

      // Upload to R2 (returns the key/path)
      const pdfKey = await this.r2UploadService.uploadVideo(
        buffer,
        fileName,
        'application/pdf'
      );

      this.logger.log(`✅ PDF uploaded to R2 with key: ${pdfKey}`);
      this.logger.log(`   Key type: ${typeof pdfKey}`);
      this.logger.log(`   Key value: "${pdfKey}"`);

      // Generate a signed URL valid for 7 days (PDFs are accessed less frequently)
      this.logger.log('🔐 Generating signed URL...');
      const pdfUrl = await this.r2UploadService.getSignedUrl(pdfKey, 7 * 24 * 60 * 60);

      this.logger.log(`✅ Generated signed URL for PDF`);
      this.logger.log(`   URL type: ${typeof pdfUrl}`);
      this.logger.log(`   URL length: ${pdfUrl.length}`);
      this.logger.log(`   URL starts with: ${pdfUrl.substring(0, 50)}...`);

      // Encrypt password if provided
      let encryptedPassword: string | undefined;
      if (password) {
        encryptedPassword = this.encryptPassword(password);
        this.logger.log('🔐 Password encrypted');
      }

      this.logger.log('📦 Returning result...');
      const result = {
        pdfUrl,
        isPasswordProtected: !!password,
        encryptedPassword,
      };
      this.logger.log(`   Result pdfUrl: ${result.pdfUrl.substring(0, 50)}...`);

      return result;
    } catch (error) {
      this.logger.error('❌ Failed to upload PDF:', error);
      this.logger.error(`   Error message: ${error.message}`);
      this.logger.error(`   Error stack: ${error.stack}`);
      throw error;
    }
  }

  /**
   * Encrypt password using AES-256
   */
  private encryptPassword(password: string): string {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(
      process.env.PDF_ENCRYPTION_KEY || 'default-secret-key-change-in-production',
      'salt',
      32
    );
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(password, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Return IV + encrypted data
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt password
   */
  decryptPassword(encryptedPassword: string): string {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(
      process.env.PDF_ENCRYPTION_KEY || 'default-secret-key-change-in-production',
      'salt',
      32
    );

    const parts = encryptedPassword.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];

    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
