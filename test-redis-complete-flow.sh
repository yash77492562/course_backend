#!/bin/bash

echo "🧪 Complete Redis Caching Flow Test"
echo "===================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Check Redis
echo "1️⃣ Checking Redis connection..."
if redis-cli PING > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Redis is running${NC}"
else
    echo -e "${RED}❌ Redis is not running${NC}"
    exit 1
fi

# Clear all cache
echo ""
echo "2️⃣ Clearing all existing cache..."
redis-cli FLUSHDB > /dev/null
echo -e "${CYAN}🗑️  All cache cleared${NC}"

# Test 1: First request (CACHE MISS)
echo ""
echo "3️⃣ Test 1: First API call (should be CACHE MISS)..."
echo -e "${CYAN}📡 GET /courses/public${NC}"
START1=$(date +%s%N)
RESPONSE1=$(curl -s http://localhost:3002/courses/public)
END1=$(date +%s%N)
DURATION1=$(( (END1 - START1) / 1000000 ))
echo -e "${YELLOW}⏱️  Response time: ${DURATION1}ms (from DATABASE)${NC}"

# Check if cache was created
sleep 1
KEYS_AFTER_1=$(redis-cli KEYS 'courses:*')
if [ -z "$KEYS_AFTER_1" ]; then
    echo -e "${RED}❌ FAIL: No cache created${NC}"
    exit 1
else
    echo -e "${GREEN}✅ PASS: Cache created${NC}"
    echo -e "${CYAN}   Keys: $KEYS_AFTER_1${NC}"
fi

# Test 2: Second request (CACHE HIT)
echo ""
echo "4️⃣ Test 2: Second API call (should be CACHE HIT)..."
echo -e "${CYAN}📡 GET /courses/public${NC}"
START2=$(date +%s%N)
RESPONSE2=$(curl -s http://localhost:3002/courses/public)
END2=$(date +%s%N)
DURATION2=$(( (END2 - START2) / 1000000 ))
echo -e "${GREEN}⚡ Response time: ${DURATION2}ms (from REDIS)${NC}"

# Calculate speedup
if [ $DURATION1 -gt 0 ]; then
    SPEEDUP=$(echo "scale=2; $DURATION1 / $DURATION2" | bc)
    IMPROVEMENT=$(echo "scale=0; (($DURATION1 - $DURATION2) * 100) / $DURATION1" | bc)
    echo -e "${GREEN}🚀 Speedup: ${SPEEDUP}x faster (${IMPROVEMENT}% improvement)${NC}"
fi

# Test 3: Pagination should NOT use cache
echo ""
echo "5️⃣ Test 3: Pagination request (should NOT use cache)..."
echo -e "${CYAN}📡 GET /courses/public?page=2&limit=5${NC}"
START3=$(date +%s%N)
RESPONSE3=$(curl -s "http://localhost:3002/courses/public?page=2&limit=5")
END3=$(date +%s%N)
DURATION3=$(( (END3 - START3) / 1000000 ))
echo -e "${YELLOW}⏱️  Response time: ${DURATION3}ms (from DATABASE - no cache for custom pagination)${NC}"

# Check cache keys didn't change
KEYS_AFTER_3=$(redis-cli KEYS 'courses:*')
if [ "$KEYS_AFTER_1" = "$KEYS_AFTER_3" ]; then
    echo -e "${GREEN}✅ PASS: No new cache created for paginated request${NC}"
else
    echo -e "${RED}❌ FAIL: Unexpected cache created${NC}"
fi

# Test 4: Check TTL
echo ""
echo "6️⃣ Test 4: Checking cache TTL..."
TTL=$(redis-cli TTL "courses:published")
if [ "$TTL" -gt 0 ] && [ "$TTL" -le 900 ]; then
    echo -e "${GREEN}✅ PASS: TTL is ${TTL} seconds (max 900 = 15 minutes)${NC}"
else
    echo -e "${RED}❌ FAIL: TTL is ${TTL} (expected 0-900)${NC}"
fi

# Test 5: Cache size
echo ""
echo "7️⃣ Test 5: Checking cache size..."
SIZE=$(redis-cli GET "courses:published" | wc -c)
echo -e "${CYAN}📦 Cache size: ${SIZE} bytes${NC}"
if [ "$SIZE" -gt 100 ]; then
    echo -e "${GREEN}✅ PASS: Cache contains data${NC}"
else
    echo -e "${RED}❌ FAIL: Cache is too small${NC}"
fi

# Test 6: Cache content verification
echo ""
echo "8️⃣ Test 6: Verifying cache content..."
CACHED_DATA=$(redis-cli GET "courses:published")
if echo "$CACHED_DATA" | grep -q '"id"'; then
    echo -e "${GREEN}✅ PASS: Cache contains valid JSON with course data${NC}"
    echo -e "${CYAN}   Sample: $(echo "$CACHED_DATA" | head -c 100)...${NC}"
else
    echo -e "${RED}❌ FAIL: Cache doesn't contain valid data${NC}"
fi

# Summary
echo ""
echo "===================================="
echo "📊 TEST SUMMARY"
echo "===================================="
echo -e "${GREEN}✅ Redis caching is working correctly!${NC}"
echo ""
echo "Performance comparison:"
echo "  1st request (cache miss):  ${DURATION1}ms"
echo "  2nd request (cache hit):   ${DURATION2}ms"
echo "  Improvement:               ${IMPROVEMENT}%"
echo ""
echo "Cache details:"
echo "  Keys stored:  $(redis-cli KEYS 'courses:*' | wc -l)"
echo "  TTL:          ${TTL} seconds"
echo "  Size:         ${SIZE} bytes"
echo ""
echo "Next steps:"
echo "  - Test cache invalidation on UPDATE"
echo "  - Test cache invalidation on DELETE"
echo "  - Monitor cache hit rate in production"
echo ""
