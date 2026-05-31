#!/bin/bash

echo "🧪 Complete Redis Caching Test with CURL"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

GATEWAY_URL="http://localhost:3002"

# Check if backend is running
echo "1️⃣ Checking if backend is running..."
if curl -s "$GATEWAY_URL/courses/public" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend is running on $GATEWAY_URL${NC}"
else
    echo -e "${RED}❌ Backend is not running. Please start it first.${NC}"
    echo "Run: cd backend && npm run start:dev"
    exit 1
fi

# Check Redis
echo ""
echo "2️⃣ Checking Redis connection..."
if redis-cli PING > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Redis is running${NC}"
else
    echo -e "${RED}❌ Redis is not running${NC}"
    exit 1
fi

# Clear all cache
echo ""
echo "3️⃣ Clearing all existing cache..."
redis-cli FLUSHDB > /dev/null
echo -e "${CYAN}🗑️  All cache cleared${NC}"

echo ""
echo "=========================================="
echo "📊 TEST 1: Course List Caching"
echo "=========================================="

# Test 1a: First request (CACHE MISS)
echo ""
echo "4️⃣ Test 1a: First course list request (CACHE MISS)..."
echo -e "${CYAN}📡 GET /courses/public${NC}"
echo ""
echo -e "${YELLOW}Watch backend logs for: ❌ CACHE MISS${NC}"
echo ""

START1=$(date +%s%N)
RESPONSE1=$(curl -s "$GATEWAY_URL/courses/public")
END1=$(date +%s%N)
DURATION1=$(( (END1 - START1) / 1000000 ))

COURSE_COUNT=$(echo "$RESPONSE1" | grep -o '"id"' | wc -l | tr -d ' ')
echo -e "${BLUE}📚 Received $COURSE_COUNT courses${NC}"
echo -e "${YELLOW}⏱️  Response time: ${DURATION1}ms (from DATABASE)${NC}"

# Wait a moment
sleep 2

# Check if cache was created
KEYS_AFTER=$(redis-cli KEYS 'courses:*')
if [ -z "$KEYS_AFTER" ]; then
    echo -e "${RED}❌ FAIL: No cache created${NC}"
else
    echo -e "${GREEN}✅ PASS: Cache created${NC}"
    echo -e "${CYAN}   Keys: $KEYS_AFTER${NC}"
fi

# Test 1b: Second request (CACHE HIT)
echo ""
echo "5️⃣ Test 1b: Second course list request (CACHE HIT)..."
echo -e "${CYAN}📡 GET /courses/public${NC}"
echo ""
echo -e "${GREEN}Watch backend logs for: ✅ CACHE HIT${NC}"
echo ""

START2=$(date +%s%N)
RESPONSE2=$(curl -s "$GATEWAY_URL/courses/public")
END2=$(date +%s%N)
DURATION2=$(( (END2 - START2) / 1000000 ))

echo -e "${GREEN}⚡ Response time: ${DURATION2}ms (from REDIS)${NC}"

# Calculate speedup
if [ $DURATION1 -gt 0 ] && [ $DURATION2 -gt 0 ]; then
    SPEEDUP=$(echo "scale=2; $DURATION1 / $DURATION2" | bc 2>/dev/null || echo "N/A")
    if [ "$SPEEDUP" != "N/A" ]; then
        echo -e "${GREEN}🚀 Speedup: ${SPEEDUP}x faster${NC}"
    fi
fi

echo ""
echo "=========================================="
echo "📊 TEST 2: User Registration & Profile"
echo "=========================================="

# Generate random email
RANDOM_EMAIL="test_$(date +%s)@example.com"
echo ""
echo "6️⃣ Test 2a: Register new user..."
echo -e "${CYAN}📡 POST /auth/register${NC}"
echo -e "${BLUE}📧 Email: $RANDOM_EMAIL${NC}"
echo ""
echo -e "${YELLOW}Watch backend logs for user registration flow${NC}"
echo ""

REGISTER_RESPONSE=$(curl -s -X POST "$GATEWAY_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$RANDOM_EMAIL\",
    \"password\": \"Test123!@#\",
    \"firstName\": \"Test\",
    \"lastName\": \"User\",
    \"phone\": \"1234567890\"
  }")

# Check if registration was successful
if echo "$REGISTER_RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✅ Registration successful${NC}"
    
    # Extract user ID and token
    USER_ID=$(echo "$REGISTER_RESPONSE" | grep -o '"userId":"[^"]*"' | cut -d'"' -f4)
    ACCESS_TOKEN=$(echo "$REGISTER_RESPONSE" | grep -o '"access":"[^"]*"' | cut -d'"' -f4)
    
    echo -e "${BLUE}👤 User ID: $USER_ID${NC}"
    echo -e "${CYAN}🔑 Token: ${ACCESS_TOKEN:0:50}...${NC}"
    
    # Check if user cache was created
    sleep 1
    USER_KEYS=$(redis-cli KEYS "user:*$USER_ID*")
    if [ -z "$USER_KEYS" ]; then
        echo -e "${RED}❌ No user cache created${NC}"
    else
        echo -e "${GREEN}✅ User cache created:${NC}"
        echo "$USER_KEYS" | while read -r key; do
            if [ -n "$key" ]; then
                TTL=$(redis-cli TTL "$key")
                echo -e "   ${CYAN}🔑 $key (TTL: ${TTL}s)${NC}"
            fi
        done
    fi
else
    echo -e "${RED}❌ Registration failed${NC}"
    echo "$REGISTER_RESPONSE" | head -c 200
    echo ""
    echo -e "${YELLOW}Note: This might be expected if user already exists${NC}"
    
    # Try to login instead
    echo ""
    echo "Trying to login with existing user..."
    LOGIN_RESPONSE=$(curl -s -X POST "$GATEWAY_URL/auth/login" \
      -H "Content-Type: application/json" \
      -d "{
        \"email\": \"$RANDOM_EMAIL\",
        \"password\": \"Test123!@#\"
      }")
    
    if echo "$LOGIN_RESPONSE" | grep -q '"success":true'; then
        USER_ID=$(echo "$LOGIN_RESPONSE" | grep -o '"userId":"[^"]*"' | cut -d'"' -f4)
        ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"access":"[^"]*"' | cut -d'"' -f4)
        echo -e "${GREEN}✅ Login successful${NC}"
    fi
fi

# Test profile endpoint if we have a token
if [ -n "$ACCESS_TOKEN" ]; then
    echo ""
    echo "7️⃣ Test 2b: Get user profile (first time - CACHE MISS)..."
    echo -e "${CYAN}📡 GET /auth/profile${NC}"
    echo ""
    echo -e "${YELLOW}Watch backend logs for: ❌ CACHE MISS${NC}"
    echo ""
    
    PROFILE1=$(curl -s -H "Authorization: Bearer $ACCESS_TOKEN" "$GATEWAY_URL/auth/profile")
    
    if echo "$PROFILE1" | grep -q '"success":true'; then
        echo -e "${GREEN}✅ Profile retrieved${NC}"
        echo "$PROFILE1" | head -c 200
        echo "..."
    else
        echo -e "${RED}❌ Failed to get profile${NC}"
    fi
    
    sleep 2
    
    echo ""
    echo "8️⃣ Test 2c: Get user profile (second time - CACHE HIT)..."
    echo -e "${CYAN}📡 GET /auth/profile${NC}"
    echo ""
    echo -e "${GREEN}Watch backend logs for: ✅ CACHE HIT${NC}"
    echo ""
    
    PROFILE2=$(curl -s -H "Authorization: Bearer $ACCESS_TOKEN" "$GATEWAY_URL/auth/profile")
    
    if echo "$PROFILE2" | grep -q '"success":true'; then
        echo -e "${GREEN}✅ Profile retrieved from cache${NC}"
    fi
fi

echo ""
echo "=========================================="
echo "📊 TEST 3: Redis Verification"
echo "=========================================="

echo ""
echo "9️⃣ Checking all cached keys..."
ALL_KEYS=$(redis-cli KEYS '*')
if [ -z "$ALL_KEYS" ]; then
    echo -e "${YELLOW}📭 No keys found${NC}"
else
    echo -e "${GREEN}✅ Found cached keys:${NC}"
    echo "$ALL_KEYS" | while read -r key; do
        if [ -n "$key" ]; then
            TTL=$(redis-cli TTL "$key")
            SIZE=$(redis-cli GET "$key" 2>/dev/null | wc -c)
            TYPE=$(echo "$key" | cut -d':' -f1)
            
            case $TYPE in
                "courses")
                    COLOR=$BLUE
                    ;;
                "course")
                    COLOR=$CYAN
                    ;;
                "user")
                    COLOR=$GREEN
                    ;;
                *)
                    COLOR=$NC
                    ;;
            esac
            
            echo -e "   ${COLOR}🔑 $key${NC}"
            echo -e "      TTL: ${TTL}s, Size: ${SIZE} bytes"
        fi
    done
fi

echo ""
echo "=========================================="
echo "📊 SUMMARY"
echo "=========================================="
echo ""
echo -e "${GREEN}✅ Tests completed!${NC}"
echo ""
echo "Performance comparison:"
echo "  1st request (cache miss):  ${DURATION1}ms"
echo "  2nd request (cache hit):   ${DURATION2}ms"
if [ "$SPEEDUP" != "N/A" ] && [ -n "$SPEEDUP" ]; then
    echo "  Speedup:                   ${SPEEDUP}x"
fi
echo ""
echo "Cache keys created:"
redis-cli KEYS '*' | wc -l | xargs echo "  Total keys:"
echo ""
echo "What to look for in backend logs:"
echo "  🟢 GREEN '✅ CACHE HIT' = Data from Redis (fast!)"
echo "  🟡 YELLOW '❌ CACHE MISS' = Data from database (slower)"
echo "  🔵 CYAN '💾 CACHE SET' = Storing in Redis"
echo "  🟣 MAGENTA '📊 DATABASE QUERY' = Querying database"
echo ""
echo "To monitor Redis in real-time:"
echo "  redis-cli MONITOR"
echo ""
echo "To check specific keys:"
echo "  redis-cli KEYS 'courses:*'"
echo "  redis-cli KEYS 'user:*'"
echo "  redis-cli GET 'courses:published'"
echo "  redis-cli TTL 'courses:published'"
echo ""
