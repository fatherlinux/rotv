# Stage 1: Infrastructure base (PostgreSQL + Node.js)
FROM registry.access.redhat.com/ubi10/ubi:latest AS infrastructure

LABEL maintainer="fatherlinux"
LABEL description="Roots of The Valley - Cuyahoga Valley National Park destination explorer"
LABEL version="1.5.0"

# Install Node.js
RUN dnf install -y nodejs npm && dnf clean all

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

# Create app user with specific UID for consistent bind mount permissions
RUN useradd -u 1000 -m -s /bin/bash rotv

# Set up PostgreSQL data directory (will be bind-mounted)
ENV PGDATA=/data/pgdata
RUN mkdir -p /data/pgdata && \
    chown -R rotv:rotv /data

# Environment variables
ENV NODE_ENV=development
ENV PORT=8080
ENV STATIC_PATH=/app/public
ENV PGHOST=localhost
ENV PGPORT=5432
ENV PGDATABASE=rotv
ENV PGUSER=rotv
ENV PGPASSWORD=rotv

# Stage 2: Application layer
FROM infrastructure AS application

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
RUN chmod 755 /entrypoint.sh && chown rotv:rotv /entrypoint.sh

# Set ownership of app directory
RUN chown -R rotv:rotv /app

# Switch to non-root user
USER rotv

EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
