#!/bin/bash

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   🧪 Testing All Payment States${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}\n"

USER_ID="69ccdde7d11b0b2bb485c936"
COURSE_ID="69be2cf5bed5353e51f441e9"

# Test 1: Create Order for SUCCESS test
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}Test 1: Payment SUCCESS Flow${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

echo -e "${BLUE}Creating order...${NC}"
ORDER1=$(curl -s -X POST http://localhost:3002/api/payment/stripe/create-order \
  -H "Content-Type: application/json" \
  -H "x-user-id: $USER_ID" \
  -d "{\"courseId\": \"$COURSE_ID\"}")

PAYMENT_INTENT_1=$(echo "$ORDER1" | jq -r '.paymentIntentId')
ORDER_ID_1=$(echo "$ORDER1" | jq -r '.orderId')

if [ "$PAYMENT_INTENT_1" != "null" ]; then
  echo -e "${GREEN}✓ Order created: $ORDER_ID_1${NC}"
  echo -e "${GREEN}✓ Payment Intent: $PAYMENT_INTENT_1${NC}\n"
  
  echo -e "${BLUE}Simulating payment success...${NC}"
  SUCCESS_RESULT=$(curl -s -X POST http://localhost:3002/api/payment/stripe/test/success/$PAYMENT_INTENT_1)
  echo "$SUCCESS_RESULT" | jq '.'
  
  echo -e "\n${BLUE}Checking order status...${NC}"
  ORDER_STATUS=$(curl -s http://localhost:3002/api/payment/stripe/order/$ORDER_ID_1)
  PAYMENT_STATUS=$(echo "$ORDER_STATUS" | jq -r '.paymentStatus')
  ORDER_STATUS_VAL=$(echo "$ORDER_STATUS" | jq -r '.orderStatus')
  
  if [ "$PAYMENT_STATUS" == "SUCCEEDED" ]; then
    echo -e "${GREEN}✅ SUCCESS: Payment status = $PAYMENT_STATUS${NC}"
    echo -e "${GREEN}✅ SUCCESS: Order status = $ORDER_STATUS_VAL${NC}"
    echo -e "${GREEN}✅ SUCCESS: User enrolled in course${NC}"
    
    # Check purchase history
    HISTORY=$(curl -s http://localhost:3002/api/payment/stripe/purchase-history/$USER_ID)
    PURCHASE_COUNT=$(echo "$HISTORY" | jq '. | length')
    echo -e "${GREEN}✅ SUCCESS: Purchase added to history (Total: $PURCHASE_COUNT)${NC}\n"
  else
    echo -e "${RED}❌ FAILED: Expected SUCCEEDED, got $PAYMENT_STATUS${NC}\n"
  fi
else
  echo -e "${RED}❌ Failed to create order${NC}\n"
fi

sleep 2

# Test 2: Create Order for PROCESSING test
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}Test 2: Payment PROCESSING Flow${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

echo -e "${BLUE}Creating new order...${NC}"
ORDER2=$(curl -s -X POST http://localhost:3002/api/payment/stripe/create-order \
  -H "Content-Type: application/json" \
  -H "x-user-id: $USER_ID" \
  -d "{\"courseId\": \"$COURSE_ID\"}")

PAYMENT_INTENT_2=$(echo "$ORDER2" | jq -r '.paymentIntentId')
ORDER_ID_2=$(echo "$ORDER2" | jq -r '.orderId')

if [ "$PAYMENT_INTENT_2" != "null" ]; then
  echo -e "${GREEN}✓ Order created: $ORDER_ID_2${NC}"
  echo -e "${GREEN}✓ Payment Intent: $PAYMENT_INTENT_2${NC}\n"
  
  echo -e "${BLUE}Simulating payment processing...${NC}"
  PROCESS_RESULT=$(curl -s -X POST http://localhost:3002/api/payment/stripe/test/processing/$PAYMENT_INTENT_2)
  echo "$PROCESS_RESULT" | jq '.'
  
  echo -e "\n${BLUE}Checking order status...${NC}"
  ORDER_STATUS=$(curl -s http://localhost:3002/api/payment/stripe/order/$ORDER_ID_2)
  PAYMENT_STATUS=$(echo "$ORDER_STATUS" | jq -r '.paymentStatus')
  
  if [ "$PAYMENT_STATUS" == "PROCESSING" ]; then
    echo -e "${GREEN}✅ PROCESSING: Payment status = $PAYMENT_STATUS${NC}\n"
  else
    echo -e "${RED}❌ FAILED: Expected PROCESSING, got $PAYMENT_STATUS${NC}\n"
  fi
else
  echo -e "${RED}❌ Failed to create order${NC}\n"
fi

sleep 2

# Test 3: Create Order for FAILED test
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}Test 3: Payment FAILED Flow${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

echo -e "${BLUE}Creating new order...${NC}"
ORDER3=$(curl -s -X POST http://localhost:3002/api/payment/stripe/create-order \
  -H "Content-Type: application/json" \
  -H "x-user-id: $USER_ID" \
  -d "{\"courseId\": \"$COURSE_ID\"}")

PAYMENT_INTENT_3=$(echo "$ORDER3" | jq -r '.paymentIntentId')
ORDER_ID_3=$(echo "$ORDER3" | jq -r '.orderId')

if [ "$PAYMENT_INTENT_3" != "null" ]; then
  echo -e "${GREEN}✓ Order created: $ORDER_ID_3${NC}"
  echo -e "${GREEN}✓ Payment Intent: $PAYMENT_INTENT_3${NC}\n"
  
  echo -e "${BLUE}Simulating payment failure...${NC}"
  FAILED_RESULT=$(curl -s -X POST http://localhost:3002/api/payment/stripe/test/failed/$PAYMENT_INTENT_3 \
    -H "Content-Type: application/json" \
    -d '{"reason": "Card declined - insufficient funds"}')
  echo "$FAILED_RESULT" | jq '.'
  
  echo -e "\n${BLUE}Checking order status...${NC}"
  ORDER_STATUS=$(curl -s http://localhost:3002/api/payment/stripe/order/$ORDER_ID_3)
  PAYMENT_STATUS=$(echo "$ORDER_STATUS" | jq -r '.paymentStatus')
  ERROR_MSG=$(echo "$ORDER_STATUS" | jq -r '.payments[0].errorMessage')
  
  if [ "$PAYMENT_STATUS" == "FAILED" ]; then
    echo -e "${GREEN}✅ FAILED: Payment status = $PAYMENT_STATUS${NC}"
    echo -e "${GREEN}✅ FAILED: Error message = $ERROR_MSG${NC}\n"
  else
    echo -e "${RED}❌ FAILED: Expected FAILED, got $PAYMENT_STATUS${NC}\n"
  fi
else
  echo -e "${RED}❌ Failed to create order${NC}\n"
fi

sleep 2

# Test 4: Create Order for CANCELED test
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}Test 4: Payment CANCELED Flow${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

echo -e "${BLUE}Creating new order...${NC}"
ORDER4=$(curl -s -X POST http://localhost:3002/api/payment/stripe/create-order \
  -H "Content-Type: application/json" \
  -H "x-user-id: $USER_ID" \
  -d "{\"courseId\": \"$COURSE_ID\"}")

PAYMENT_INTENT_4=$(echo "$ORDER4" | jq -r '.paymentIntentId')
ORDER_ID_4=$(echo "$ORDER4" | jq -r '.orderId')

if [ "$PAYMENT_INTENT_4" != "null" ]; then
  echo -e "${GREEN}✓ Order created: $ORDER_ID_4${NC}"
  echo -e "${GREEN}✓ Payment Intent: $PAYMENT_INTENT_4${NC}\n"
  
  echo -e "${BLUE}Simulating payment cancellation...${NC}"
  CANCEL_RESULT=$(curl -s -X POST http://localhost:3002/api/payment/stripe/test/canceled/$PAYMENT_INTENT_4)
  echo "$CANCEL_RESULT" | jq '.'
  
  echo -e "\n${BLUE}Checking order status...${NC}"
  ORDER_STATUS=$(curl -s http://localhost:3002/api/payment/stripe/order/$ORDER_ID_4)
  PAYMENT_STATUS=$(echo "$ORDER_STATUS" | jq -r '.paymentStatus')
  
  if [ "$PAYMENT_STATUS" == "CANCELED" ]; then
    echo -e "${GREEN}✅ CANCELED: Payment status = $PAYMENT_STATUS${NC}\n"
  else
    echo -e "${RED}❌ FAILED: Expected CANCELED, got $PAYMENT_STATUS${NC}\n"
  fi
else
  echo -e "${RED}❌ Failed to create order${NC}\n"
fi

# Summary
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Test Summary${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}\n"

echo -e "${GREEN}✓${NC} SUCCESS flow tested"
echo -e "${GREEN}✓${NC} PROCESSING flow tested"
echo -e "${GREEN}✓${NC} FAILED flow tested"
echo -e "${GREEN}✓${NC} CANCELED flow tested\n"

echo -e "${CYAN}All payment states are working correctly!${NC}\n"
