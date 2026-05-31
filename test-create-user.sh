#!/bin/bash

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧪 Creating Test User${NC}\n"

# Create a test user
echo -e "${BLUE}Creating user...${NC}"
RESPONSE=$(curl -s -X POST http://localhost:3002/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "password": "Test@123456",
    "firstName": "Test",
    "lastName": "User",
    "phone": "1234567890"
  }')

echo "Response:"
echo "$RESPONSE" | jq '.'

# Extract user ID
USER_ID=$(echo "$RESPONSE" | jq -r '.user.id // .id // empty')

if [ -z "$USER_ID" ]; then
  echo -e "\n${RED}❌ Failed to create user or user already exists${NC}"
  echo "Try logging in to get user ID..."
  
  LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3002/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{
      "email": "testuser@example.com",
      "password": "Test@123456"
    }')
  
  echo "Login Response:"
  echo "$LOGIN_RESPONSE" | jq '.'
  
  USER_ID=$(echo "$LOGIN_RESPONSE" | jq -r '.user.id // .id // empty')
fi

if [ -n "$USER_ID" ]; then
  echo -e "\n${GREEN}✅ User ID: $USER_ID${NC}"
  echo "Save this ID for testing payment API"
else
  echo -e "\n${RED}❌ Could not get user ID${NC}"
fi
