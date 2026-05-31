#!/bin/bash

echo "=========================================="
echo "🔍 REDIS DATA INSPECTOR"
echo "=========================================="
echo ""

# Check if redis-cli is installed
if ! command -v redis-cli &> /dev/null; then
    echo "❌ redis-cli is not installed!"
    echo ""
    echo "To install redis-cli on macOS:"
    echo "  brew install redis"
    echo ""
    exit 1
fi

echo "📊 Redis Connection Info:"
echo "  Host: localhost"
echo "  Port: 6379"
echo ""

# Test connection
echo "🔌 Testing Redis connection..."
if redis-cli -h localhost -p 6379 PING > /dev/null 2>&1; then
    echo "✅ Connected to Redis successfully!"
else
    echo "❌ Cannot connect to Redis. Make sure Redis is running:"
    echo "   brew services start redis"
    exit 1
fi
echo ""

echo "=========================================="
echo "📋 ALL REDIS KEYS"
echo "=========================================="
redis-cli -h localhost -p 6379 KEYS '*'
echo ""

echo "=========================================="
echo "📦 CACHE KEYS (courses:*)"
echo "=========================================="
redis-cli -h localhost -p 6379 KEYS 'courses:*'
echo ""

echo "=========================================="
echo "🔑 BULL QUEUE KEYS (riva:bull:*)"
echo "=========================================="
redis-cli -h localhost -p 6379 KEYS 'riva:bull:*' | head -20
echo ""

echo "=========================================="
echo "💾 SAMPLE CACHED DATA"
echo "=========================================="
echo ""

# Get first course cache key
COURSE_KEY=$(redis-cli -h localhost -p 6379 KEYS 'courses:*' | head -1)

if [ -n "$COURSE_KEY" ]; then
    echo "📄 Key: $COURSE_KEY"
    echo "🕐 TTL: $(redis-cli -h localhost -p 6379 TTL "$COURSE_KEY") seconds"
    echo "📊 Type: $(redis-cli -h localhost -p 6379 TYPE "$COURSE_KEY")"
    echo ""
    echo "📝 Data (first 500 chars):"
    redis-cli -h localhost -p 6379 GET "$COURSE_KEY" | head -c 500
    echo ""
    echo "..."
else
    echo "⚠️  No course cache keys found. Make an API request first:"
    echo "   curl http://localhost:3002/courses/public"
fi
echo ""

echo "=========================================="
echo "📈 REDIS STATISTICS"
echo "=========================================="
echo ""
echo "Total Keys: $(redis-cli -h localhost -p 6379 DBSIZE | awk '{print $2}')"
echo "Memory Used: $(redis-cli -h localhost -p 6379 INFO memory | grep used_memory_human | cut -d: -f2)"
echo ""

echo "=========================================="
echo "🛠️  USEFUL REDIS COMMANDS"
echo "=========================================="
echo ""
echo "View all keys:"
echo "  redis-cli KEYS '*'"
echo ""
echo "Get value of a key:"
echo "  redis-cli GET 'courses:published'"
echo ""
echo "Check TTL (time to live):"
echo "  redis-cli TTL 'courses:published'"
echo ""
echo "Delete a key:"
echo "  redis-cli DEL 'courses:published'"
echo ""
echo "Clear all cache:"
echo "  redis-cli FLUSHDB"
echo ""
echo "Monitor Redis in real-time:"
echo "  redis-cli MONITOR"
echo ""
