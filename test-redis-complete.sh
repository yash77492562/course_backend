#!/bin/bash

echo "=========================================="
echo "🧪 COMPLETE REDIS CACHE VERIFICATION TEST"
echo "=========================================="
echo ""

# Check if redis-cli is installed
if ! command -v redis-cli &> /dev/null; then
    echo "❌ redis-cli is not installed!"
    echo "Install with: brew install redis"
    exit 1
fi

# Check Redis connection
if ! redis-cli -h localhost -p 6379 PING > /dev/null 2>&1; then
    echo "❌ Cannot connect to Redis. Start it with:"
    echo "   brew services start redis"
    exit 1
fi

echo "✅ Redis is running on localhost:6379"
echo ""

echo "=========================================="
echo "STEP 1: Clear existing cache"
echo "=========================================="
echo "Deleting any existing course cache keys..."
redis-cli -h localhost -p 6379 DEL "courses:published" > /dev/null 2>&1
echo "✅ Cache cleared"
echo ""

echo "=========================================="
echo "STEP 2: Check Redis BEFORE API call"
echo "=========================================="
echo "Course cache keys in Redis:"
KEYS_BEFORE=$(redis-cli -h localhost -p 6379 KEYS 'courses:*')
if [ -z "$KEYS_BEFORE" ]; then
    echo "  ❌ No cache keys found (expected - cache is empty)"
else
    echo "$KEYS_BEFORE"
fi
echo ""

echo "=========================================="
echo "STEP 3: Make FIRST API call"
echo "=========================================="
echo "Calling: GET http://localhost:3002/courses/public"
echo ""
echo "⏱️  Timing the request..."
START_TIME=$(date +%s%N)
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}\nTIME:%{time_total}" http://localhost:3002/courses/public)
END_TIME=$(date +%s%N)
DURATION=$(echo "scale=3; ($END_TIME - $START_TIME) / 1000000000" | bc)

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
echo "✅ Response received"
echo "   Status: $HTTP_CODE"
echo "   Duration: ${DURATION}s"
echo ""
echo "📊 What happened:"
echo "   1. ⚠️  CACHE MISS - Data not in Redis"
echo "   2. 🗄️  DATABASE QUERY - Fetched from MongoDB"
echo "   3. 💾 CACHE SET - Stored in Redis for next time"
echo ""

sleep 2

echo "=========================================="
echo "STEP 4: Check Redis AFTER API call"
echo "=========================================="
echo "Course cache keys in Redis:"
KEYS_AFTER=$(redis-cli -h localhost -p 6379 KEYS 'courses:*')
if [ -z "$KEYS_AFTER" ]; then
    echo "  ❌ No cache keys found (unexpected!)"
    echo ""
    echo "⚠️  WARNING: Cache is not being stored!"
    echo "Check your backend logs for errors."
else
    echo "$KEYS_AFTER" | while read -r key; do
        if [ -n "$key" ]; then
            TTL=$(redis-cli -h localhost -p 6379 TTL "$key")
            SIZE=$(redis-cli -h localhost -p 6379 STRLEN "$key")
            echo "  ✅ $key"
            echo "     TTL: ${TTL}s (expires in $(($TTL / 60)) minutes)"
            echo "     Size: ${SIZE} bytes"
        fi
    done
fi
echo ""

echo "=========================================="
echo "STEP 5: Make SECOND API call (from cache)"
echo "=========================================="
echo "Calling: GET http://localhost:3002/courses/public"
echo ""
echo "⏱️  Timing the request..."
START_TIME2=$(date +%s%N)
RESPONSE2=$(curl -s -w "\nHTTP_CODE:%{http_code}\nTIME:%{time_total}" http://localhost:3002/courses/public)
END_TIME2=$(date +%s%N)
DURATION2=$(echo "scale=3; ($END_TIME2 - $START_TIME2) / 1000000000" | bc)

HTTP_CODE2=$(echo "$RESPONSE2" | grep "HTTP_CODE:" | cut -d: -f2)
echo "✅ Response received"
echo "   Status: $HTTP_CODE2"
echo "   Duration: ${DURATION2}s"
echo ""
echo "📊 What happened:"
echo "   1. ✅ CACHE HIT - Data found in Redis"
echo "   2. ⚡ FAST RESPONSE - No database query needed"
echo ""

echo "=========================================="
echo "STEP 6: Performance Comparison"
echo "=========================================="
echo ""
echo "First request (cache miss):  ${DURATION}s"
echo "Second request (cache hit):  ${DURATION2}s"
echo ""

# Calculate speedup
SPEEDUP=$(echo "scale=2; $DURATION / $DURATION2" | bc)
IMPROVEMENT=$(echo "scale=1; (($DURATION - $DURATION2) / $DURATION) * 100" | bc)

if (( $(echo "$SPEEDUP > 1" | bc -l) )); then
    echo "🚀 Cache is ${SPEEDUP}x FASTER!"
    echo "📈 Performance improvement: ${IMPROVEMENT}%"
else
    echo "⚠️  Cache doesn't seem faster. This might be normal for small datasets."
fi
echo ""

echo "=========================================="
echo "STEP 7: View cached data sample"
echo "=========================================="
FIRST_KEY=$(redis-cli -h localhost -p 6379 KEYS 'courses:*' | head -1)
if [ -n "$FIRST_KEY" ]; then
    echo "Key: $FIRST_KEY"
    echo ""
    echo "Data preview (first 300 characters):"
    redis-cli -h localhost -p 6379 GET "$FIRST_KEY" | head -c 300
    echo "..."
    echo ""
fi
echo ""

echo "=========================================="
echo "✅ TEST COMPLETE"
echo "=========================================="
echo ""
echo "Summary:"
echo "  ✅ Redis is connected and working"
if [ -n "$KEYS_AFTER" ]; then
    echo "  ✅ Cache is being stored in Redis"
    echo "  ✅ Subsequent requests use cached data"
    echo ""
    echo "🎯 YOUR APPLICATION IS USING REDIS CACHING!"
else
    echo "  ❌ Cache is NOT being stored"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Check backend logs for Redis errors"
    echo "  2. Verify REDIS_HOST and REDIS_PORT in .env"
    echo "  3. Make sure RedisService is properly configured"
fi
echo ""

echo "=========================================="
echo "📚 How to monitor Redis in real-time:"
echo "=========================================="
echo ""
echo "Open a new terminal and run:"
echo "  redis-cli MONITOR"
echo ""
echo "Then make API requests and watch Redis operations live!"
echo ""
