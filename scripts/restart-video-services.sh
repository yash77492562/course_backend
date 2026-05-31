#!/bin/bash

echo "🔄 Restarting Video Upload Services..."
echo ""

# Kill video upload services
echo "Stopping video upload services..."
pkill -f "video-upload-460p-service"
pkill -f "video-upload-720p-service"
pkill -f "video-upload-1080p-service"

sleep 2

# Check if services are stopped
if pgrep -f "video-upload.*-service" > /dev/null; then
  echo "⚠️  Some services are still running. Force killing..."
  pkill -9 -f "video-upload.*-service"
  sleep 1
fi

echo "✅ Video upload services stopped"
echo ""
echo "Starting video upload services..."
echo ""

# Start services in background
npm run start:video-upload-460p > /dev/null 2>&1 &
npm run start:video-upload-720p > /dev/null 2>&1 &
npm run start:video-upload-1080p > /dev/null 2>&1 &

sleep 3

# Check if services started
echo "Checking service status..."
echo ""

if lsof -i :3010 | grep LISTEN > /dev/null; then
  echo "✅ 460p service running on port 3010"
else
  echo "❌ 460p service NOT running on port 3010"
fi

if lsof -i :3011 | grep LISTEN > /dev/null; then
  echo "✅ 720p service running on port 3011"
else
  echo "❌ 720p service NOT running on port 3011"
fi

if lsof -i :3012 | grep LISTEN > /dev/null; then
  echo "✅ 1080p service running on port 3012"
else
  echo "❌ 1080p service NOT running on port 3012"
fi

echo ""
echo "🎬 Video upload services restarted!"
echo ""
echo "Test with:"
echo "  curl -X POST http://localhost:3000/video-upload-1080p/initiate \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"lessonId\":\"test\",\"fileName\":\"test.mp4\",\"fileSize\":1000000,\"quality\":\"1080p\"}'"
