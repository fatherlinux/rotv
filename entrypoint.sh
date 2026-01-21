#!/bin/bash
set -e

PGDATA="${PGDATA:-/data/pgdata}"
PGRUNDIR="/tmp/pgsocket"

echo "=== Roots of The Valley ==="
echo "Starting up..."

# Create PostgreSQL socket directory
mkdir -p "$PGRUNDIR"

# Initialize PostgreSQL if needed
if [ ! -f "$PGDATA/PG_VERSION" ]; then
    echo "Initializing PostgreSQL database..."

    # Ensure data directory has correct permissions
    chmod 700 "$PGDATA" 2>/dev/null || true

    # Initialize as current user (works with rootless podman)
    initdb -D "$PGDATA"

    # Configure PostgreSQL for local connections
    cat >> "$PGDATA/pg_hba.conf" << 'EOF'
host all all 127.0.0.1/32 trust
host all all ::1/128 trust
local all all trust
EOF

    # Configure PostgreSQL to listen on localhost and use custom socket dir
    cat >> "$PGDATA/postgresql.conf" << EOF
listen_addresses = 'localhost'
unix_socket_directories = '$PGRUNDIR'
EOF

    # Start PostgreSQL temporarily to create user and database
    pg_ctl -D "$PGDATA" -l /tmp/pg_init.log start -o "-k $PGRUNDIR"
    sleep 3

    echo "Creating database and user..."
    psql -h "$PGRUNDIR" -d postgres -c "CREATE USER rotv WITH PASSWORD 'rotv';" 2>/dev/null || true
    psql -h "$PGRUNDIR" -d postgres -c "CREATE DATABASE rotv OWNER rotv;" 2>/dev/null || true
    psql -h "$PGRUNDIR" -d postgres -c "CREATE DATABASE rotv_test OWNER rotv;" 2>/dev/null || true
    psql -h "$PGRUNDIR" -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE rotv TO rotv;" 2>/dev/null || true
    psql -h "$PGRUNDIR" -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE rotv_test TO rotv;" 2>/dev/null || true

    pg_ctl -D "$PGDATA" stop
    sleep 2
fi

# Start PostgreSQL
echo "Starting PostgreSQL..."
pg_ctl -D "$PGDATA" -l "$PGDATA/postgresql.log" start -o "-k $PGRUNDIR"

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
for i in {1..30}; do
    if pg_isready -h "$PGRUNDIR" -q; then
        echo "PostgreSQL is ready"
        break
    fi
    sleep 1
done

# Ensure rotv_test database exists (for testing)
psql -h "$PGRUNDIR" -d postgres -c "CREATE DATABASE rotv_test OWNER rotv;" 2>/dev/null || true

# Start the Node.js application
echo "Starting Roots of The Valley application..."
cd /app
exec node server.js
