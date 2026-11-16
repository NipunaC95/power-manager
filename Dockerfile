# ==============================================================================
# Multi-Stage Dockerfile for Railway Deployment (JK-BMS Standalone Server)
# ==============================================================================

# ── Stage 1: Build Stage ───────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Install native dependencies required for compiling native node addons
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
 && rm -rf /var/lib/apt/lists/*

# Copy dependency specifications
COPY package*.json ./
COPY frontend/package*.json ./frontend/

# Install dependencies (npm install is more tolerant than npm ci during cross-platform lock files)
RUN npm install
RUN cd frontend && npm install

# Copy complete source code
COPY . .

# Compile Frontend React UI and Node Server
RUN npm run build:standalone

# ── Stage 2: Production Runtime ───────────────────────────────────────────────
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/jkbms.db
ENV PUBLIC_DIR=/app/public

# Install runtime libraries for native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
 && rm -rf /var/lib/apt/lists/*

# Install production dependencies only
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copy compiled bundles and static assets from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY schema.sql schema_pg.sql schema_supabase.sql ./

# Create persistent storage folder for SQLite fallback
RUN mkdir -p /app/data

# Railway automatically assigns $PORT at runtime
EXPOSE 3000

# Container healthcheck targeting Express /health
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start the standalone server
CMD ["node", "dist/server.js"]
