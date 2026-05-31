#!/bin/bash

# Monitor Video Upload Flow
# This script monitors the complete video upload and processing pipeline

echo "🔍 Video Upload & Processing Monitor"
echo "===================================="
echo ""

# Check temp-uploads directory (where chunks are assembled)
echo "📁 Checking temp-uploads directory..."
if [ -d "temp-uploads" ]; then
  echo "   Files in temp-uploads:"
  ls -lh temp-uploads/ | tail -n +2 | awk '{print "   - " $9 " (" $5 ")"}'
  echo "   Total size: $(du -sh temp-uploads/ 2>/dev/null | cut -f1)"
else
  echo "   ❌ No temp-uploads directory"
fi
echo ""

# Check temp-output directory (where transcoded files are created)
echo "📁 Checking temp-output directory..."
if [ -d "temp-output" ]; then
  echo "   Directories in temp-output:"
  ls -lh temp-output/ | tail -n +2 | awk '{print "   - " $9}'
  for dir in temp-output/*/; do
    if [ -d "$dir" ]; then
      echo "   Contents of $(basename $dir):"
      ls -lh "$dir" | tail -n +2 | awk '{print "     - " $9 " (" $5 ")"}'
    fi
  done
else
  echo "   ❌ No temp-output directory"
fi
echo ""

# Check BullMQ queue status
echo "📊 Checking BullMQ queue status..."
echo "   Running: npm run check-worker-status"
npm run check-worker-status 2>/dev/null | grep -A 20 "video-processing" || echo "   ❌ Could not check queue status"
echo ""

# Check Redis for active uploads
echo "🔴 Checking Redis for active uploads..."
redis-cli --scan --pattern "course:upload:*" 2>/dev/null | while read key; do
  echo "   Key: $key"
  redis-cli get "$key" 2>/dev/null | jq '.' 2>/dev/null || redis-cli get "$key"
done || echo "   ❌ Could not connect to Redis"
echo ""

# Watch for new files (run in background)
echo "👀 Watching for file changes..."
echo "   Press Ctrl+C to stop"
echo ""

# Monitor both directories
fswatch -0 temp-uploads temp-output 2>/dev/null | while read -d "" event; do
  echo "   📝 File changed: $event"
done &

WATCH_PID=$!

# Trap Ctrl+C to kill background process
trap "kill $WATCH_PID 2>/dev/null; exit" INT

# Keep script running
wait $WATCH_PID
