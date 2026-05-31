#!/bin/bash

# Test Redis Cache Hit/Miss
# This script tests the Redis caching by making multiple API calls

API_URL="http://localhost:3002/api"

echo "🧪 Testing Redis Cache Performance"
echo "=================================="
echo ""

# Test 1: Get all courses (first call - should be CACHE MISS)
echo "📋 Test 1: First call to /courses (expect CACHE MISS)"
echo "------------------------------------------------------"
curl -s "$API_URL/courses" > /dev/null
echo ""
sleep 1

# Test 2: Get all courses again (second call - should be CACHE HIT)
echo "📋 Test 2: Second call to /courses (expect CACHE HIT)"
echo "------------------------------------------------------"
curl -s "$API_URL/courses" > /dev/null
echo ""
sleep 1

# Test 3: Get all courses third time (should be CACHE HIT)
echo "📋 Test 3: Third call to /courses (expect CACHE HIT)"
echo "------------------------------------------------------"
curl -s "$API_URL/courses" > /dev/null
echo ""
sleep 1

# Test 4: Get specific course (first call - should be CACHE MISS)
echo "📋 Test 4: First call to /courses/:id (expect CACHE MISS)"
echo "------------------------------------------------------"
# Get the first course ID from the list
COURSE_ID=$(curl -s "$API_URL/courses" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$COURSE_ID" ]; then
  echo "Testing with course ID: $COURSE_ID"
  curl -s "$API_URL/courses/$COURSE_ID" > /dev/null
else
  echo "No courses found to test with"
fi
echo ""
sleep 1

# Test 5: Get same course again (should be CACHE HIT)
echo "📋 Test 5: Second call to /courses/:id (expect CACHE HIT)"
echo "------------------------------------------------------"
if [ -n "$COURSE_ID" ]; then
  curl -s "$API_URL/courses/$COURSE_ID" > /dev/null
else
  echo "No courses found to test with"
fi
echo ""
sleep 1

# Test 6: Get same course third time (should be CACHE HIT)
echo "📋 Test 6: Third call to /courses/:id (expect CACHE HIT)"
echo "------------------------------------------------------"
if [ -n "$COURSE_ID" ]; then
  curl -s "$API_URL/courses/$COURSE_ID" > /dev/null
else
  echo "No courses found to test with"
fi
echo ""

echo "=================================="
echo "✅ Test Complete!"
echo ""
echo "Check your backend console logs to see:"
echo "  - \x1b[32m✅ CACHE HIT\x1b[0m (green) - Data served from Redis"
echo "  - \x1b[33m❌ CACHE MISS\x1b[0m (yellow) - Data fetched from database"
echo "  - \x1b[35m📊 DATABASE QUERY\x1b[0m (magenta) - Database query time"
echo "  - \x1b[36m💾 CACHE SET\x1b[0m (cyan) - Data stored in Redis"
echo ""
echo "Expected pattern:"
echo "  1st call: CACHE MISS → DATABASE QUERY → CACHE SET"
echo "  2nd call: CACHE HIT (much faster!)"
echo "  3rd call: CACHE HIT (much faster!)"
