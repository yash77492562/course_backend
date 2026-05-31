#!/bin/bash

echo "🛑 Killing all backend services..."

# Kill all ts-node processes related to backend
pkill -f "ts-node.*backend/src" || echo "No backend processes found"

# Kill specific ports if still in use
for port in 3002 3005 3006 3007 3008 3009 3010 3011 3012 3016 3017 3018 3019 3024 3025 3026 3027 3028 3029 3030 3031 3032 3033 3034 3035 3036 3037 3038; do
  lsof -ti:$port | xargs kill -9 2>/dev/null && echo "✅ Killed process on port $port" || true
done

echo "✅ All backend services stopped"
