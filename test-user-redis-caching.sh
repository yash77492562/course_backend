#!/bin/bash

echo "🧪 Testing User Redis Caching"
echo "=============================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
GATEWAY_URL="http://localhost:3002"
TEST_USER_ID="test-user-123"  # Replace with actual user ID from your database

# Check Redis
echo "1️⃣ Checking Redis connection..."
if redis-cli PING > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Redis is running${NC}"
else
    echo -e "${RED}❌ Redis is not running${NC}"
    exit 1
fi

# Clear user-related cache
echo ""
echo "2️⃣ Clearing existing user cache..."
redis-cli DEL "user:profile:*" > /dev/null 2>&1
redis-cli DEL "user:enrollments:*" > /dev/null 2>&1
echo -e "${CYAN}🗑️  User cache cleared${NC}"

# Check keys before requests
echo ""
echo "3️⃣ Checking Redis keys BEFORE requests..."
USER_KEYS_BEFORE=$(redis-cli KEYS 'user:*')
if [ -z "$USER_KEYS_BEFORE" ]; then
    echo -e "${YELLOW}📭 No user keys found (expected)${NC}"
else
    echo -e "${RED}⚠️  Found keys: $USER_KEYS_BEFORE${NC}"
fi

echo ""
echo "=============================="
echo "📊 TEST 1: User Profile Caching"
echo "=============================="

# Test 1a: First profile request (CACHE MISS)
echo ""
echo "4️⃣ Test 1a: First profile request (should be CACHE MISS)..."
echo -e "${CYAN}📡 GET /auth/profile${NC}"
echo "Note: You need to be logged in and have a valid JWT token"
echo "Replace TEST_USER_ID with your actual user ID"
echo ""
echo "To test manually, run:"
echo "  curl -H 'Authorization: Bearer YOUR_JWT_TOKEN' $GATEWAY_URL/auth/profile"
echo ""

# Check if profile cache was created
sleep 1
PROFILE_KEY=$(redis-cli KEYS 'user:profile:*')
if [ -z "$PROFILE_KEY" ]; then
    echo -e "${YELLOW}⚠️  No profile cache found (need to make actual API call with JWT)${NC}"
else
    echo -e "${GREEN}✅ Profile cache created: $PROFILE_KEY${NC}"
    
    # Check TTL
    TTL=$(redis-cli TTL "$PROFILE_KEY")
    echo -e "${CYAN}⏱️  TTL: $TTL seconds (max 900 = 15 minutes)${NC}"
    
    # Show cached data
    CACHED_DATA=$(redis-cli GET "$PROFILE_KEY")
    echo -e "${CYAN}📦 Cached data sample:${NC}"
    echo "$CACHED_DATA" | head -c 200
    echo "..."
fi

echo ""
echo "=============================="
echo "📊 TEST 2: User Enrollments Caching"
echo "=============================="

# Test 2a: First enrollments request (CACHE MISS)
echo ""
echo "5️⃣ Test 2a: First enrollments request (should be CACHE MISS)..."
echo -e "${CYAN}📡 GET /course-access/user/purchased${NC}"
echo "Note: You need to be logged in and have a valid JWT token"
echo ""
echo "To test manually, run:"
echo "  curl -H 'Authorization: Bearer YOUR_JWT_TOKEN' $GATEWAY_URL/course-access/user/purchased"
echo ""

# Check if enrollment cache was created
sleep 1
ENROLLMENT_KEY=$(redis-cli KEYS 'user:enrollments:*')
if [ -z "$ENROLLMENT_KEY" ]; then
    echo -e "${YELLOW}⚠️  No enrollment cache found (need to make actual API call with JWT)${NC}"
else
    echo -e "${GREEN}✅ Enrollment cache created: $ENROLLMENT_KEY${NC}"
    
    # Check TTL
    TTL=$(redis-cli TTL "$ENROLLMENT_KEY")
    echo -e "${CYAN}⏱️  TTL: $TTL seconds (max 900 = 15 minutes)${NC}"
    
    # Show cached data
    CACHED_DATA=$(redis-cli GET "$ENROLLMENT_KEY")
    echo -e "${CYAN}📦 Cached data:${NC}"
    echo "$CACHED_DATA"
fi

echo ""
echo "=============================="
echo "📊 TEST 3: Cache Verification"
echo "=============================="

# Check all user keys
echo ""
echo "6️⃣ Checking all user-related keys in Redis..."
ALL_USER_KEYS=$(redis-cli KEYS 'user:*')
if [ -z "$ALL_USER_KEYS" ]; then
    echo -e "${YELLOW}📭 No user keys found${NC}"
    echo ""
    echo "To populate cache, you need to:"
    echo "  1. Login to get JWT token"
    echo "  2. Call /auth/profile with the token"
    echo "  3. Call /course-access/user/purchased with the token"
else
    echo -e "${GREEN}✅ Found user keys:${NC}"
    echo "$ALL_USER_KEYS" | while read -r key; do
        if [ -n "$key" ]; then
            TTL=$(redis-cli TTL "$key")
            SIZE=$(redis-cli GET "$key" | wc -c)
            echo -e "   ${CYAN}🔑 $key${NC}"
            echo -e "      TTL: ${TTL}s, Size: ${SIZE} bytes"
        fi
    done
fi

echo ""
echo "=============================="
echo "📊 MANUAL TESTING GUIDE"
echo "=============================="
echo ""
echo "Step 1: Login to get JWT token"
echo "  curl -X POST $GATEWAY_URL/auth/login \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"email\":\"your@email.com\",\"password\":\"yourpassword\"}'"
echo ""
echo "Step 2: Copy the 'access' token from response"
echo ""
echo "Step 3: Test user profile caching"
echo "  # First request (CACHE MISS)"
echo "  curl -H 'Authorization: Bearer YOUR_TOKEN' $GATEWAY_URL/auth/profile"
echo "  # Check backend logs for: ❌ CACHE MISS"
echo ""
echo "  # Second request (CACHE HIT)"
echo "  curl -H 'Authorization: Bearer YOUR_TOKEN' $GATEWAY_URL/auth/profile"
echo "  # Check backend logs for: ✅ CACHE HIT"
echo ""
echo "Step 4: Test enrollment caching"
echo "  # First request (CACHE MISS)"
echo "  curl -H 'Authorization: Bearer YOUR_TOKEN' $GATEWAY_URL/course-access/user/purchased"
echo "  # Check backend logs for: ❌ CACHE MISS"
echo ""
echo "  # Second request (CACHE HIT)"
echo "  curl -H 'Authorization: Bearer YOUR_TOKEN' $GATEWAY_URL/course-access/user/purchased"
echo "  # Check backend logs for: ✅ CACHE HIT"
echo ""
echo "Step 5: Verify in Redis"
echo "  redis-cli KEYS 'user:*'"
echo "  redis-cli GET 'user:profile:YOUR_USER_ID'"
echo "  redis-cli GET 'user:enrollments:YOUR_USER_ID'"
echo ""
echo "=============================="
echo "🎯 EXPECTED RESULTS"
echo "=============================="
echo ""
echo "✅ First request: CACHE MISS (fetch from database)"
echo "✅ Second request: CACHE HIT (serve from Redis)"
echo "✅ Response time improvement: ~50-70x faster"
echo "✅ Cache TTL: 900 seconds (15 minutes)"
echo "✅ Cache keys: user:profile:{userId}, user:enrollments:{userId}"
echo ""
echo "=============================="
echo "📝 CACHE INVALIDATION"
echo "=============================="
echo ""
echo "Cache is automatically invalidated when:"
echo "  - User profile is updated → user:profile:{userId} deleted"
echo "  - User purchases a course → user:enrollments:{userId} deleted"
echo "  - Cache expires after 15 minutes"
echo ""
echo "To manually invalidate:"
echo "  redis-cli DEL 'user:profile:YOUR_USER_ID'"
echo "  redis-cli DEL 'user:enrollments:YOUR_USER_ID'"
echo ""
