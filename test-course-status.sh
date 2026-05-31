#!/bin/bash

# Test Course Status (DRAFT vs PUBLISHED)
# This script tests that DRAFT courses are not visible to users

API_BASE="http://localhost:3002"

echo "========================================="
echo "Testing Course Status Functionality"
echo "========================================="
echo ""

echo "1. Get ALL courses (Admin endpoint)"
echo "   Should show DRAFT + PUBLISHED courses"
echo "---"
curl -s "$API_BASE/api/courses" | jq '.data[] | {id, title, status}' | head -20
echo ""

echo "========================================="
echo "2. Get PUBLISHED courses (Frontend endpoint)"
echo "   Should show ONLY PUBLISHED courses"
echo "---"
curl -s "$API_BASE/api/courses/published" | jq '.data[] | {id, title, status}' | head -20
echo ""

echo "========================================="
echo "3. Count courses by status"
echo "---"
ALL_COUNT=$(curl -s "$API_BASE/api/courses" | jq '.data | length')
PUBLISHED_COUNT=$(curl -s "$API_BASE/api/courses/published" | jq '.data | length')

echo "Total courses (Admin): $ALL_COUNT"
echo "Published courses (Frontend): $PUBLISHED_COUNT"
echo "Draft courses: $((ALL_COUNT - PUBLISHED_COUNT))"
echo ""

echo "========================================="
echo "✅ Test Complete!"
echo ""
echo "Expected behavior:"
echo "- Admin endpoint shows ALL courses"
echo "- Frontend endpoint shows ONLY published"
echo "- Draft courses are hidden from users"
echo "========================================="
