#!/bin/bash

echo "🧪 Testing Video Upload Endpoints"
echo "=================================="
echo ""

# Test 460p endpoint
echo "📹 Testing 460p endpoint (port 3010)..."
response=$(curl -s -m 5 http://localhost:3010/video-upload-460p/initiate \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"lessonId":"test","fileName":"test.mp4","fileSize":1000,"quality":"460p"}' 2>&1)

if [ $? -eq 0 ]; then
  echo "✅ 460p endpoint responded:"
  echo "$response" | jq . 2>/dev/null || echo "$response"
else
  echo "❌ 460p endpoint failed or timed out"
  echo "$response"
fi

echo ""

# Test 720p endpoint
echo "📹 Testing 720p endpoint (port 3011)..."
response=$(curl -s -m 5 http://localhost:3011/video-upload-720p/initiate \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"lessonId":"test","fileName":"test.mp4","fileSize":1000,"quality":"720p"}' 2>&1)

if [ $? -eq 0 ]; then
  echo "✅ 720p endpoint responded:"
  echo "$response" | jq . 2>/dev/null || echo "$response"
else
  echo "❌ 720p endpoint failed or timed out"
  echo "$response"
fi

echo ""

# Test 1080p endpoint
echo "📹 Testing 1080p endpoint (port 3012)..."
response=$(curl -s -m 5 http://localhost:3012/video-upload-1080p/initiate \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"lessonId":"test","fileName":"test.mp4","fileSize":1000,"quality":"1080p"}' 2>&1)

if [ $? -eq 0 ]; then
  echo "✅ 1080p endpoint responded:"
  echo "$response" | jq . 2>/dev/null || echo "$response"
else
  echo "❌ 1080p endpoint failed or timed out"
  echo "$response"
fi

echo ""
echo "=================================="
echo "✅ Test complete"
