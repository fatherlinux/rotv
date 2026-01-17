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
[ -n "$FACEBOOK_APP_ID" ] && ENV_ARGS="$ENV_ARGS -e FACEBOOK_APP_ID=$FACEBOOK_APP_ID"
[ -n "$FACEBOOK_APP_SECRET" ] && ENV_ARGS="$ENV_ARGS -e FACEBOOK_APP_SECRET=$FACEBOOK_APP_SECRET"
[ -n "$ADMIN_EMAIL" ] && ENV_ARGS="$ENV_ARGS -e ADMIN_EMAIL=$ADMIN_EMAIL"

case "${1:-help}" in
    build)
        echo "Building container image..."
        podman build --security-opt label=disable -t "$IMAGE_NAME" .
        ;;

    run)
        echo "Starting Roots of The Valley..."
        echo "PostgreSQL data will be stored in: $DATA_DIR"
        # Set up permissions if directory is empty or newly created
        if [ ! -f "$DATA_DIR/PG_VERSION" ]; then
            echo "Setting up data directory permissions..."
            podman unshare chown 1000:1000 "$DATA_DIR" 2>/dev/null || true
            podman unshare chmod 700 "$DATA_DIR" 2>/dev/null || true
        fi
        podman run -d \
            --name "$CONTAINER_NAME" \
            --privileged \
            --network host \
            -v "$DATA_DIR:/data/pgdata" \
            $ENV_ARGS \
            "$IMAGE_NAME"
        echo "Application running at http://localhost:8080"
        ;;

    stop)
        echo "Stopping container..."
        podman stop "$CONTAINER_NAME" 2>/dev/null || true
        podman rm "$CONTAINER_NAME" 2>/dev/null || true
        ;;

    logs)
        podman logs -f "$CONTAINER_NAME"
        ;;

    push)
        echo "Pushing to quay.io..."
        podman push "$IMAGE_NAME"
        ;;

    dev)
        echo "Running in development mode (foreground)..."
        # Set up permissions if directory is empty or newly created
        if [ ! -f "$DATA_DIR/PG_VERSION" ]; then
            echo "Setting up data directory permissions..."
            podman unshare chown 1000:1000 "$DATA_DIR" 2>/dev/null || true
            podman unshare chmod 700 "$DATA_DIR" 2>/dev/null || true
        fi
        podman run --rm -it \
            --name "$CONTAINER_NAME" \
            --privileged \
            -p 8080:8080 \
            -v "$DATA_DIR:/data/pgdata" \
            $ENV_ARGS \
            "$IMAGE_NAME"
        ;;

    shell)
        echo "Opening shell in running container..."
        podman exec -it "$CONTAINER_NAME" /bin/bash
        ;;

    help|*)
        echo "Roots of The Valley - Container Management"
        echo ""
        echo "Usage: ./run.sh [command]"
        echo ""
        echo "Commands:"
        echo "  build   Build the container image"
        echo "  run     Start the container (detached)"
        echo "  stop    Stop and remove the container"
        echo "  logs    Follow container logs"
        echo "  push    Push image to quay.io/fatherlinux/rotv"
        echo "  dev     Run in foreground (for debugging)"
        echo "  shell   Open bash shell in running container"
        echo ""
        echo "Environment variables (set in .env file or export):"
        echo "  DATA_DIR             PostgreSQL data directory (default: ~/.rotv/pgdata)"
        echo "  GOOGLE_CLIENT_ID     Google OAuth client ID"
        echo "  GOOGLE_CLIENT_SECRET Google OAuth client secret"
        echo "  SESSION_SECRET       Session encryption key"
        echo "  ADMIN_EMAIL          Email for admin user (default: scott.mccarty@gmail.com)"
        echo ""
        echo "Setup: Copy .env.example to .env and fill in your OAuth credentials"
        ;;
esac
