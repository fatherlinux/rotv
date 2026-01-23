#!/bin/bash
set -e

BASE_IMAGE_NAME="quay.io/fatherlinux/rotv-base"
IMAGE_NAME="quay.io/fatherlinux/rotv"
CONTAINER_NAME="rotv"

# Development uses ephemeral storage (tmpfs) - data is thrown away on restart
# Production should set PERSISTENT_DATA=true and DATA_DIR=/path/to/storage
USE_PERSISTENT="${PERSISTENT_DATA:-false}"
DATA_DIR="${DATA_DIR:-$HOME/.rotv/pgdata}"
SEED_DATA_FILE="$HOME/.rotv/seed-data.sql"
PRODUCTION_HOST="${PRODUCTION_HOST:-sven.dc3.crunchtools.com}"
PRODUCTION_PORT="${PRODUCTION_PORT:-22422}"
PRODUCTION_CONTAINER="${PRODUCTION_CONTAINER:-rootsofthevalley.org}"

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
[ -n "$PERPLEXITY_API_KEY" ] && ENV_ARGS="$ENV_ARGS -e PERPLEXITY_API_KEY=$PERPLEXITY_API_KEY"
[ -n "$GOOGLE_SHEETS_CREDENTIALS" ] && ENV_ARGS="$ENV_ARGS -e GOOGLE_SHEETS_CREDENTIALS=$GOOGLE_SHEETS_CREDENTIALS"
[ -n "$FACEBOOK_APP_ID" ] && ENV_ARGS="$ENV_ARGS -e FACEBOOK_APP_ID=$FACEBOOK_APP_ID"
[ -n "$FACEBOOK_APP_SECRET" ] && ENV_ARGS="$ENV_ARGS -e FACEBOOK_APP_SECRET=$FACEBOOK_APP_SECRET"
[ -n "$ADMIN_EMAIL" ] && ENV_ARGS="$ENV_ARGS -e ADMIN_EMAIL=$ADMIN_EMAIL"

case "${1:-help}" in
    build-base)
        echo "Building base container image..."
        echo "This contains PostgreSQL, Node.js, and Playwright (rarely changes)"
        podman build --security-opt label=disable -f Containerfile.base -t "$BASE_IMAGE_NAME" .
        echo ""
        echo "✓ Base image built: $BASE_IMAGE_NAME"
        echo "You can now run: ./run.sh build"
        ;;

    build)
        echo "Building application container image..."
        # Check if base image exists locally
        if ! podman image exists "$BASE_IMAGE_NAME"; then
            echo "Base image not found locally, pulling from quay.io..."
            if ! podman pull "$BASE_IMAGE_NAME"; then
                echo ""
                echo "⚠ Base image not found on quay.io"
                echo "Building base image locally (this will take longer)..."
                podman build --security-opt label=disable -f Containerfile.base -t "$BASE_IMAGE_NAME" .
            fi
        fi
        podman build --security-opt label=disable --build-arg BASE_IMAGE="$BASE_IMAGE_NAME" -t "$IMAGE_NAME" .
        ;;

    build-all)
        echo "Building both base and application images..."
        echo ""
        echo "=== Building base image ==="
        podman build --security-opt label=disable -f Containerfile.base -t "$BASE_IMAGE_NAME" .
        echo ""
        echo "=== Building application image ==="
        podman build --security-opt label=disable --build-arg BASE_IMAGE="$BASE_IMAGE_NAME" -t "$IMAGE_NAME" .
        echo ""
        echo "✓ Both images built successfully"
        ;;

    start)
        echo "Starting Roots of The Valley..."

        # Stop existing container if running
        podman stop "$CONTAINER_NAME" 2>/dev/null || true
        podman rm "$CONTAINER_NAME" 2>/dev/null || true

        # Build storage mount options
        if [ "$USE_PERSISTENT" = "true" ]; then
            echo "Using persistent storage: $DATA_DIR"
            mkdir -p "$DATA_DIR"
            # Set up permissions for bind-mounted data directory
            if [ ! -f "$DATA_DIR/PG_VERSION" ]; then
                echo "Setting up data directory permissions..."
                podman unshare chown 70:70 "$DATA_DIR" 2>/dev/null || true
                podman unshare chmod 700 "$DATA_DIR" 2>/dev/null || true
            fi
            STORAGE_MOUNT="-v $DATA_DIR:/data/pgdata:Z"
        else
            echo "Using ephemeral storage (data will be lost on restart)"
            STORAGE_MOUNT="--tmpfs /data/pgdata:rw,size=2G,mode=0700"
        fi

        # Handle seed data in development mode
        SEED_MOUNT=""
        if [ "$USE_PERSISTENT" = "false" ]; then
            # Check if seed data exists
            if [ ! -f "$SEED_DATA_FILE" ]; then
                echo "⚠ No seed data found at $SEED_DATA_FILE"
                echo "Automatically pulling production data..."
                echo ""

                # Create cache directory
                mkdir -p "$(dirname "$SEED_DATA_FILE")"

                # Pull data from production
                echo "Running pg_dump on production container: $PRODUCTION_CONTAINER"
                ssh -p "$PRODUCTION_PORT" root@"$PRODUCTION_HOST" \
                    "podman exec $PRODUCTION_CONTAINER pg_dump -U rotv --clean --if-exists --no-owner --no-acl rotv" \
                    > "$SEED_DATA_FILE"

                if [ $? -eq 0 ]; then
                    SEED_SIZE=$(du -h "$SEED_DATA_FILE" | cut -f1)
                    echo "✓ Production data downloaded ($SEED_SIZE)"
                    echo ""
                else
                    echo "❌ Failed to pull production data"
                    echo "Cannot start in development mode without seed data"
                    rm -f "$SEED_DATA_FILE"
                    exit 1
                fi
            else
                # Check freshness of seed data (warn if older than 7 days)
                SEED_AGE_DAYS=$(( ($(date +%s) - $(date -r "$SEED_DATA_FILE" +%s)) / 86400 ))
                if [ $SEED_AGE_DAYS -gt 7 ]; then
                    echo "⚠ Seed data is $SEED_AGE_DAYS days old"
                    echo "Consider running './run.sh seed' to refresh production data"
                    echo ""
                fi
            fi

            # Mount seed data for import
            echo "Mounting seed data for import..."
            SEED_MOUNT="-v $SEED_DATA_FILE:/tmp/seed-data.sql:ro"
        fi

        podman run -d \
            --name "$CONTAINER_NAME" \
            --privileged \
            --network=pasta:--dns-forward,8.8.8.8 \
            -p 8080:8080 \
            $STORAGE_MOUNT \
            $SEED_MOUNT \
            $ENV_ARGS \
            "$IMAGE_NAME"

        echo "Application starting at http://localhost:8080"
        if [ -n "$SEED_MOUNT" ]; then
            echo "Seed data will be imported during startup..."
        fi
        echo "Waiting for application to be ready..."
        sleep 10

        echo "✓ Container started successfully"
        echo ""
        echo "Useful commands:"
        echo "  ./run.sh logs   - View logs"
        echo "  ./run.sh stop   - Stop container"
        echo "  ./run.sh seed   - Pull fresh data from production"
        ;;

    test)
        echo "Running integration tests..."
        echo ""

        # Stop and remove existing container
        echo "Stopping main container..."
        podman stop "$CONTAINER_NAME" 2>/dev/null || true
        podman rm "$CONTAINER_NAME" 2>/dev/null || true

        # Start container with test database using ephemeral storage
        echo "Starting test container with ephemeral storage..."
        podman run -d \
            --name "$CONTAINER_NAME" \
            --privileged \
            --network=pasta:--dns-forward,8.8.8.8 \
            -p 8080:8080 \
            --tmpfs /data/pgdata:rw,size=2G,mode=0700 \
            -e PGDATABASE=rotv_test \
            $ENV_ARGS \
            "$IMAGE_NAME" >/dev/null

        echo "Waiting for container to be ready..."
        sleep 10

        # Create test database if it doesn't exist
        echo "Setting up test database..."
        podman exec "$CONTAINER_NAME" psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS rotv_test;" 2>/dev/null || true
        podman exec "$CONTAINER_NAME" psql -U postgres -d postgres -c "CREATE DATABASE rotv_test;" 2>/dev/null || true

        # Run migrations on test database
        echo "Running migrations on test database..."
        podman exec "$CONTAINER_NAME" psql -U postgres -d rotv_test -f /app/migrations/schema.sql 2>/dev/null || echo "⚠ No migrations found (continuing anyway)"

        echo "✓ Test database ready"
        echo ""

        # Run tests INSIDE container
        echo "Running tests inside container..."
        podman exec "$CONTAINER_NAME" sh -c "cd /app && npm test"
        TEST_EXIT_CODE=$?

        # Clean up - stop test container
        echo ""
        echo "Stopping test container..."
        podman stop "$CONTAINER_NAME" >/dev/null 2>&1
        podman rm "$CONTAINER_NAME" >/dev/null 2>&1

        echo ""
        if [ $TEST_EXIT_CODE -eq 0 ]; then
            echo "✓ Tests completed successfully"
        else
            echo "❌ Tests failed"
            exit $TEST_EXIT_CODE
        fi
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

    seed)
        echo "Pulling data from production..."
        echo "Host: $PRODUCTION_HOST:$PRODUCTION_PORT"
        echo ""

        # Create cache directory
        mkdir -p "$(dirname "$SEED_DATA_FILE")"

        # Pull data from production using pg_dump
        # --no-owner: Don't include ownership commands (rotv vs postgres user mismatch)
        # --no-acl: Don't include access privileges
        echo "Running pg_dump on production container: $PRODUCTION_CONTAINER"
        ssh -p "$PRODUCTION_PORT" root@"$PRODUCTION_HOST" \
            "podman exec $PRODUCTION_CONTAINER pg_dump -U rotv --clean --if-exists --no-owner --no-acl rotv" \
            > "$SEED_DATA_FILE"

        if [ $? -eq 0 ]; then
            SEED_SIZE=$(du -h "$SEED_DATA_FILE" | cut -f1)
            echo "✓ Production data saved to $SEED_DATA_FILE ($SEED_SIZE)"
            echo ""
            echo "Next steps:"
            echo "  ./run.sh start   # Start with this data"
            echo "  ./run.sh test    # Run tests with this data"
        else
            echo "❌ Failed to pull production data"
            rm -f "$SEED_DATA_FILE"
            exit 1
        fi
        ;;

    push)
        echo "Pushing application image to quay.io..."
        podman push "$IMAGE_NAME"
        ;;

    push-base)
        echo "Pushing base image to quay.io..."
        podman push "$BASE_IMAGE_NAME"
        ;;

    push-all)
        echo "Pushing both images to quay.io..."
        echo "Pushing base image..."
        podman push "$BASE_IMAGE_NAME"
        echo "Pushing application image..."
        podman push "$IMAGE_NAME"
        echo "✓ Both images pushed"
        ;;

    help|*)
        echo "Roots of The Valley - Container Management"
        echo ""
        echo "Usage: ./run.sh [command]"
        echo ""
        echo "Build Commands:"
        echo "  build       Build application image (pulls base from quay.io if needed)"
        echo "  build-base  Build base image locally (PostgreSQL, Node.js, Playwright)"
        echo "  build-all   Build both base and application images"
        echo ""
        echo "Main Commands:"
        echo "  seed    Pull production data to seed local development"
        echo "  start   Start the application container (ephemeral storage)"
        echo "  test    Run integration tests (ephemeral storage)"
        echo "  stop    Stop and remove the container"
        echo ""
        echo "Utility Commands:"
        echo "  logs       Follow container logs"
        echo "  shell      Open bash shell in running container"
        echo "  push       Push application image to quay.io/fatherlinux/rotv"
        echo "  push-base  Push base image to quay.io/fatherlinux/rotv-base"
        echo "  push-all   Push both images to quay.io"
        echo ""
        echo "Storage & Data Workflow:"
        echo "  Development (default): Ephemeral storage + Production seed data"
        echo "    1. ./run.sh seed         # Pull latest data from production (one-time)"
        echo "    2. ./run.sh start        # Starts with ephemeral storage + seed data"
        echo "    3. Make changes, restart # Each restart = fresh copy of prod data"
        echo ""
        echo "    Benefits:"
        echo "    - Real production data for testing"
        echo "    - Clean slate on every restart"
        echo "    - No permission issues"
        echo "    - Fast startup"
        echo ""
        echo "  Production: Persistent storage (on production server)"
        echo "    - Set PERSISTENT_DATA=true to enable"
        echo "    - Set DATA_DIR=/path/to/storage (default: ~/.rotv/pgdata)"
        echo "    - Data survives container restarts"
        echo "    - Example: PERSISTENT_DATA=true ./run.sh start"
        echo ""
        echo "Environment variables (set in .env file or export):"
        echo "  PERSISTENT_DATA      Enable persistent storage (default: false)"
        echo "  PRODUCTION_HOST      Production server (default: sven.dc3.crunchtools.com)"
        echo "  PRODUCTION_PORT      SSH port (default: 22422)"
        echo "  DATA_DIR             PostgreSQL data directory (default: ~/.rotv/pgdata)"
        echo "  GOOGLE_CLIENT_ID     Google OAuth client ID"
        echo "  GOOGLE_CLIENT_SECRET Google OAuth client secret"
        echo "  GEMINI_API_KEY       Google Gemini API key"
        echo "  SESSION_SECRET       Session encryption key"
        echo "  ADMIN_EMAIL          Email for admin user"
        echo ""
        echo "Quick Start (Development):"
        echo "  1. cp .env.example .env    # Copy and fill in credentials"
        echo "  2. ./run.sh build          # Build container image"
        echo "  3. ./run.sh seed           # Pull production data (one-time)"
        echo "  4. ./run.sh start          # Start with ephemeral storage + seed data"
        echo "  5. ./run.sh test           # Run tests"
        echo ""
        ;;
esac
