#!/bin/bash
# Development mode - fast reload without container rebuild

cd "$(dirname "$0")"

# Stop existing container
podman stop rotv 2>/dev/null
podman rm rotv 2>/dev/null

# Build frontend
echo "Building frontend..."
(cd frontend && npm run build)

# Run container with volumes that allow easy updates
# The entrypoint copies node_modules, so we mount over /app after startup
echo "Starting container..."
podman run -d --name rotv \
  -p 8080:3001 \
  -v ~/.rotv/pgdata:/data/pgdata:Z \
  --env-file backend/.env \
  rotv:latest

# Wait for container to start
sleep 4

# Now copy our local code into the running container
echo "Syncing local code..."
podman cp backend/. rotv:/app/
podman cp frontend/dist/. rotv:/app/public/

# Restart node to pick up changes
podman exec rotv pkill -f 'node server.js' 2>/dev/null || true
sleep 2

echo ""
echo "Dev server running at http://localhost:8080"
echo ""
echo "Quick reload commands:"
echo "  Backend:  podman cp backend/. rotv:/app/ && podman exec rotv pkill -f 'node server.js'"
echo "  Frontend: (cd frontend && npm run build) && podman cp frontend/dist/. rotv:/app/public/"
