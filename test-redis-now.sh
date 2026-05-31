#!/bin/bash

echo "=========================================="
echo "🧪 REDIS CACHE TEST - DETAILED LOGGING"
echo "=========================================="
echo ""
echo "⚠️  IMPORTANT: Make sure you restarted the backend!"
echo "   Stop: Ctrl+C"
echo "   Start: npm run start:dev"
echo ""
echo "Press Enter when backend is ready..."
read

echo ""
echo "=========================================="
echo "TEST 1: First Request (Should be CACHE MISS)"
echo "=========================================="
echo ""
echo "Making request to: http://localhost:3002/courses/public"
echo ""
echo "👀 WATCH YOUR BACKEND TERMINAL FOR:"
echo "   🎯 ========== CACHE OPERATION START =========="
echo "   🔑 Key: courses:published"
echo "   🔌 Redis client status: CONNECTED (or NULL)"
echo "   ❌ CACHE MISS"
echo "   📊 DATABASE QUERY COMPLETE"
echo "   💾 CACHE SET SUCCESS"
echo ""

curl -s http://localhost:3002/courses/public > /dev/null
echo "✅ Request 1 completed"
echo ""

echo "Waiting 2 seconds..."
sleep 2

echo ""
echo "=========================================="
echo "TEST 2: Second Request (Should be CACHE HIT)"
echo "=========================================="
echo ""
echo "Making request to: http://localhost:3002/courses/public"
echo ""
echo "👀 WATCH YOUR BACKEND TERMINAL FOR:"
echo "   🎯 ========== CACHE OPERATION START =========="
echo "   ✅ CACHE HIT - Serving from Redis"
echo "   (No database query this time!)"
echo ""

curl -s http://localhost:3002/courses/public > /dev/null
echo "✅ Request 2 completed"
echo ""

echo "Waiting 2 seconds..."
sleep 2

echo ""
echo "=========================================="
echo "VERIFICATION: Check Redis Keys"
echo "=========================================="
echo ""
echo "Keys in Redis:"
redis-cli KEYS 'courses:*'
echo ""

KEYS_COUNT=$(redis-cli KEYS 'courses:*' | wc -l | tr -d ' ')
if [ "$KEYS_COUNT" -gt 0 ]; then
    echo "✅ SUCCESS: Found $KEYS_COUNT cache key(s) in Redis!"
    echo ""
    echo "Key details:"
    redis-cli KEYS 'courses:*' | while read -r key; do
        if [ -n "$key" ]; then
            TTL=$(redis-cli TTL "$key")
            TYPE=$(redis-cli TYPE "$key")
            echo "  📦 $key"
            echo "     Type: $TYPE"
            echo "     TTL: ${TTL}s"
        fi
    done
else
    echo "❌ PROBLEM: No cache keys found in Redis"
    echo ""
    echo "This means one of:"
    echo "  1. Redis client is NULL (check backend logs for 'Redis client is NULL')"
    echo "  2. There was an error storing data (check for 'Redis set error')"
    echo "  3. Backend wasn't restarted with new code"
fi
echo ""

echo "=========================================="
echo "📊 SUMMARY"
echo "=========================================="
echo ""
echo "Check your backend terminal logs to see:"
echo "  1. Redis initialization messages"
echo "  2. Cache operation details"
echo "  3. Any error messages"
echo ""
echo "If you see 'Redis client is NULL', Redis failed to connect."
echo "If you see 'CACHE SET SUCCESS', data was stored."
echo "If you see 'CACHE HIT' on 2nd request, caching works!"
echo ""
