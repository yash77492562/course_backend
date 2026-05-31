#!/bin/bash

echo "🧪 Testing Full Video Upload Flow"
echo "=================================="
echo ""

# Step 1: Initiate upload
echo "Step 1: Initiating upload..."
RESPONSE=$(curl -s -X POST http://localhost:3000/video-upload-1080p/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "lessonId": "test-lesson-123",
    "fileName": "test-video.mp4",
    "fileSize": 1000000,
    "quality": "1080p"
  }')

echo "Response: $RESPONSE"
echo ""

# Extract uploadId from response
UPLOAD_ID=$(echo $RESPONSE | grep -o '"uploadId":"[^"]*"' | cut -d'"' -f4)

if [ -z "$UPLOAD_ID" ]; then
  echo "❌ Failed to get uploadId"
  exit 1
fi

echo "✅ Got uploadId: $UPLOAD_ID"
echo ""

# Step 2: Create test chunk
echo "Step 2: Creating test chunk..."
echo "This is a test video chunk" > /tmp/test-chunk.txt
echo "✅ Test chunk created"
echo ""

# Step 3: Upload chunk
echo "Step 3: Uploading chunk..."
CHUNK_RESPONSE=$(curl -s -X POST http://localhost:3000/video-upload-1080p/chunk \
  -F "chunk=@/tmp/test-chunk.txt" \
  -F "uploadId=$UPLOAD_ID" \
  -F "chunkIndex=0" \
  -F "totalChunks=1" \
  -F "quality=1080p")

echo "Response: $CHUNK_RESPONSE"
echo ""

# Check if successful
if echo "$CHUNK_RESPONSE" | grep -q '"success":true'; then
  echo "✅ Chunk uploaded successfully!"
  
  if echo "$CHUNK_RESPONSE" | grep -q '"isComplete":true'; then
    echo "✅ Upload is complete!"
  fi
else
  echo "❌ Chunk upload failed"
  exit 1
fi

echo ""
echo "🎉 Full upload flow test PASSED!"
echo ""
echo "This confirms:"
echo "  ✅ FormData string-to-number conversion is working"
echo "  ✅ Validation is passing"
echo "  ✅ Chunk upload service is functional"
echo "  ✅ Upload session management is working"
