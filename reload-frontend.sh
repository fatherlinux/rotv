#!/bin/bash
cd "$(dirname "$0")"
(cd frontend && npm run build)
# Clean old assets before copying new ones to avoid stale file issues
podman exec rotv rm -rf /app/public/assets/*
podman cp frontend/dist/. rotv:/app/public/
echo "Frontend reloaded - refresh browser"
