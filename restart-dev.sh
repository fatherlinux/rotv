#!/bin/bash
# Restart backend and frontend dev servers
# Usage: ./restart-dev.sh [backend|frontend|both]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

restart_backend() {
  echo "🔄 Restarting backend..."

  # Kill backend server
  pkill -f "node.*server.js" 2>/dev/null || true
  lsof -ti:3001 | xargs kill -9 2>/dev/null || true

  # Wait for port to be free
  sleep 1

  # Start backend in background
  cd "$SCRIPT_DIR/backend"
  npm run dev > /tmp/rotv-backend.log 2>&1 &

  # Wait for startup
  sleep 3

  # Check if it started
  if lsof -i:3001 > /dev/null 2>&1; then
    echo "✅ Backend started on port 3001"
    tail -5 /tmp/rotv-backend.log
  else
    echo "❌ Backend failed to start. Check /tmp/rotv-backend.log"
    exit 1
  fi
}

restart_frontend() {
  echo "🔄 Restarting frontend..."

  # Kill frontend (vite)
  pkill -f "vite" 2>/dev/null || true
  lsof -ti:8080 | xargs kill -9 2>/dev/null || true

  # Wait for port to be free
  sleep 1

  # Start frontend in background
  cd "$SCRIPT_DIR/frontend"
  npm run dev > /tmp/rotv-frontend.log 2>&1 &

  # Wait for startup
  sleep 3

  # Check if it started
  if lsof -i:8080 > /dev/null 2>&1; then
    echo "✅ Frontend started on port 8080"
  else
    echo "❌ Frontend failed to start. Check /tmp/rotv-frontend.log"
    exit 1
  fi
}

case "${1:-both}" in
  backend)
    restart_backend
    ;;
  frontend)
    restart_frontend
    ;;
  both)
    restart_backend
    restart_frontend
    ;;
  *)
    echo "Usage: $0 [backend|frontend|both]"
    exit 1
    ;;
esac

echo ""
echo "✨ Dev servers restarted!"
echo "   Backend:  http://localhost:3001"
echo "   Frontend: http://localhost:8080"
