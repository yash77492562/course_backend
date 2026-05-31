#!/bin/bash

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         RIVA BACKEND - MICROSERVICES PORT MAP                  ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "🌐 API GATEWAY"
echo "   Port 3002 → Gateway (Routes all requests)"
echo "   URL: http://localhost:3002/api"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📚 COURSE SERVICES"
echo "   Port 3003 → Course Management Service"
echo "   URL: http://localhost:3003"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "👥 USER SERVICES"
echo "   Port 3005 → User Register Service (POST /register)"
echo "   Port 3006 → User Login Service (POST /login)"
echo "   Port 3007 → User Details Service (GET /users/:id)"
echo "   Port 3008 → User Refresh Token Service (POST /refresh)"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 SERVICE STATUS"
echo ""

check_port() {
  port=$1
  name=$2
  if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "   ✅ Port $port - $name (RUNNING)"
  else
    echo "   ❌ Port $port - $name (NOT RUNNING)"
  fi
}

check_port 3002 "Gateway"
check_port 3003 "Course Management"
check_port 3005 "User Register"
check_port 3006 "User Login"
check_port 3007 "User Details"
check_port 3008 "User Refresh Token"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🔍 QUICK HEALTH CHECK"
echo ""

health_check() {
  port=$1
  name=$2
  if curl -s http://localhost:$port/health > /dev/null 2>&1; then
    echo "   ✅ $name - Healthy"
  else
    echo "   ⚠️  $name - No health endpoint or not responding"
  fi
}

health_check 3002 "Gateway"
health_check 3003 "Course Management"
health_check 3005 "User Register"
health_check 3006 "User Login"
health_check 3007 "User Details"
health_check 3008 "User Refresh Token"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 USAGE"
echo "   All requests go through Gateway: http://localhost:3002/api"
echo ""
echo "   Examples:"
echo "   • POST http://localhost:3002/api/auth/register"
echo "   • POST http://localhost:3002/api/auth/login"
echo "   • GET  http://localhost:3002/api/courses"
echo "   • GET  http://localhost:3002/api/users/:id"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
