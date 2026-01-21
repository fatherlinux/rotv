# Stage 1: Infrastructure base (PostgreSQL + Node.js)
FROM registry.access.redhat.com/ubi10/ubi:latest AS infrastructure

# Install Node.js and Chromium dependencies for Playwright
RUN dnf install -y nodejs npm \
    # Playwright/Chromium system dependencies
    nspr nss alsa-lib atk cups-libs gtk3 \
    libXcomposite libXdamage libXrandr libxkbcommon \
    mesa-libgbm pango libdrm \
    libxshmfence libX11 libXext libXfixes \
    && dnf clean all

# Install Playwright Chromium browser early (rarely changes)
RUN npx playwright install chromium

# Add PostgreSQL official repository and install PostgreSQL 17
RUN dnf install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-10-x86_64/pgdg-redhat-repo-latest.noarch.rpm && \
    dnf install -y postgresql17-server postgresql17 && \
    dnf clean all

# Create symlinks for PostgreSQL commands
RUN ln -s /usr/pgsql-17/bin/initdb /usr/local/bin/initdb && \
    ln -s /usr/pgsql-17/bin/pg_ctl /usr/local/bin/pg_ctl && \
    ln -s /usr/pgsql-17/bin/postgres /usr/local/bin/postgres && \
    ln -s /usr/pgsql-17/bin/psql /usr/local/bin/psql && \
    ln -s /usr/pgsql-17/bin/pg_isready /usr/local/bin/pg_isready

# Create postgres user for running PostgreSQL (required - pg won't run as root)
# Container runs as root, but PostgreSQL runs as postgres user via su
RUN useradd -u 70 -m -s /bin/bash postgres || true

# Set up PostgreSQL data directory (will be bind-mounted with proper permissions)
ENV PGDATA=/data/pgdata
RUN mkdir -p /data/pgdata && chown postgres:postgres /data/pgdata

# Environment variables
ENV NODE_ENV=development
ENV PORT=8080
ENV STATIC_PATH=/app/public
ENV PGHOST=localhost
ENV PGPORT=5432
ENV PGDATABASE=rotv
ENV PGUSER=postgres
ENV PGPASSWORD=rotv

# Stage 2: Application layer
FROM infrastructure AS application

# Labels at the top of app stage - bump version here to force app layer rebuild
LABEL maintainer="fatherlinux"
LABEL description="Roots of The Valley - Cuyahoga Valley National Park destination explorer"
LABEL version="1.11.0"

WORKDIR /app

# Build frontend
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install
COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# Install backend dependencies
COPY backend/package*.json ./
RUN npm install --only=production

# Copy backend code
COPY backend/ ./

# Move built frontend to public directory
RUN mv frontend/dist public && rm -rf frontend

# Copy startup script
COPY entrypoint.sh /entrypoint.sh
RUN chmod 755 /entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
