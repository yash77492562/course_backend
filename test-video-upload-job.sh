#!/bin/bash

# Test VideoUploadJob Data
# Usage: ./test-video-upload-job.sh <lessonId>

LESSONID=${1:-"934b088c4c1f463a8ea3487b"}

echo "========================================="
echo "Testing VideoUploadJob for lessonId: $LESSONID"
echo "========================================="
echo ""

echo "1. Test API Endpoint"
echo "---"
curl -s "http://localhost:3002/api/video-processing/jobs/$LESSONID" | jq '.'
echo ""

echo "========================================="
echo "2. Check MongoDB directly"
echo "---"
mongo riva --quiet --eval "db.video_upload_jobs.findOne({ lessonId: '$LESSONID' })" | jq '.'
echo ""

echo "========================================="
echo "3. Check if videoUrls field exists"
echo "---"
mongo riva --quiet --eval "
  var job = db.video_upload_jobs.findOne({ lessonId: '$LESSONID' });
  if (job) {
    print('Job found!');
    print('Status: ' + job.status);
    print('Progress: ' + job.progress + '%');
    print('videoUrls: ' + (job.videoUrls ? JSON.stringify(job.videoUrls) : 'MISSING'));
    print('thumbnailUrl: ' + (job.thumbnailUrl || 'MISSING'));
    print('masterPlaylistUrl: ' + (job.masterPlaylistUrl || 'MISSING'));
  } else {
    print('Job NOT found!');
  }
"
echo ""

echo "========================================="
echo "Done!"
echo ""
echo "Expected:"
echo "- Job should exist"
echo "- Status should be COMPLETED"
echo "- Progress should be 100"
echo "- videoUrls should have quality keys (460p, 720p, etc.)"
echo "- thumbnailUrl should be present"
echo "========================================="
