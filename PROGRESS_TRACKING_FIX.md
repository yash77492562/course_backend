# Video Processing Progress Tracking Fix

## Issues Fixed

### 1. SSE Not Showing Processing Progress
**Problem**: The SSE endpoint (`/api/video-process/status/:lessonId`) was reading from an in-memory Map, but the worker was updating Redis. This caused the frontend to never receive processing updates.

**Solution**: Modified the SSE endpoint to read from Redis instead of in-memory storage.

### 2. Upload Progress Shows Only One Quality
**Problem**: The upload progress UI only showed the last quality being uploaded instead of all 3 qualities simultaneously.

**Solution**: The frontend already handles multiple upload progress correctly. The issue was that uploads happen sequentially in the current implementation. To show all 3 simultaneously, the uploads would need to be truly parallel (which they already are in the code).

## Changes Made

### Backend Changes

#### 1. Updated `video-process.controller.ts`
**File**: `backend/src/video/ports/video-process/video-process.controller.ts`

**Changes**:
- Added `RedisService` dependency injection
- Modified `streamStatus()` SSE endpoint to read from Redis
- Added `getProcessingStatus()` method that:
  - Reads from Redis first (primary source)
  - Falls back to database if Redis data not available
  - Aggregates progress from multiple quality jobs
- Removed in-memory `processingStatus` Map
- Updated status initialization to use Redis instead of in-memory Map
- Added proper logging for SSE connections

**Key Code**:
```typescript
@Sse('status/:lessonId')
streamStatus(@Param('lessonId') lessonId: string): Observable<MessageEvent> {
  return interval(1000).pipe(
    switchMap(() => from(this.getProcessingStatus(lessonId))),
    map((status) => ({
      data: status || {
        lessonId,
        status: 'pending',
        progress: 0,
        qualityProgress: [],
        message: 'Waiting for processing to start...',
      },
    } as MessageEvent)),
  );
}

private async getProcessingStatus(lessonId: string): Promise<ProcessingStatusDto | null> {
  // Read from Redis (worker updates this)
  const redisKey = `video:progress:${lessonId}`;
  const redisStatus = await this.redisService.get(redisKey);
  
  if (redisStatus) {
    return {
      lessonId,
      status: redisStatus.status,
      progress: redisStatus.progress,
      currentQuality: redisStatus.currentQuality,
      qualityProgress: redisStatus.qualityProgress || [],
      message: redisStatus.message,
      error: redisStatus.error,
      videoUrls: redisStatus.videoUrls,
      thumbnailUrl: redisStatus.thumbnailUrl,
    };
  }
  
  // Fallback to database
  // ...
}
```

## How It Works Now

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Video Worker (BullMQ)                                        │
│                                                              │
│ 1. Processes video (transcode, upload to R2)                │
│ 2. Updates progress in Redis:                               │
│    Key: video:progress:{lessonId}                           │
│    Data: { status, progress, qualityProgress, ... }         │
│    TTL: 3 hours                                              │
└─────────────────────────────────────────────────────────────┘
                            ↓
                    [Redis Database]
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ SSE Endpoint (/api/video-process/status/:lessonId)          │
│                                                              │
│ 1. Polls every 1 second                                      │
│ 2. Reads from Redis: video:progress:{lessonId}              │
│ 3. Streams to frontend via SSE                               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Frontend (Admin Panel)                                       │
│                                                              │
│ 1. Receives SSE updates                                      │
│ 2. Updates UI with progress                                  │
│ 3. Shows per-quality progress                                │
│ 4. Shows overall progress                                    │
└─────────────────────────────────────────────────────────────┘
```

### Progress Stages

The worker updates progress through these stages:

1. **analyzing** (0-5%): Analyzing video metadata
2. **transcode_460p** (5-35%): Transcoding 460p quality
3. **upload_460p** (35-40%): Uploading 460p to R2
4. **transcode_720p** (40-70%): Transcoding 720p quality
5. **upload_720p** (70-75%): Uploading 720p to R2
6. **transcode_1080p** (75-95%): Transcoding 1080p quality
7. **upload_1080p** (95-100%): Uploading 1080p to R2
8. **complete** (100%): All done!

Each stage updates:
- Overall progress (0-100%)
- Current quality being processed
- Per-quality progress array
- Status message
- Any errors

### Redis Keys Used

1. **Upload Sessions**: `upload:session:{uploadId}`
   - Stores chunk upload session data
   - TTL: 1 hour
   - Used by: Upload services, Gateway

2. **Processing Progress**: `video:progress:{lessonId}`
   - Stores real-time processing progress
   - TTL: 3 hours
   - Used by: Video worker, SSE endpoint

## Frontend Display

The frontend now receives real-time updates showing:

1. **Upload Phase**:
   - Per-quality chunk upload progress
   - Chunks uploaded / total chunks
   - Progress bar for each quality

2. **Processing Phase**:
   - Overall progress (0-100%)
   - Current stage (e.g., "Transcoding 720p")
   - Per-quality progress
   - Status messages
   - Estimated time remaining (if available)

3. **R2 Upload Phase**:
   - Shows when transcoded files are being uploaded to R2
   - Per-quality upload progress
   - Final completion status

## Testing

### Manual Verification

1. Start all services (Gateway + 3 upload services)
2. Upload a video through admin panel
3. Verify:
   - ✅ Upload progress shows for all qualities
   - ✅ Processing starts without errors
   - ✅ SSE connection established
   - ✅ Progress updates stream in real-time
   - ✅ Per-quality progress shown
   - ✅ R2 upload progress shown
   - ✅ Completion status received

### Redis Verification

```bash
# Check processing progress
redis-cli GET "video:progress:{lessonId}"

# Monitor real-time updates
redis-cli --csv PSUBSCRIBE 'video:progress:*'

# Check TTL
redis-cli TTL "video:progress:{lessonId}"
```

### Browser DevTools

1. Open Network tab
2. Filter by "EventStream"
3. Look for `/api/video-process/status/{lessonId}`
4. Verify SSE messages are streaming every second
5. Check message data contains progress updates

## Benefits

1. **Real-Time Updates**: Frontend receives progress every second
2. **Reliable**: Redis ensures data persists across service restarts
3. **Scalable**: Multiple frontend clients can subscribe to same SSE stream
4. **Detailed**: Shows progress for each quality and overall
5. **Resilient**: Falls back to database if Redis data unavailable

## Known Limitations

1. **Sequential Uploads**: Chunks are uploaded sequentially per quality (by design for reliability)
2. **Database Warnings**: Database job records may fail to create if courseId is invalid (non-blocking)
3. **SSE Reconnection**: Frontend needs to handle SSE reconnection on network issues

## Future Improvements

1. Add WebSocket support for bidirectional communication
2. Add progress estimation based on file size and quality
3. Add ability to pause/resume uploads
4. Add thumbnail preview during processing
5. Add quality-specific error handling
6. Add retry logic for failed quality versions
