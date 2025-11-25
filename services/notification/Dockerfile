# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY pnpm-lock.yaml* ./

# Install pnpm
RUN npm install -g pnpm

# Copy workspace configuration
COPY pnpm-workspace.yaml ./

# Copy shared packages
COPY packages ./packages

# Copy notification service
COPY services/notification ./services/notification

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build shared packages
RUN pnpm --filter @battlescope/database build
RUN pnpm --filter @battlescope/logger build
RUN pnpm --filter @battlescope/types build
RUN pnpm --filter @battlescope/events build

# Build notification service
RUN pnpm --filter @battlescope/notification build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml* ./
COPY pnpm-workspace.yaml ./

# Copy built packages
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/notification ./services/notification

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Set working directory to service
WORKDIR /app/services/notification

# Expose port
EXPOSE 3005

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3005/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Run migrations on startup, then start the service
CMD ["sh", "-c", "npm run migrate && npm start"]
