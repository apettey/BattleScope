# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy packages
COPY packages ./packages

# Copy enrichment service
COPY services/enrichment ./services/enrichment

# Install pnpm
RUN npm install -g pnpm

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build packages and service
RUN pnpm --filter @battlescope/database build
RUN pnpm --filter @battlescope/logger build
RUN pnpm --filter @battlescope/types build
RUN pnpm --filter @battlescope/events build
RUN pnpm --filter @battlescope/enrichment build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy root package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy packages
COPY --from=builder /app/packages ./packages

# Copy enrichment service
COPY --from=builder /app/services/enrichment ./services/enrichment

# Install pnpm
RUN npm install -g pnpm

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Set working directory to service
WORKDIR /app/services/enrichment

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3002/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); })"

# Run the service
CMD ["node", "dist/index.js"]
