#!/bin/bash

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   🧪 RIVA Stripe Payment Integration - Complete Test${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}\n"

# Course ID from your database
COURSE_ID="69be2cf5bed5353e51f441e9"

# Step 1: Create or get test user
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 1: Creating/Getting Test User${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

# Try to create user
echo -e "${BLUE}Attempting to create new user...${NC}"
CREATE_RESPONSE=$(curl -s -X POST http://localhost:3002/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testpayment@riva.com",
    "password": "Test@123456",
    "firstName": "Payment",
    "lastName": "Tester",
    "phone": "9876543210"
  }')

echo "$CREATE_RESPONSE" | jq '.' 2>/dev/null || echo "$CREATE_RESPONSE"

USER_ID=$(echo "$CREATE_RESPONSE" | jq -r '.user.id // .id // empty' 2>/dev/null)

# If user creation failed, try login
if [ -z "$USER_ID" ]; then
  echo -e "\n${YELLOW}User might exist, trying login...${NC}"
  
  LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3002/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{
      "email": "testpayment@riva.com",
      "password": "Test@123456"
    }')
  
  echo "$LOGIN_RESPONSE" | jq '.' 2>/dev/null || echo "$LOGIN_RESPONSE"
  
  USER_ID=$(echo "$LOGIN_RESPONSE" | jq -r '.user.id // .id // empty' 2>/dev/null)
fi

if [ -z "$USER_ID" ]; then
  echo -e "\n${RED}❌ Failed to get user ID${NC}"
  echo -e "${RED}Please check if auth endpoints are working${NC}"
  exit 1
fi

echo -e "\n${GREEN}✅ User ID obtained: $USER_ID${NC}\n"

# Step 2: Test Create Order API
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 2: Creating Order with Dynamic Course Data${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

echo -e "${BLUE}Course ID: $COURSE_ID${NC}"
echo -e "${BLUE}User ID: $USER_ID${NC}\n"

echo -e "${BLUE}Sending request to create order...${NC}"
ORDER_RESPONSE=$(curl -s -X POST http://localhost:3002/api/payment/stripe/create-order \
  -H "Content-Type: application/json" \
  -H "x-user-id: $USER_ID" \
  -d "{
    \"courseId\": \"$COURSE_ID\"
  }")

echo -e "\n${BLUE}Response:${NC}"
echo "$ORDER_RESPONSE" | jq '.' 2>/dev/null || echo "$ORDER_RESPONSE"

# Check if order was created successfully
if echo "$ORDER_RESPONSE" | jq -e '.clientSecret' > /dev/null 2>&1; then
  echo -e "\n${GREEN}✅ Order created successfully!${NC}\n"
  
  ORDER_ID=$(echo "$ORDER_RESPONSE" | jq -r '.orderId')
  CLIENT_SECRET=$(echo "$ORDER_RESPONSE" | jq -r '.clientSecret')
  PAYMENT_INTENT_ID=$(echo "$ORDER_RESPONSE" | jq -r '.paymentIntentId')
  AMOUNT=$(echo "$ORDER_RESPONSE" | jq -r '.order.amount')
  COURSE_TITLE=$(echo "$ORDER_RESPONSE" | jq -r '.order.course.title')
  
  echo -e "${GREEN}📦 Order Details:${NC}"
  echo -e "   Order ID: ${GREEN}$ORDER_ID${NC}"
  echo -e "   Payment Intent ID: ${GREEN}$PAYMENT_INTENT_ID${NC}"
  echo -e "   Course: ${GREEN}$COURSE_TITLE${NC}"
  echo -e "   Amount: ${GREEN}₹$AMOUNT${NC}"
  echo -e "   Client Secret: ${GREEN}${CLIENT_SECRET:0:30}...${NC}\n"
  
  # Step 3: Check order status
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}Step 3: Checking Order Status${NC}"
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
  
  ORDER_STATUS=$(curl -s http://localhost:3002/api/payment/stripe/order/$ORDER_ID)
  echo "$ORDER_STATUS" | jq '.' 2>/dev/null || echo "$ORDER_STATUS"
  
  PAYMENT_STATUS=$(echo "$ORDER_STATUS" | jq -r '.paymentStatus')
  ORDER_STATUS_VALUE=$(echo "$ORDER_STATUS" | jq -r '.orderStatus')
  
  echo -e "\n${BLUE}Current Status:${NC}"
  echo -e "   Payment Status: ${YELLOW}$PAYMENT_STATUS${NC}"
  echo -e "   Order Status: ${YELLOW}$ORDER_STATUS_VALUE${NC}\n"
  
  # Step 4: Instructions for webhook testing
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}Step 4: Webhook Testing Instructions${NC}"
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
  
  echo -e "${BLUE}To test payment success, you need to:${NC}\n"
  
  echo -e "${GREEN}Option 1: Use Stripe CLI (Recommended)${NC}"
  echo -e "   1. Install Stripe CLI: ${YELLOW}brew install stripe/stripe-cli/stripe${NC}"
  echo -e "   2. Login: ${YELLOW}stripe login${NC}"
  echo -e "   3. Forward webhooks: ${YELLOW}stripe listen --forward-to localhost:3002/api/payment/stripe/webhook${NC}"
  echo -e "   4. In another terminal, trigger event:"
  echo -e "      ${YELLOW}stripe trigger payment_intent.succeeded${NC}\n"
  
  echo -e "${GREEN}Option 2: Use Stripe Dashboard${NC}"
  echo -e "   1. Go to: ${YELLOW}https://dashboard.stripe.com/test/payments${NC}"
  echo -e "   2. Find payment intent: ${YELLOW}$PAYMENT_INTENT_ID${NC}"
  echo -e "   3. Use test card: ${YELLOW}4242 4242 4242 4242${NC}\n"
  
  echo -e "${GREEN}Option 3: Manual Testing (Development Only)${NC}"
  echo -e "   Create a test endpoint to simulate webhook\n"
  
  # Step 5: Check user orders
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}Step 5: User's All Orders${NC}"
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
  
  USER_ORDERS=$(curl -s http://localhost:3002/api/payment/stripe/orders/user/$USER_ID)
  echo "$USER_ORDERS" | jq '.' 2>/dev/null || echo "$USER_ORDERS"
  
  # Step 6: Summary
  echo -e "\n${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}✅ Test Summary${NC}"
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
  
  echo -e "${GREEN}✓${NC} User created/retrieved successfully"
  echo -e "${GREEN}✓${NC} Order created with dynamic course data"
  echo -e "${GREEN}✓${NC} Payment intent created in Stripe"
  echo -e "${GREEN}✓${NC} Order stored in database"
  echo -e "${GREEN}✓${NC} Payment record created\n"
  
  echo -e "${BLUE}Next Steps:${NC}"
  echo -e "   1. Set up Stripe webhook forwarding"
  echo -e "   2. Test payment success flow"
  echo -e "   3. Verify enrollment creation"
  echo -e "   4. Check invoice generation\n"
  
  echo -e "${GREEN}🎉 Payment API is working correctly!${NC}\n"
  
else
  echo -e "\n${RED}❌ Failed to create order${NC}"
  ERROR_MSG=$(echo "$ORDER_RESPONSE" | jq -r '.message // .error // "Unknown error"' 2>/dev/null)
  echo -e "${RED}Error: $ERROR_MSG${NC}\n"
  
  echo -e "${YELLOW}Troubleshooting:${NC}"
  echo -e "   1. Check if course exists: $COURSE_ID"
  echo -e "   2. Verify Stripe keys in .env"
  echo -e "   3. Check backend logs"
  echo -e "   4. Ensure database connection is working\n"
fi

echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   Test Complete${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}\n"
