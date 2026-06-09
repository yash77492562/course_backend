#!/bin/bash

# Test Webhook Signature Script
# This will help us verify if webhook secret is correct

echo "🔍 Testing Stripe Webhook Signature"
echo "======================================"
echo ""

# Read current webhook secret from .env
WEBHOOK_SECRET=$(grep "STRIPE_WEBHOOK_SECRET" /Users/yash/Desktop/udayBhaiya/Riva/backend/.env | cut -d '=' -f2)
echo "Current webhook secret: $WEBHOOK_SECRET"
echo "Length: ${#WEBHOOK_SECRET}"
echo ""

echo "❌ PROBLEM: Your current webhook secret is for the WRONG endpoint!"
echo ""
echo "✅ SOLUTION: Forward webhooks using Stripe CLI"
echo ""
echo "📋 Step 1: Install Stripe CLI (if not installed)"
echo "   brew install stripe/stripe-cli/stripe"
echo ""
echo "📋 Step 2: Login to Stripe"
echo "   stripe login"
echo ""
echo "📋 Step 3: Forward webhooks to your local server"
echo "   stripe listen --forward-to http://localhost:3002/payment/stripe/webhook"
echo ""
echo "   This will give you a NEW webhook secret starting with 'whsec_'"
echo "   Copy that secret and update backend/.env"
echo ""
echo "📋 Step 4: In another terminal, trigger a test webhook"
echo "   stripe trigger checkout.session.completed"
echo ""
echo "======================================"
