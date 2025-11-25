# Build stage
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy package files for all workspaces
COPY packages/database/package.json ./packages/database/
COPY packages/logger/package.json ./packages/logger/
COPY packages/types/package.json ./packages/types/
COPY packages/events/package.json ./packages/events/
COPY services/ingestion/package.json ./services/ingestion/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code for all required packages
COPY packages/database ./packages/database
COPY packages/logger ./packages/logger
COPY packages/types ./packages/types
COPY packages/events ./packages/events
COPY services/ingestion ./services/ingestion

# Build packages and service
RUN pnpm --filter @battlescope/database build && \
    pnpm --filter @battlescope/logger build && \
    pnpm --filter @battlescope/types build && \
    pnpm --filter @battlescope/events build && \
    pnpm --filter @battlescope/ingestion build

# Production stage
FROM node:20-alpine AS production

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy package files
COPY packages/database/package.json ./packages/database/
COPY packages/logger/package.json ./packages/logger/
COPY packages/types/package.json ./packages/types/
COPY packages/events/package.json ./packages/events/
COPY services/ingestion/package.json ./services/ingestion/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts from builder
COPY --from=builder /app/packages/database/dist ./packages/database/dist
COPY --from=builder /app/packages/logger/dist ./packages/logger/dist
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/events/dist ./packages/events/dist
COPY --from=builder /app/services/ingestion/dist ./services/ingestion/dist

# Copy migrations
COPY services/ingestion/migrations ./services/ingestion/migrations

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

WORKDIR /app/services/ingestion

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start service
CMD ["node", "dist/index.js"]
