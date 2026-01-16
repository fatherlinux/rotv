#!/bin/bash
cd "$(dirname "$0")"
podman cp backend/. rotv:/app/
podman exec rotv pkill -f 'node server.js' 2>/dev/null || true
sleep 1
echo "Backend reloaded - check http://localhost:8080"
