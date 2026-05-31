#!/bin/bash

echo "🔍 Checking BullMQ Workers Status"
echo "=================================="
echo ""

echo "📊 Redis Keys for BullMQ:"
redis-cli -h localhost -p 6379 KEYS "riva:bull:*:meta" | while read key; do
  echo "  - $key"
done

echo ""
echo "📋 Video Processing Queue:"
echo "  Waiting: $(redis-cli -h localhost -p 6379 LLEN 'riva:bull:video-processing:wait')"
echo "  Active: $(redis-cli -h localhost -p 6379 LLEN 'riva:bull:video-processing:active')"
echo "  Completed: $(redis-cli -h localhost -p 6379 ZCARD 'riva:bull:video-processing:completed')"
echo "  Failed: $(redis-cli -h localhost -p 6379 ZCARD 'riva:bull:video-processing:failed')"
echo "  Prioritized: $(redis-cli -h localhost -p 6379 ZCARD 'riva:bull:video-processing:prioritized')"

echo ""
echo "🎯 Current Job (ID: 1):"
redis-cli -h localhost -p 6379 HGET "riva:bull:video-processing:1" "data" | jq -r '.'

echo ""
echo "✅ Check complete!"
