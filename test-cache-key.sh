#!/bin/bash

echo "🔍 Testing Cache Key Issue"
echo "=========================="
echo ""

# Test 1: Can we manually set the exact key?
echo "1️⃣ Testing manual SET with exact key 'courses:published'..."
redis-cli SET "courses:published" '{"test":"data"}' > /dev/null
EXISTS=$(redis-cli EXISTS "courses:published")
if [ "$EXISTS" = "1" ]; then
    echo "✅ Manual SET works - key exists"
    redis-cli DEL "courses:published" > /dev/null
else
    echo "❌ Manual SET failed - key does not exist"
fi

# Test 2: Check for any special characters or encoding issues
echo ""
echo "2️⃣ Testing key with SETEX (with TTL like our code)..."
redis-cli SETEX "courses:published" 900 '{"test":"data"}' > /dev/null
EXISTS=$(redis-cli EXISTS "courses:published")
if [ "$EXISTS" = "1" ]; then
    echo "✅ SETEX works - key exists"
    TTL=$(redis-cli TTL "courses:published")
    echo "   TTL: $TTL seconds"
    redis-cli DEL "courses:published" > /dev/null
else
    echo "❌ SETEX failed - key does not exist"
fi

# Test 3: Monitor Redis during API call
echo ""
echo "3️⃣ Starting Redis MONITOR (will capture next 5 seconds)..."
echo "   Make an API call now or wait..."
echo ""

# Start monitor in background and capture for 5 seconds
timeout 5 redis-cli MONITOR > /tmp/redis-monitor.log 2>&1 &
MONITOR_PID=$!

# Wait 1 second then make API call
sleep 1
echo "📡 Making API call to /courses/public..."
curl -s http://localhost:3002/courses/public > /dev/null

# Wait for monitor to finish
wait $MONITOR_PID 2>/dev/null

echo ""
echo "4️⃣ Analyzing Redis MONITOR output..."
if [ -f /tmp/redis-monitor.log ]; then
    # Check for SET commands
    SET_COUNT=$(grep -c "\"SET\"" /tmp/redis-monitor.log || echo "0")
    SETEX_COUNT=$(grep -c "\"SETEX\"" /tmp/redis-monitor.log || echo "0")
    GET_COUNT=$(grep -c "\"GET\"" /tmp/redis-monitor.log || echo "0")
    
    echo "   SET commands: $SET_COUNT"
    echo "   SETEX commands: $SETEX_COUNT"
    echo "   GET commands: $GET_COUNT"
    
    if [ "$SET_COUNT" -gt 0 ] || [ "$SETEX_COUNT" -gt 0 ]; then
        echo ""
        echo "✅ Redis received SET/SETEX commands:"
        grep -E "\"SET\"|\"SETEX\"" /tmp/redis-monitor.log | head -5
    else
        echo ""
        echo "❌ No SET/SETEX commands found in Redis"
        echo "   This means RedisService.set() is NOT calling Redis"
    fi
    
    if [ "$GET_COUNT" -gt 0 ]; then
        echo ""
        echo "📥 GET commands found:"
        grep "\"GET\"" /tmp/redis-monitor.log | head -5
    fi
    
    # Show full log for debugging
    echo ""
    echo "📄 Full Redis MONITOR log:"
    cat /tmp/redis-monitor.log
    
    rm /tmp/redis-monitor.log
else
    echo "❌ Monitor log not found"
fi

echo ""
echo "5️⃣ Final check - any course keys in Redis?"
KEYS=$(redis-cli KEYS 'courses:*')
if [ -z "$KEYS" ]; then
    echo "❌ No course keys found"
else
    echo "✅ Found keys:"
    echo "$KEYS"
fi

echo ""
echo "=========================="
echo "🎯 CONCLUSION"
echo "=========================="
echo "If no SET/SETEX commands appear in MONITOR,"
echo "then RedisService.set() is not actually calling"
echo "the Redis client, even though it thinks it is."
echo ""
