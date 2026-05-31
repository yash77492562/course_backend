# Video Processing Module

Backend video processing with parallel quality generation using FFmpeg.

## Architecture

```
Admin (Browser)
    ↓ Upload video in 5MB chunks (parallel to 3 ports)
Backend Ports:
  - video-upload-460p (3010)
  - video-upload-720p (3011)
  - video-upload-1080p (3012)
    ↓ Chunks reassembled
Backend Port:
  - video-process (3013)
    ↓ Analyze video → Process in PARALLEL
FFmpeg (3 parallel processes)
    ↓ Generate 460p, 720p, 1080p
R2 Storage
```

## Ports

| Port | Service | Purpose |
|------|---------|---------|
| 3010 | video-upload-460p | Receive 460p chunks |
| 3011 | video-upload-720p | Receive 720p chunks |
| 3012 | video-upload-1080p | Receive 1080p chunks |
| 3013 | video-process | Analyze & process video |

## Quality Logic

1. Check minimum 460p resolution
2. Determine available qualities:
   - height >= 460 → create 460p
   - height >= 720 → create 720p
   - height >= 1080 → create 1080p
3. Process ALL available qualities in PARALLEL
4. Keep original aspect ratio (no resizing width/height)

## API Endpoints

### Initiate Upload
```
POST http://localhost:3010/video-upload-460p/initiate
POST http://localhost:3011/video-upload-720p/initiate
POST http://localhost:3012/video-upload-1080p/initiate

Body:
{
  "lessonId": "string",
  "fileName": "string",
  "fileSize": number,
  "quality": "460p" | "720p" | "1080p"
}

Response:
{
  "success": true,
  "uploadId": "string"
}
```

### Upload Chunk
```
POST http://localhost:3010/video-upload-460p/chunk
POST http://localhost:3011/video-upload-720p/chunk
POST http://localhost:3012/video-upload-1080p/chunk

Body (multipart/form-data):
- chunk: File
- uploadId: string
- chunkIndex: number
- totalChunks: number
- quality: string

Response:
{
  "success": true,
  "isComplete": boolean
}
```

### Start Processing
```
POST http://localhost:3013/video-process/start

Body:
{
  "uploadIds": ["string"],
  "lessonId": "string",
  "lessonName": "string"
}

Response:
{
  "success": true,
  "message": "Video processed successfully"
}
```

## Running Services

### Individual Services
```bash
npm run start:video-upload-460p
npm run start:video-upload-720p
npm run start:video-upload-1080p
npm run start:video-process
```

### All Video Services
```bash
npm run start:all-video-services
```

### All Services (Gateway + User + Course + Upload + Video)
```bash
npm run start:all
```

## Dependencies

```json
{
  "fluent-ffmpeg": "^2.1.2",
  "@ffmpeg-installer/ffmpeg": "^1.1.0",
  "@ffprobe-installer/ffprobe": "^2.1.2"
}
```

## Environment Variables

```env
VIDEO_UPLOAD_460P_PORT=3010
VIDEO_UPLOAD_720P_PORT=3011
VIDEO_UPLOAD_1080P_PORT=3012
VIDEO_PROCESS_PORT=3013
```

## File Structure

```
backend/src/video/
├── dto/
│   ├── upload-chunk.dto.ts       # Chunk upload DTOs
│   └── process-video.dto.ts      # Video processing DTOs
│
├── services/
│   ├── video-analyzer.service.ts # Analyze video quality
│   ├── video-processor.service.ts # FFmpeg processing
│   └── chunk-upload.service.ts   # Handle chunked uploads
│
├── ports/
│   ├── video-upload-460p/
│   │   ├── video-upload-460p.controller.ts
│   │   ├── video-upload-460p.module.ts
│   │   └── video-upload-460p-service.ts
│   │
│   ├── video-upload-720p/
│   │   ├── video-upload-720p.controller.ts
│   │   ├── video-upload-720p.module.ts
│   │   └── video-upload-720p-service.ts
│   │
│   ├── video-upload-1080p/
│   │   ├── video-upload-1080p.controller.ts
│   │   ├── video-upload-1080p.module.ts
│   │   └── video-upload-1080p-service.ts
│   │
│   └── video-process/
│       ├── video-process.controller.ts
│       ├── video-process.module.ts
│       └── video-process-service.ts
│
├── video.module.ts               # Main video module
└── README.md                     # This file
```

## Features

- ✅ Chunked upload (5MB chunks) for large files (up to 6GB)
- ✅ Parallel quality processing (460p, 720p, 1080p)
- ✅ Streaming-based chunk handling (memory efficient)
- ✅ FFmpeg with hardware acceleration
- ✅ Automatic thumbnail generation
- ✅ Original aspect ratio preservation
- ✅ Minimum 460p quality check
- ✅ R2 storage integration
- ✅ Database updates with video metadata

## Processing Time

- Small video (<100MB): ~1-2 minutes
- Medium video (500MB-1GB): ~5-10 minutes
- Large video (1.6GB): ~15-20 minutes
- Very large video (6GB): ~40-60 minutes

Processing happens in parallel for all qualities, so total time is roughly the same as processing the highest quality.

## Error Handling

- Invalid video format → 400 Bad Request
- Video quality too low (<460p) → 400 Bad Request
- Missing chunks → 400 Bad Request
- FFmpeg processing error → Logged, quality skipped
- Upload session timeout → 1 hour (auto-cleanup)

## Testing

1. Start all video services
2. Upload a test video from admin
3. Check logs for processing progress
4. Verify videos uploaded to R2
5. Check database for updated lesson record
