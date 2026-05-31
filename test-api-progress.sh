#!/bin/bash

# Test API Progress Endpoint
# Usage: ./test-api-progress.sh <videoId>

VIDEOID=${1:-"e771d35f676c42a390fa51b7"}

echo "========================================="
echo "Testing API Progress Endpoint"
echo "VideoId: $VIDEOID"
echo "========================================="
echo ""

# Test the API endpoint with pretty JSON
echo "📡 Fetching from: http://localhost:3002/api/video-processing/progress/$VIDEOID"
echo ""

curl -s "http://localhost:3002/api/video-processing/progress/$VIDEOID" | jq '.'

echo ""
echo "========================================="
echo "Testing with verbose output"
echo "========================================="
echo ""

curl -v "http://localhost:3002/api/video-processing/progress/$VIDEOID" 2>&1 | grep -E "(< HTTP|< Content-Type|< content-type)"

echo ""
echo "Done!"
