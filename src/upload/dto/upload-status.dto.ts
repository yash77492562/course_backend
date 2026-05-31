export interface UploadStatusDto {
  courseId: string;
  lessonId: string;
  videoId?: string;
  status: 'uploading' | 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  stage: 'upload' | 'transcode_460p' | 'transcode_720p' | 'transcode_1080p' | 'thumbnail' | 'complete';
  startedAt: string;
  updatedAt: string;
  uploadedBy: string; // User ID
  fileName?: string;
  fileSize?: number;
  error?: string;
}

export interface CourseUploadLockDto {
  courseId: string;
  isLocked: boolean;
  currentUpload?: {
    lessonId: string;
    fileName: string;
    progress: number;
    status: string;
    uploadedBy: string;
  };
}
