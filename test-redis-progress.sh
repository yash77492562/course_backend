#!/bin/bash

# Test Redis Progress Data
# Usage: ./test-redis-progress.sh <videoId>

VIDEOID=${1:-"5563f1cd646f429cbebc3564"}

echo "========================================="
echo "Testing Redis Progress for videoId: $VIDEOID"
echo "========================================="

# Connect to Redis and get the progress data
redis-cli GET "video:progress:$VIDEOID"

echo ""
echo "========================================="
echo "Testing API Endpoint"
echo "========================================="

# Test the API endpoint
curl -s "http://localhost:3002/api/video-processing/progress/$VIDEOID" | jq '.'

echo ""
echo "========================================="
echo "All Redis Keys with 'video:progress'"
echo "========================================="

redis-cli KEYS "video:progress:*"

echo ""
echo "Done!"
