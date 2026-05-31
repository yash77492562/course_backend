#!/bin/bash

echo "🔍 Testing Backend Services..."
echo ""

# Test Gateway
echo "Testing Gateway (3002)..."
curl -s http://localhost:3002/api/upload/active > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "✅ Gateway is running on port 3002"
else
  echo "❌ Gateway is NOT running on port 3002"
fi

# Test Video Upload Services
echo ""
echo "Testing Video Upload Services..."

echo "Testing 460p upload (3010)..."
curl -s http://localhost:3010/video-upload-460p/health > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "✅ 460p service is running on port 3010"
else
  echo "❌ 460p service is NOT running on port 3010"
fi

echo "Testing 720p upload (3011)..."
curl -s http://localhost:3011/video-upload-720p/health > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "✅ 720p service is running on port 3011"
else
  echo "❌ 720p service is NOT running on port 3011"
fi

echo "Testing 1080p upload (3012)..."
curl -s http://localhost:3012/video-upload-1080p/health > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "✅ 1080p service is running on port 3012"
else
  echo "❌ 1080p service is NOT running on port 3012"
fi

echo ""
echo "Testing port availability..."
lsof -i :3002 -i :3010 -i :3011 -i :3012 | grep LISTEN
