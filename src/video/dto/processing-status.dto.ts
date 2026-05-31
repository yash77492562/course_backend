export interface ProcessingStatusDto {
  lessonId: string;
  status: 'queued' | 'analyzing' | 'processing' | 'uploading' | 'complete' | 'error';
  progress: number; // 0-100
  queuePosition?: number; // Position in queue (1-based)
  currentQuality?: string;
  qualityProgress?: {
    quality: string;
    status: 'pending' | 'processing' | 'uploading' | 'complete' | 'error';
    progress: number; // 0-100
    error?: string;
  }[];
  message?: string;
  error?: string;
  videoUrls?: Record<string, string>;
  thumbnailUrl?: string;
  masterPlaylistUrl?: string;
}
