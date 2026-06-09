#!/bin/bash

echo "🔍 Testing ACTUAL Webhook Secret Being Used"
echo "=============================================="
echo ""

# Read the exact line from .env
SECRET_LINE=$(grep "STRIPE_WEBHOOK_SECRET" /Users/yash/Desktop/udayBhaiya/Riva/backend/.env)
echo "Raw .env line:"
echo "$SECRET_LINE"
echo ""

# Extract the value after =
SECRET_VALUE=$(echo "$SECRET_LINE" | cut -d '=' -f2)
echo "Extracted value:"
echo "$SECRET_VALUE"
echo ""

# Check length
echo "Length: ${#SECRET_VALUE} characters"
echo ""

# Show hex dump to see hidden characters
echo "Hex dump (to see hidden chars):"
echo "$SECRET_VALUE" | hexdump -C | head -5
echo ""

# Test what Node.js will read
echo "What Node.js reads (using node):"
node -e "
require('dotenv').config({ path: '/Users/yash/Desktop/udayBhaiya/Riva/backend/.env' });
const secret = process.env.STRIPE_WEBHOOK_SECRET;
console.log('Value:', secret);
console.log('Length:', secret.length);
console.log('First char code:', secret.charCodeAt(0));
console.log('Last char code:', secret.charCodeAt(secret.length - 1));
"
