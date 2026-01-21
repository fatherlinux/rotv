#!/bin/bash
set -e

PGDATA="${PGDATA:-/data/pgdata}"
PGRUNDIR="/tmp/pgsocket"

echo "=== Roots of The Valley ==="
echo "Starting up..."

# Create PostgreSQL socket directory
mkdir -p "$PGRUNDIR"

# Ensure data directory ownership is correct
# Both tmpfs and bind mounts need ownership fixed since container runs as root
PGDATA_OWNER=$(stat -c '%u' "$PGDATA" 2>/dev/null || echo "unknown")
if [ "$PGDATA_OWNER" != "70" ]; then
    echo "Fixing data directory permissions..."
    chown -R postgres:postgres "$PGDATA"
    chmod 700 "$PGDATA"
fi

# Remove stale PID file if it exists (from previous unclean shutdown)
rm -f "$PGDATA/postmaster.pid" 2>/dev/null || true

# Initialize PostgreSQL if needed
if [ ! -f "$PGDATA/PG_VERSION" ]; then
    echo "Initializing PostgreSQL database..."

    # Initialize as postgres user (PostgreSQL refuses to run as root)
    su postgres -c "initdb -D $PGDATA -U postgres"

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

    # Start PostgreSQL temporarily to create databases (as postgres user)
    su postgres -c "pg_ctl -D $PGDATA -l /tmp/pg_init.log start -o '-k $PGRUNDIR'"
    sleep 3

    echo "Creating databases..."
    psql -h "$PGRUNDIR" -U postgres -d postgres -c "CREATE DATABASE rotv;" 2>/dev/null || true
    psql -h "$PGRUNDIR" -U postgres -d postgres -c "CREATE DATABASE rotv_test;" 2>/dev/null || true

    su postgres -c "pg_ctl -D $PGDATA stop"
    sleep 2
fi

# Start PostgreSQL as postgres user (container runs as root, but PostgreSQL as postgres)
echo "Starting PostgreSQL..."
su postgres -c "pg_ctl -D $PGDATA -l $PGDATA/postgresql.log start -o '-k $PGRUNDIR'"

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
psql -h "$PGRUNDIR" -U postgres -d postgres -c "CREATE DATABASE rotv_test;" 2>/dev/null || true

# Start the Node.js application
echo "Starting Roots of The Valley application..."
cd /app
exec node server.js
