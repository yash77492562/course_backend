#!/bin/bash

echo "🧪 Testing Redis Cache After Backend Restart"
echo "=============================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Check if Redis is running
echo "1️⃣ Checking Redis connection..."
if redis-cli PING > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Redis is running${NC}"
else
    echo -e "${RED}❌ Redis is not running${NC}"
    exit 1
fi

# Clear all existing cache
echo ""
echo "2️⃣ Clearing existing cache..."
redis-cli FLUSHDB > /dev/null
echo -e "${CYAN}🗑️  Cache cleared${NC}"

# Check keys before API call
echo ""
echo "3️⃣ Checking Redis keys BEFORE API call..."
KEYS_BEFORE=$(redis-cli KEYS 'courses:*')
if [ -z "$KEYS_BEFORE" ]; then
    echo -e "${YELLOW}📭 No course keys found (expected)${NC}"
else
    echo -e "${RED}⚠️  Found keys: $KEYS_BEFORE${NC}"
fi

# Make API request
echo ""
echo "4️⃣ Making API request to /courses/public..."
echo -e "${CYAN}📡 Calling: http://localhost:3002/courses/public${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:3002/courses/public)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ API call successful (HTTP $HTTP_CODE)${NC}"
    COURSE_COUNT=$(echo "$BODY" | grep -o '"id"' | wc -l)
    echo -e "${CYAN}📚 Received $COURSE_COUNT courses${NC}"
else
    echo -e "${RED}❌ API call failed (HTTP $HTTP_CODE)${NC}"
    echo "$BODY"
    exit 1
fi

# Wait a moment for cache to be written
echo ""
echo "5️⃣ Waiting 2 seconds for cache to be written..."
sleep 2

# Check keys after API call
echo ""
echo "6️⃣ Checking Redis keys AFTER API call..."
KEYS_AFTER=$(redis-cli KEYS 'courses:*')
if [ -z "$KEYS_AFTER" ]; then
    echo -e "${RED}❌ NO KEYS FOUND - Cache is NOT working!${NC}"
    echo ""
    echo "🔍 Debugging information:"
    echo "   - Backend logs should show cache operations"
    echo "   - Check if RedisService.set() is being called"
    echo "   - Verify Redis client is not NULL"
else
    echo -e "${GREEN}✅ Keys found in Redis:${NC}"
    echo "$KEYS_AFTER" | while read -r key; do
        echo -e "   ${CYAN}🔑 $key${NC}"
    done
fi

# Check specific key
echo ""
echo "7️⃣ Checking specific key: courses:published..."
EXISTS=$(redis-cli EXISTS "courses:published")
if [ "$EXISTS" = "1" ]; then
    echo -e "${GREEN}✅ Key 'courses:published' EXISTS in Redis${NC}"
    
    # Get value size
    VALUE=$(redis-cli GET "courses:published")
    SIZE=${#VALUE}
    echo -e "${CYAN}📦 Value size: $SIZE bytes${NC}"
    
    # Get TTL
    TTL=$(redis-cli TTL "courses:published")
    echo -e "${CYAN}⏱️  TTL: $TTL seconds${NC}"
    
    # Show first 200 characters
    echo ""
    echo "📄 First 200 characters of cached data:"
    echo "$VALUE" | cut -c1-200
    echo "..."
else
    echo -e "${RED}❌ Key 'courses:published' DOES NOT EXIST${NC}"
fi

# Make second request to test cache hit
echo ""
echo "8️⃣ Making SECOND API request (should be cache hit)..."
START_TIME=$(date +%s%N)
RESPONSE2=$(curl -s -w "\n%{http_code}" http://localhost:3002/courses/public)
END_TIME=$(date +%s%N)
HTTP_CODE2=$(echo "$RESPONSE2" | tail -n1)
DURATION=$(( (END_TIME - START_TIME) / 1000000 ))

if [ "$HTTP_CODE2" = "200" ]; then
    echo -e "${GREEN}✅ Second API call successful (HTTP $HTTP_CODE2)${NC}"
    echo -e "${CYAN}⚡ Response time: ${DURATION}ms${NC}"
else
    echo -e "${RED}❌ Second API call failed (HTTP $HTTP_CODE2)${NC}"
fi

# Summary
echo ""
echo "=============================================="
echo "📊 SUMMARY"
echo "=============================================="
if [ -z "$KEYS_AFTER" ]; then
    echo -e "${RED}❌ REDIS CACHING IS NOT WORKING${NC}"
    echo ""
    echo "Possible issues:"
    echo "  1. RedisService.client is NULL"
    echo "  2. set() method is not being called"
    echo "  3. Silent error in try-catch blocks"
    echo "  4. JSON.stringify failing"
    echo ""
    echo "Next steps:"
    echo "  - Check backend logs for Redis connection messages"
    echo "  - Look for 'CACHE SET SUCCESS' messages"
    echo "  - Verify 'Redis client status: ACTIVE' appears"
else
    echo -e "${GREEN}✅ REDIS CACHING IS WORKING${NC}"
    echo ""
    echo "Cache keys found: $(echo "$KEYS_AFTER" | wc -l)"
fi

echo ""
echo "🔍 To monitor Redis in real-time, run:"
echo "   redis-cli MONITOR"
echo ""
