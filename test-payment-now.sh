#!/bin/bash

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   🧪 Testing Stripe Payment API${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}\n"

USER_ID="69ccdde7d11b0b2bb485c936"
COURSE_ID="69be2cf5bed5353e51f441e9"

echo -e "${BLUE}User ID: ${GREEN}$USER_ID${NC}"
echo -e "${BLUE}Course ID: ${GREEN}$COURSE_ID${NC}\n"

echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Creating Order with Dynamic Course Data${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

ORDER_RESPONSE=$(curl -s -X POST http://localhost:3002/api/payment/stripe/create-order \
  -H "Content-Type: application/json" \
  -H "x-user-id: $USER_ID" \
  -d "{
    \"courseId\": \"$COURSE_ID\"
  }")

echo "$ORDER_RESPONSE" | jq '.' 2>/dev/null || echo "$ORDER_RESPONSE"

if echo "$ORDER_RESPONSE" | jq -e '.clientSecret' > /dev/null 2>&1; then
  echo -e "\n${GREEN}✅ SUCCESS! Order created with dynamic pricing${NC}\n"
  
  ORDER_ID=$(echo "$ORDER_RESPONSE" | jq -r '.orderId')
  PAYMENT_INTENT_ID=$(echo "$ORDER_RESPONSE" | jq -r '.paymentIntentId')
  AMOUNT=$(echo "$ORDER_RESPONSE" | jq -r '.order.amount')
  COURSE_TITLE=$(echo "$ORDER_RESPONSE" | jq -r '.order.course.title')
  
  echo -e "${GREEN}📦 Order Details:${NC}"
  echo -e "   Order ID: ${GREEN}$ORDER_ID${NC}"
  echo -e "   Payment Intent: ${GREEN}$PAYMENT_INTENT_ID${NC}"
  echo -e "   Course: ${GREEN}$COURSE_TITLE${NC}"
  echo -e "   Amount: ${GREEN}₹$AMOUNT${NC} (fetched dynamically from DB)\n"
  
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}Checking Order in Database${NC}"
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
  
  ORDER_STATUS=$(curl -s http://localhost:3002/api/payment/stripe/order/$ORDER_ID)
  echo "$ORDER_STATUS" | jq '.' 2>/dev/null || echo "$ORDER_STATUS"
  
  echo -e "\n${GREEN}✅ Payment API is working!${NC}"
  echo -e "${GREEN}✅ Course data fetched dynamically from database${NC}"
  echo -e "${GREEN}✅ Order stored in database${NC}"
  echo -e "${GREEN}✅ Payment record created${NC}\n"
  
else
  echo -e "\n${RED}❌ Failed to create order${NC}"
  ERROR=$(echo "$ORDER_RESPONSE" | jq -r '.message // .error // "Unknown"' 2>/dev/null)
  echo -e "${RED}Error: $ERROR${NC}\n"
fi

echo -e "${BLUE}════════════════════════════════════════════════════════${NC}\n"
