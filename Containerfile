# Application layer for Roots of The Valley
# Builds on top of rotv-base which contains PostgreSQL, Node.js, and Playwright
# For local development: run ./run.sh build-base first if base image doesn't exist

# Use the base image from quay.io (or local build)
ARG BASE_IMAGE=quay.io/fatherlinux/rotv-base:latest
FROM ${BASE_IMAGE}

# Labels - bump version here to force app layer rebuild
LABEL maintainer="fatherlinux"
LABEL description="Roots of The Valley - Cuyahoga Valley National Park destination explorer"
LABEL version="1.12.1"

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
