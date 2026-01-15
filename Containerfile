# Stage 1: Build frontend
FROM registry.access.redhat.com/ubi9/nodejs-20:latest AS frontend-builder

USER 0
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Final image with Postgres + Node.js
FROM registry.access.redhat.com/ubi9/ubi:latest

LABEL maintainer="fatherlinux"
LABEL description="Roots of The Valley - Cuyahoga Valley National Park destination explorer"

# Install Node.js first
RUN dnf install -y nodejs npm && dnf clean all

# Add PostgreSQL official repository and install PostgreSQL 15
RUN dnf install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-9-x86_64/pgdg-redhat-repo-latest.noarch.rpm && \
    dnf -qy module disable postgresql && \
    dnf install -y postgresql15-server postgresql15 && \
    dnf clean all

# Create symlinks for PostgreSQL commands
RUN ln -s /usr/pgsql-15/bin/initdb /usr/local/bin/initdb && \
    ln -s /usr/pgsql-15/bin/pg_ctl /usr/local/bin/pg_ctl && \
    ln -s /usr/pgsql-15/bin/postgres /usr/local/bin/postgres && \
    ln -s /usr/pgsql-15/bin/psql /usr/local/bin/psql && \
    ln -s /usr/pgsql-15/bin/pg_isready /usr/local/bin/pg_isready

# Create app user with specific UID for consistent bind mount permissions
RUN useradd -u 1000 -m -s /bin/bash rotv

# Set up PostgreSQL data directory (will be bind-mounted)
ENV PGDATA=/data/pgdata
RUN mkdir -p /data/pgdata && \
    chown -R rotv:rotv /data

# Set up app directory
WORKDIR /app

# Copy backend
COPY backend/package*.json ./
RUN npm install --only=production
COPY backend/ ./

# Copy built frontend from stage 1
COPY --from=frontend-builder /app/frontend/dist ./public

# Set ownership of app directory
RUN chown -R rotv:rotv /app

# Environment variables
ENV NODE_ENV=development
ENV PORT=8080
ENV STATIC_PATH=/app/public
ENV PGHOST=localhost
ENV PGPORT=5432
ENV PGDATABASE=rotv
ENV PGUSER=rotv
ENV PGPASSWORD=rotv

# Copy startup script
COPY entrypoint.sh /entrypoint.sh
RUN chmod 755 /entrypoint.sh && chown rotv:rotv /entrypoint.sh

# Switch to non-root user
USER rotv

EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
