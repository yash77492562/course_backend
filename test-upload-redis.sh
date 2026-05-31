#!/bin/bash

# Test script to manually add upload data to Redis
# This simulates what happens when a video upload starts

COURSE_ID="69c65b0ab8422af8511ad61d"  # Your course ID
MODULE_NAME="Module 5: Become a Job Ready"
LESSON_NAME="Introduction"
FILE_NAME="Introduction.mp4"

echo "🔧 Adding test upload data to Redis..."
echo ""

# Create the upload progress data
PROGRESS_DATA=$(cat <<EOF
{
  "courseId": "$COURSE_ID",
  "lessonId": "temp_$(date +%s)",
  "fileName": "$FILE_NAME",
  "moduleName": "$MODULE_NAME",
  "lessonName": "$LESSON_NAME",
  "status": "processing",
  "progress": 33,
  "stage": "transcode_720p",
  "message": "Processing 720p quality...",
  "uploadedBy": "admin1",
  "updatedAt": "$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"
}
EOF
)

# Set the progress in Redis (TTL: 3 hours = 10800 seconds)
redis-cli SETEX "course:upload:progress:$COURSE_ID" 10800 "$PROGRESS_DATA"

# Set the lock
redis-cli SETEX "course:upload:lock:$COURSE_ID" 7200 "admin1"

# Add to active uploads set
redis-cli SADD "course:uploads:active" "$COURSE_ID"

echo "✅ Test data added to Redis!"
echo ""
echo "📊 Checking Redis keys:"
redis-cli KEYS "course:upload:*"
echo ""
echo "📄 Progress data:"
redis-cli GET "course:upload:progress:$COURSE_ID" | jq .
echo ""
echo "🔒 Lock owner:"
redis-cli GET "course:upload:lock:$COURSE_ID"
echo ""
echo "📋 Active uploads:"
redis-cli SMEMBERS "course:uploads:active"
echo ""
echo "✨ Now open your admin panel and you should see the upload status!"
echo "   Course ID: $COURSE_ID"
echo "   Module: $MODULE_NAME"
echo "   Lesson: $LESSON_NAME"
echo "   File: $FILE_NAME"
