#!/bin/bash

# Complete Video Upload Flow Test
# Tests: Admin upload → Chunks → BullMQ → Worker → FFmpeg → R2

VIDEO_FILE="/Users/yash/Downloads/Class 1 – Introduction to Data Engineering - 2026_03_21 09_43 GMT – Recording.mp4"
LESSON_ID="test_lesson_$(date +%s)"
LESSON_NAME="Test Lesson"
CHUNK_SIZE=$((5 * 1024 * 1024)) # 5MB

echo "🎬 Complete Video Upload Flow Test"
echo "===================================="
echo ""
echo "Video: $VIDEO_FILE"
echo "Lesson ID: $LESSON_ID"
echo ""

# Check if video file exists
if [ ! -f "$VIDEO_FILE" ]; then
  echo "❌ Video file not found: $VIDEO_FILE"
  exit 1
fi

FILE_SIZE=$(stat -f%z "$VIDEO_FILE")
TOTAL_CHUNKS=$(( ($FILE_SIZE + $CHUNK_SIZE - 1) / $CHUNK_SIZE ))

echo "📊 File size: $(numfmt --to=iec-i --suffix=B $FILE_SIZE)"
echo "📦 Total chunks: $TOTAL_CHUNKS (5MB each)"
echo ""

# Function to upload to a quality
upload_quality() {
  local QUALITY=$1
  local PORT=$2
  
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📤 Uploading $QUALITY quality to port $PORT"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  # Step 1: Initiate upload
  echo "1️⃣  Initiating upload..."
  INITIATE_RESPONSE=$(curl -s -X POST "http://localhost:$PORT/video-upload-$QUALITY/initiate" \
    -H "Content-Type: application/json" \
    -d "{
      \"lessonId\": \"$LESSON_ID\",
      \"fileName\": \"test-video.mp4\",
      \"fileSize\": $FILE_SIZE,
      \"quality\": \"$QUALITY\"
    }")
  
  echo "Response: $INITIATE_RESPONSE"
  
  UPLOAD_ID=$(echo $INITIATE_RESPONSE | jq -r '.uploadId')
  
  if [ "$UPLOAD_ID" == "null" ] || [ -z "$UPLOAD_ID" ]; then
    echo "❌ Failed to initiate upload for $QUALITY"
    return 1
  fi
  
  echo "✅ Upload ID: $UPLOAD_ID"
  echo ""
  
  # Step 2: Upload chunks (first 3 chunks only for testing)
  echo "2️⃣  Uploading chunks (first 3 for testing)..."
  
  for CHUNK_INDEX in 0 1 2; do
    OFFSET=$(($CHUNK_INDEX * $CHUNK_SIZE))
    
    # Extract chunk from video file
    dd if="$VIDEO_FILE" of="/tmp/chunk_${CHUNK_INDEX}.bin" bs=$CHUNK_SIZE skip=$CHUNK_INDEX count=1 2>/dev/null
    
    echo "   Uploading chunk $((CHUNK_INDEX + 1))/3..."
    
    CHUNK_RESPONSE=$(curl -s -X POST "http://localhost:$PORT/video-upload-$QUALITY/chunk" \
      -F "chunk=@/tmp/chunk_${CHUNK_INDEX}.bin" \
      -F "uploadId=$UPLOAD_ID" \
      -F "chunkIndex=$CHUNK_INDEX" \
      -F "totalChunks=$TOTAL_CHUNKS" \
      -F "quality=$QUALITY")
    
    echo "   Response: $CHUNK_RESPONSE"
    
    # Clean up temp chunk
    rm -f "/tmp/chunk_${CHUNK_INDEX}.bin"
    
    if echo "$CHUNK_RESPONSE" | grep -q "success"; then
      echo "   ✅ Chunk $((CHUNK_INDEX + 1)) uploaded"
    else
      echo "   ❌ Chunk $((CHUNK_INDEX + 1)) failed"
      return 1
    fi
  done
  
  echo ""
  echo "✅ $QUALITY upload test complete (3 chunks uploaded)"
  echo "Upload ID: $UPLOAD_ID"
  echo ""
  
  # Return upload ID
  echo "$UPLOAD_ID"
}

# Upload to all 3 qualities
echo "🚀 Starting parallel uploads to all qualities..."
echo ""

UPLOAD_ID_460P=$(upload_quality "460p" "3010")
UPLOAD_ID_720P=$(upload_quality "720p" "3011")
UPLOAD_ID_1080P=$(upload_quality "1080p" "3012")

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Upload Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "460p Upload ID: $UPLOAD_ID_460P"
echo "720p Upload ID: $UPLOAD_ID_720P"
echo "1080p Upload ID: $UPLOAD_ID_1080P"
echo ""

# Step 3: Trigger processing
echo "3️⃣  Triggering video processing..."
PROCESS_RESPONSE=$(curl -s -X POST "http://localhost:3013/video-process/start" \
  -H "Content-Type: application/json" \
  -d "{
    \"uploadIds\": [\"$UPLOAD_ID_460P\", \"$UPLOAD_ID_720P\", \"$UPLOAD_ID_1080P\"],
    \"lessonId\": \"$LESSON_ID\",
    \"lessonName\": \"$LESSON_NAME\"
  }")

echo "Response: $PROCESS_RESPONSE"
echo ""

# Step 4: Check if jobs were added to BullMQ
echo "4️⃣  Checking BullMQ queue status..."
echo ""
npm run check-worker-status 2>/dev/null | grep -A 30 "video-processing"
echo ""

# Step 5: Check temp-uploads directory
echo "5️⃣  Checking temp-uploads directory..."
if [ -d "temp-uploads" ]; then
  echo "Files in temp-uploads:"
  ls -lh temp-uploads/ | tail -n +2 || echo "   (empty)"
else
  echo "   ❌ temp-uploads directory doesn't exist"
fi
echo ""

# Step 6: Monitor Redis for progress
echo "6️⃣  Checking Redis for active jobs..."
redis-cli --scan --pattern "course:upload:progress:*" | while read key; do
  echo "Key: $key"
  redis-cli get "$key" | jq '.' 2>/dev/null || redis-cli get "$key"
done
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Test Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 Next steps:"
echo "   1. Check monitoring script: bash scripts/watch-upload.sh"
echo "   2. Check worker logs for job processing"
echo "   3. Verify files appear in temp-output/"
echo ""
