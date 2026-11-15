# Multi-stage Dockerfile for JK-BMS Standalone Server (Oracle Cloud)
FROM node:20-slim AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./
COPY frontend/package*.json ./frontend/

# Install dependencies
RUN npm ci
RUN cd frontend && npm ci

# Copy source files
COPY . .

# Build frontend and server
RUN npm run build:frontend
RUN npm run build:server

# --- Production Image ---
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/jkbms.db
ENV PUBLIC_DIR=/app/public

# Copy package manifests & install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled artifacts & schema
COPY --from=builder /app/dist/server.js ./dist/server.js
COPY --from=builder /app/public ./public
COPY schema.sql ./schema.sql

# Create persistent data directory for SQLite
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "dist/server.js"]

