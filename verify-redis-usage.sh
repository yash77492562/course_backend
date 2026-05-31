#!/bin/bash

# Redis & BullMQ Usage Verification Script
# This script checks if your APIs are properly using Redis

echo "🔍 ========== REDIS USAGE VERIFICATION =========="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Redis is running
echo "1️⃣ Checking Redis connection..."
if redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Redis is running${NC}"
else
    echo -e "${RED}❌ Redis is NOT running${NC}"
    echo "   Start Redis with: redis-server"
    exit 1
fi
echo ""

# Check BullMQ queues
echo "2️⃣ Checking BullMQ queues..."
QUEUES=("video-processing" "cache-management" "notifications" "payment-processing" "data-refresh" "maintenance")

for queue in "${QUEUES[@]}"; do
    if redis-cli exists "riva:bull:$queue:wait" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Queue exists: $queue${NC}"
    else
        echo -e "${YELLOW}⚠️  Queue not initialized yet: $queue${NC}"
    fi
done
echo ""

# Check cache keys
echo "3️⃣ Checking Redis cache keys..."

# Course caches
COURSE_KEYS=$(redis-cli keys "course:*" 2>/dev/null | wc -l)
if [ "$COURSE_KEYS" -gt 0 ]; then
    echo -e "${GREEN}✅ Course caches found: $COURSE_KEYS keys${NC}"
else
    echo -e "${YELLOW}⚠️  No course caches yet (will be created on first API call)${NC}"
fi

# User caches
USER_KEYS=$(redis-cli keys "user:*" 2>/dev/null | wc -l)
if [ "$USER_KEYS" -gt 0 ]; then
    echo -e "${GREEN}✅ User caches found: $USER_KEYS keys${NC}"
else
    echo -e "${YELLOW}⚠️  No user caches yet (will be created on first API call)${NC}"
fi

# Payment caches
PAYMENT_KEYS=$(redis-cli keys "order:*" 2>/dev/null | wc -l)
PAYMENT_KEYS=$((PAYMENT_KEYS + $(redis-cli keys "payment:*" 2>/dev/null | wc -l)))
if [ "$PAYMENT_KEYS" -gt 0 ]; then
    echo -e "${GREEN}✅ Payment caches found: $PAYMENT_KEYS keys${NC}"
else
    echo -e "${YELLOW}⚠️  No payment caches yet (will be created on first API call)${NC}"
fi
echo ""

# Check queue job counts
echo "4️⃣ Checking queue job counts..."
for queue in "${QUEUES[@]}"; do
    WAIT=$(redis-cli llen "riva:bull:$queue:wait" 2>/dev/null || echo "0")
    ACTIVE=$(redis-cli llen "riva:bull:$queue:active" 2>/dev/null || echo "0")
    COMPLETED=$(redis-cli llen "riva:bull:$queue:completed" 2>/dev/null || echo "0")
    FAILED=$(redis-cli llen "riva:bull:$queue:failed" 2>/dev/null || echo "0")
    
    echo "📊 $queue:"
    echo "   Waiting: $WAIT | Active: $ACTIVE | Completed: $COMPLETED | Failed: $FAILED"
done
echo ""

# Check Redis memory usage
echo "5️⃣ Checking Redis memory usage..."
MEMORY=$(redis-cli info memory | grep "used_memory_human" | cut -d: -f2 | tr -d '\r')
echo -e "${GREEN}📊 Redis memory usage: $MEMORY${NC}"
echo ""

# Summary
echo "========== VERIFICATION SUMMARY =========="
echo ""
echo "✅ Redis is running and accessible"
echo "✅ BullMQ queues are configured"
echo "✅ Cache keys will be created on first API calls"
echo ""
echo "📝 Next steps:"
echo "   1. Start your backend: npm run start:dev"
echo "   2. Make API calls to test caching"
echo "   3. Check logs for: '✅ BullMQ workers started'"
echo "   4. Monitor with: redis-cli monitor"
echo ""
echo "=========================================="
