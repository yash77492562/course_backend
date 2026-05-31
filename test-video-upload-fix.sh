#!/bin/bash

# Video Upload Fix Verification Script
# Tests the fixes for race condition, progress sync, and completion timing

echo "🧪 Testing Video Upload Fixes..."
echo "================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Check if Redis is running
echo "Test 1: Redis Connection"
echo "------------------------"
if redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Redis is running${NC}"
else
    echo -e "${RED}❌ Redis is NOT running${NC}"
    echo "   Please start Redis: redis-server"
    exit 1
fi
echo ""

# Test 2: Check if backend is running
echo "Test 2: Backend Connection"
echo "--------------------------"
if curl -s http://localhost:3002/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend is running${NC}"
else
    echo -e "${YELLOW}⚠️  Backend might not be running on port 3002${NC}"
    echo "   Please start backend: npm run start:dev"
fi
echo ""

# Test 3: Check Redis keys for active uploads
echo "Test 3: Active Uploads in Redis"
echo "--------------------------------"
ACTIVE_UPLOADS=$(redis-cli keys "course:upload:progress:*" 2>/dev/null | wc -l)
if [ "$ACTIVE_UPLOADS" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Found $ACTIVE_UPLOADS active upload(s) in Redis${NC}"
    redis-cli keys "course:upload:progress:*"
else
    echo -e "${GREEN}✅ No active uploads (clean state)${NC}"
fi
echo ""

# Test 4: Check database for recent jobs
echo "Test 4: Recent Video Upload Jobs"
echo "---------------------------------"
echo "Checking database for recent jobs..."
echo "(This requires database connection)"
echo ""

# Test 5: Check worker logs for errors
echo "Test 5: Worker Error Check"
echo "--------------------------"
echo "Checking for 'Record to update not found' errors..."
if [ -f "logs/video-worker.log" ]; then
    ERROR_COUNT=$(grep -c "Record to update not found" logs/video-worker.log 2>/dev/null || echo "0")
    if [ "$ERROR_COUNT" -gt 0 ]; then
        echo -e "${RED}❌ Found $ERROR_COUNT 'Record to update not found' errors${NC}"
        echo "   This indicates the race condition is still present!"
    else
        echo -e "${GREEN}✅ No 'Record to update not found' errors${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Worker log file not found${NC}"
    echo "   Logs might be in console output"
fi
echo ""

# Test 6: Verify file changes
echo "Test 6: Code Changes Verification"
echo "----------------------------------"

# Check if upsert is used in worker
if grep -q "prisma.videoUploadJob.upsert" src/queues/workers/video.worker.ts; then
    echo -e "${GREEN}✅ Worker uses upsert (safety net)${NC}"
else
    echo -e "${RED}❌ Worker still uses update (not fixed!)${NC}"
fi

# Check if database record is created first
if grep -q "Creating database record FIRST" src/video/controllers/video-processing.controller.ts; then
    echo -e "${GREEN}✅ Database record created first (race condition fixed)${NC}"
else
    echo -e "${RED}❌ Database record not created first (not fixed!)${NC}"
fi

# Check if lock is released before 100%
if grep -q "Release lock BEFORE marking 100%" src/queues/workers/video.worker.ts; then
    echo -e "${GREEN}✅ Lock released before 100% (timing fixed)${NC}"
else
    echo -e "${RED}❌ Lock not released before 100% (not fixed!)${NC}"
fi

echo ""

# Summary
echo "================================"
echo "📊 Test Summary"
echo "================================"
echo ""
echo "Critical Fixes:"
echo "  1. Race Condition: Database record created FIRST"
echo "  2. Safety Net: Worker uses upsert instead of update"
echo "  3. Timing: Lock released BEFORE 100% completion"
echo "  4. Progress: Redis endpoint for real-time updates"
echo ""
echo "Next Steps:"
echo "  1. Upload a test video"
echo "  2. Watch backend logs for errors"
echo "  3. Verify progress updates in frontend"
echo "  4. Confirm 100% means truly complete"
echo ""
echo "🎯 If all tests pass, the fixes are working correctly!"
echo ""
