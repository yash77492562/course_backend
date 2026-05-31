#!/bin/bash

# Upload Lock Status Checker
# This script shows the current upload status from Redis

echo "=================================================="
echo "🔍 UPLOAD LOCK STATUS CHECKER"
echo "=================================================="
echo ""

# Check if Redis is running
echo "1️⃣  Checking Redis connection..."
if redis-cli -h localhost -p 6379 ping > /dev/null 2>&1; then
    echo "   ✅ Redis is running"
else
    echo "   ❌ Redis is not running"
    exit 1
fi
echo ""

# List all course-related keys
echo "2️⃣  Finding all course-related keys..."
KEYS=$(redis-cli -h localhost -p 6379 KEYS "course:*")
if [ -z "$KEYS" ]; then
    echo "   ⚠️  No course keys found in Redis"
    exit 0
fi
echo "$KEYS" | while read -r key; do
    echo "   📦 $key"
done
echo ""

# Check active uploads
echo "3️⃣  Active uploads..."
ACTIVE=$(redis-cli -h localhost -p 6379 SMEMBERS "course:uploads:active")
if [ -z "$ACTIVE" ]; then
    echo "   ℹ️  No active uploads"
else
    echo "$ACTIVE" | while read -r courseId; do
        echo "   🎬 Course: $courseId"
    done
fi
echo ""

# Check each upload lock
echo "4️⃣  Upload locks..."
LOCKS=$(redis-cli -h localhost -p 6379 KEYS "course:upload:lock:*")
if [ -z "$LOCKS" ]; then
    echo "   ℹ️  No locks found"
else
    echo "$LOCKS" | while read -r lockKey; do
        OWNER=$(redis-cli -h localhost -p 6379 GET "$lockKey")
        COURSE_ID=$(echo "$lockKey" | sed 's/course:upload:lock://')
        echo "   🔒 Course: $COURSE_ID"
        echo "      Locked by: $OWNER"
    done
fi
echo ""

# Check upload progress
echo "5️⃣  Upload progress details..."
PROGRESS_KEYS=$(redis-cli -h localhost -p 6379 KEYS "course:upload:progress:*")
if [ -z "$PROGRESS_KEYS" ]; then
    echo "   ℹ️  No progress data found"
else
    echo "$PROGRESS_KEYS" | while read -r progressKey; do
        COURSE_ID=$(echo "$progressKey" | sed 's/course:upload:progress://')
        echo "   📊 Course: $COURSE_ID"
        echo ""
        
        # Get and format JSON
        PROGRESS=$(redis-cli -h localhost -p 6379 GET "$progressKey")
        
        # Extract key fields using grep and sed
        MODULE_NAME=$(echo "$PROGRESS" | grep -o '"moduleName": "[^"]*"' | sed 's/"moduleName": "\(.*\)"/\1/')
        LESSON_NAME=$(echo "$PROGRESS" | grep -o '"lessonName": "[^"]*"' | sed 's/"lessonName": "\(.*\)"/\1/')
        FILE_NAME=$(echo "$PROGRESS" | grep -o '"fileName": "[^"]*"' | sed 's/"fileName": "\(.*\)"/\1/')
        STATUS=$(echo "$PROGRESS" | grep -o '"status": "[^"]*"' | sed 's/"status": "\(.*\)"/\1/')
        PROGRESS_PCT=$(echo "$PROGRESS" | grep -o '"progress": [0-9]*' | sed 's/"progress": //')
        STAGE=$(echo "$PROGRESS" | grep -o '"stage": "[^"]*"' | sed 's/"stage": "\(.*\)"/\1/')
        MESSAGE=$(echo "$PROGRESS" | grep -o '"message": "[^"]*"' | sed 's/"message": "\(.*\)"/\1/')
        UPLOADED_BY=$(echo "$PROGRESS" | grep -o '"uploadedBy": "[^"]*"' | sed 's/"uploadedBy": "\(.*\)"/\1/')
        
        echo "      📚 Module: $MODULE_NAME"
        echo "      📹 Lesson: $LESSON_NAME"
        echo "      📁 File: $FILE_NAME"
        echo "      📊 Status: $STATUS"
        echo "      📈 Progress: $PROGRESS_PCT%"
        echo "      🔧 Stage: $STAGE"
        echo "      💬 Message: $MESSAGE"
        echo "      👤 Uploaded by: $UPLOADED_BY"
        echo ""
    done
fi

echo "=================================================="
echo "✅ Status check complete!"
echo "=================================================="
