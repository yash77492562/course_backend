#!/bin/bash

# Cleanup Temporary Video Files
# Removes old files from temp directories

echo "🧹 Cleaning up temporary video files..."

# Define temp directories
TEMP_DIRS=(
  "./temp-analysis"
  "./temp-process"
  "./temp-upload"
  "./temp-output"
  "/tmp"
)

# Clean each directory
for DIR in "${TEMP_DIRS[@]}"; do
  if [ -d "$DIR" ]; then
    echo "📂 Checking $DIR..."
    
    # Find and delete files older than 1 hour
    find "$DIR" -name "video_*" -type f -mmin +60 -delete 2>/dev/null
    find "$DIR" -name "upload_*" -type f -mmin +60 -delete 2>/dev/null
    find "$DIR" -name "output_*" -type d -mmin +60 -exec rm -rf {} + 2>/dev/null
    
    # Count remaining files
    COUNT=$(find "$DIR" -name "video_*" -o -name "upload_*" -o -name "output_*" 2>/dev/null | wc -l)
    echo "   ✅ Cleaned $DIR (${COUNT} files remaining)"
  else
    echo "   ⚠️  $DIR does not exist"
  fi
done

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "📊 Current disk usage:"
du -sh ./temp-* /tmp/video_* /tmp/upload_* /tmp/output_* 2>/dev/null | head -20

echo ""
echo "💡 Tip: Run this script periodically to free up disk space"
echo "   Example: Add to crontab: 0 * * * * /path/to/cleanup-temp-files.sh"
