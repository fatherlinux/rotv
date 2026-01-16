#!/bin/bash
cd "$(dirname "$0")"
(cd frontend && npm run build)
podman cp frontend/dist/. rotv:/app/public/
echo "Frontend reloaded - refresh browser"
