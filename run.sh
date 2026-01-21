#!/bin/bash
set -e

IMAGE_NAME="quay.io/fatherlinux/rotv"
CONTAINER_NAME="rotv"
DATA_DIR="${DATA_DIR:-$HOME/.rotv/pgdata}"

# Create data directory if it doesn't exist
mkdir -p "$DATA_DIR"

# Load environment variables from .env file if it exists
if [ -f ".env" ]; then
    export $(grep -v '^#' .env | xargs)
elif [ -f "backend/.env" ]; then
    export $(grep -v '^#' backend/.env | xargs)
fi

# Build environment variable arguments for podman
ENV_ARGS=""
[ -n "$GOOGLE_CLIENT_ID" ] && ENV_ARGS="$ENV_ARGS -e GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID"
[ -n "$GOOGLE_CLIENT_SECRET" ] && ENV_ARGS="$ENV_ARGS -e GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET"
[ -n "$SESSION_SECRET" ] && ENV_ARGS="$ENV_ARGS -e SESSION_SECRET=$SESSION_SECRET"
[ -n "$GEMINI_API_KEY" ] && ENV_ARGS="$ENV_ARGS -e GEMINI_API_KEY=$GEMINI_API_KEY"
[ -n "$GOOGLE_SHEETS_CREDENTIALS" ] && ENV_ARGS="$ENV_ARGS -e GOOGLE_SHEETS_CREDENTIALS=$GOOGLE_SHEETS_CREDENTIALS"
[ -n "$FACEBOOK_APP_ID" ] && ENV_ARGS="$ENV_ARGS -e FACEBOOK_APP_ID=$FACEBOOK_APP_ID"
[ -n "$FACEBOOK_APP_SECRET" ] && ENV_ARGS="$ENV_ARGS -e FACEBOOK_APP_SECRET=$FACEBOOK_APP_SECRET"
[ -n "$ADMIN_EMAIL" ] && ENV_ARGS="$ENV_ARGS -e ADMIN_EMAIL=$ADMIN_EMAIL"

case "${1:-help}" in
    build)
        echo "Building container image..."
        podman build --security-opt label=disable -t "$IMAGE_NAME" .
        ;;

    start)
        echo "Starting Roots of The Valley..."
        echo "PostgreSQL data will be stored in: $DATA_DIR"

        # Stop existing container if running
        podman stop "$CONTAINER_NAME" 2>/dev/null || true
        podman rm "$CONTAINER_NAME" 2>/dev/null || true

        # Set up permissions if directory is empty or newly created
        if [ ! -f "$DATA_DIR/PG_VERSION" ]; then
            echo "Setting up data directory permissions..."
            podman unshare chown 1000:1000 "$DATA_DIR" 2>/dev/null || true
            podman unshare chmod 700 "$DATA_DIR" 2>/dev/null || true
        fi

        podman run -d \
            --name "$CONTAINER_NAME" \
            --privileged \
            -p 8080:8080 \
            -v "$DATA_DIR:/data/pgdata:Z" \
            $ENV_ARGS \
            "$IMAGE_NAME"

        echo "Application starting at http://localhost:8080"
        echo "Waiting for PostgreSQL to be ready..."
        sleep 5
        echo "✓ Container started successfully"
        echo ""
        echo "Useful commands:"
        echo "  ./run.sh logs   - View logs"
        echo "  ./run.sh stop   - Stop container"
        ;;

    test)
        echo "Running integration tests..."
        echo ""

        # Start container if not running
        if ! podman ps --filter "name=$CONTAINER_NAME" --format "{{.Names}}" | grep -q "^$CONTAINER_NAME$"; then
            echo "Starting container for tests..."
            ./run.sh start
            echo "Waiting for application to be ready..."
            sleep 10
        else
            echo "✓ Container already running"
        fi

        # Create test database if it doesn't exist
        echo "Setting up test database..."
        podman exec "$CONTAINER_NAME" psql -U rotv -d rotv -c "DROP DATABASE IF EXISTS rotv_test;" 2>/dev/null || true
        podman exec "$CONTAINER_NAME" psql -U rotv -d rotv -c "CREATE DATABASE rotv_test;" 2>/dev/null || true
        echo "✓ Test database ready"
        echo ""

        # Run tests
        echo "Running tests..."
        cd backend && TEST_DATABASE_URL="postgresql://rotv:rotv@localhost:5432/rotv_test" npm test

        echo ""
        echo "✓ Tests completed"
        ;;

    stop)
        echo "Stopping container..."
        podman stop "$CONTAINER_NAME" 2>/dev/null || true
        podman rm "$CONTAINER_NAME" 2>/dev/null || true
        echo "✓ Container stopped"
        ;;

    logs)
        podman logs -f "$CONTAINER_NAME"
        ;;

    shell)
        echo "Opening shell in running container..."
        podman exec -it "$CONTAINER_NAME" /bin/bash
        ;;

    reload-backend)
        echo "Reloading backend code into running container..."
        podman cp backend/. "$CONTAINER_NAME":/app/
        podman exec "$CONTAINER_NAME" pkill -f 'node server.js' 2>/dev/null || true
        sleep 1
        echo "✓ Backend reloaded - check http://localhost:8080"
        ;;

    reload-frontend)
        echo "Rebuilding and reloading frontend..."
        (cd frontend && npm run build)
        podman exec "$CONTAINER_NAME" rm -rf /app/public/assets/* 2>/dev/null || true
        podman cp frontend/dist/. "$CONTAINER_NAME":/app/public/
        echo "✓ Frontend reloaded - refresh browser"
        ;;

    push)
        echo "Pushing to quay.io..."
        podman push "$IMAGE_NAME"
        ;;

    help|*)
        echo "Roots of The Valley - Container Management"
        echo ""
        echo "Usage: ./run.sh [command]"
        echo ""
        echo "Main Commands:"
        echo "  build   Build the container image"
        echo "  start   Start the application container"
        echo "  test    Run integration tests (starts container if needed)"
        echo "  stop    Stop and remove the container"
        echo ""
        echo "Development Commands:"
        echo "  reload-backend   Hot-reload backend code into running container"
        echo "  reload-frontend  Rebuild and reload frontend into running container"
        echo ""
        echo "Utility Commands:"
        echo "  logs    Follow container logs"
        echo "  shell   Open bash shell in running container"
        echo "  push    Push image to quay.io/fatherlinux/rotv"
        echo ""
        echo "Environment variables (set in .env file or export):"
        echo "  DATA_DIR             PostgreSQL data directory (default: ~/.rotv/pgdata)"
        echo "  GOOGLE_CLIENT_ID     Google OAuth client ID"
        echo "  GOOGLE_CLIENT_SECRET Google OAuth client secret"
        echo "  GEMINI_API_KEY       Google Gemini API key"
        echo "  SESSION_SECRET       Session encryption key"
        echo "  ADMIN_EMAIL          Email for admin user"
        echo ""
        echo "Quick Start:"
        echo "  1. cp .env.example .env    # Copy and fill in credentials"
        echo "  2. ./run.sh build          # Build container image"
        echo "  3. ./run.sh start          # Start application"
        echo "  4. ./run.sh test           # Run tests"
        echo ""
        ;;
esac
