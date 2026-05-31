#!/bin/bash

echo "🎬 Real-time Video Upload Monitor"
echo "=================================="
echo ""
echo "Monitoring:"
echo "  - temp-uploads/ (chunk assembly)"
echo "  - temp-output/ (transcoded files)"
echo "  - Backend logs (worker activity)"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Function to show directory contents
show_status() {
  clear
  echo "🎬 Video Upload Status - $(date '+%H:%M:%S')"
  echo "=========================================="
  echo ""
  
  echo "📁 TEMP UPLOADS (Chunks being assembled):"
  if [ -d "temp-uploads" ] && [ "$(ls -A temp-uploads 2>/dev/null)" ]; then
    ls -lh temp-uploads/ | tail -n +2 | awk '{printf "   %-40s %10s\n", $9, $5}'
    echo "   Total: $(du -sh temp-uploads 2>/dev/null | cut -f1)"
  else
    echo "   (empty)"
  fi
  echo ""
  
  echo "📁 TEMP OUTPUT (Transcoded HLS files):"
  if [ -d "temp-output" ] && [ "$(ls -A temp-output 2>/dev/null)" ]; then
    for dir in temp-output/*/; do
      if [ -d "$dir" ]; then
        echo "   📂 $(basename $dir):"
        ls -lh "$dir" 2>/dev/null | tail -n +2 | head -5 | awk '{printf "      %-35s %10s\n", $9, $5}'
        count=$(ls "$dir" 2>/dev/null | wc -l)
        if [ $count -gt 5 ]; then
          echo "      ... and $((count - 5)) more files"
        fi
      fi
    done
  else
    echo "   (empty)"
  fi
  echo ""
  
  echo "🔴 REDIS - Active Uploads:"
  redis-cli --scan --pattern "course:upload:progress:*" 2>/dev/null | while read key; do
    data=$(redis-cli get "$key" 2>/dev/null)
    if [ ! -z "$data" ]; then
      echo "   $key:"
      echo "$data" | jq -r '   "     Progress: \(.progress)% | Stage: \(.stage) | Status: \(.status)"' 2>/dev/null || echo "     $data"
    fi
  done
  
  active=$(redis-cli scard "course:uploads:active" 2>/dev/null)
  if [ "$active" -gt 0 ]; then
    echo "   Active uploads: $active"
  else
    echo "   (no active uploads)"
  fi
}

# Show initial status
show_status

# Watch for changes every 2 seconds
while true; do
  sleep 2
  show_status
done
