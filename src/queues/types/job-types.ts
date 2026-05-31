// Video Processing Jobs
export interface VideoProcessingJobData {
  type: 'process_video';
  courseId?: string; // CRITICAL: Optional for new courses (no courseId yet)
  videoId: string;
  lessonId: string; // Added for tracking
  lessonName?: string; // CRITICAL: For R2 path (videos/lessonName/quality/)
  qualities: ('460p' | '720p' | '1080p')[]; // CRITICAL FIX: Support multiple qualities
  inputPath: string;
  outputPath: string;
  userId: string;
  fileName?: string; // Added for UI display
}

export interface ThumbnailGenerationJobData {
  type: 'generate_thumbnail';
  courseId?: string; // CRITICAL: Optional for new courses
  videoId: string;
  lessonId: string; // Added for tracking
  lessonName?: string; // CRITICAL: For R2 path
  inputPath: string;
  outputPath: string;
  userId: string;
  fileName?: string; // Added for UI display
}

// Cache Management Jobs
export interface CacheWarmupJobData {
  type: 'cache_warmup';
  cacheType: 'popular_courses' | 'user_data' | 'course_list';
  targetIds?: string[];
}

export interface CacheInvalidationJobData {
  type: 'cache_invalidation';
  pattern: string;
  reason: string;
}

// Email Notification Jobs
export interface EmailNotificationJobData {
  type: 'send_email';
  to: string;
  subject: string;
  template: string;
  data: Record<string, any>;
}

// File Cleanup Jobs
export interface FileCleanupJobData {
  type: 'cleanup_files';
  paths: string[];
  olderThan?: Date;
}

// Course Data Refresh Jobs
export interface CourseRefreshJobData {
  type: 'refresh_course_data';
  courseId: string;
  refreshType: 'full' | 'metadata' | 'enrollment_count';
}

// User Data Refresh Jobs
export interface UserRefreshJobData {
  type: 'refresh_user_data';
  userId: string;
  refreshType: 'profile' | 'purchases' | 'progress';
}

// Payment Processing Jobs
export interface PaymentProcessingJobData {
  type: 'process_payment';
  paymentId: string;
  userId: string;
  amount: number;
  currency: string;
}

// Union types for different queue categories
export type VideoJobData = VideoProcessingJobData | ThumbnailGenerationJobData;
export type CacheJobData = CacheWarmupJobData | CacheInvalidationJobData;
export type NotificationJobData = EmailNotificationJobData;
export type MaintenanceJobData = FileCleanupJobData;
export type RefreshJobData = CourseRefreshJobData | UserRefreshJobData;
export type PaymentJobData = PaymentProcessingJobData;

// All job types
export type AllJobData = 
  | VideoJobData 
  | CacheJobData 
  | NotificationJobData 
  | MaintenanceJobData 
  | RefreshJobData 
  | PaymentJobData;