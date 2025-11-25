# Multi-stage Dockerfile for BFF service

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace configuration
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy shared packages
COPY packages/logger ./packages/logger
COPY packages/types ./packages/types

# Copy BFF service
COPY services/bff ./services/bff

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build shared packages
RUN pnpm --filter @battlescope/logger build
RUN pnpm --filter @battlescope/types build

# Build BFF service
RUN pnpm --filter @battlescope/bff build

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

# Copy workspace configuration
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy shared packages (built)
COPY --from=builder /app/packages/logger/package.json ./packages/logger/
COPY --from=builder /app/packages/logger/dist ./packages/logger/dist
COPY --from=builder /app/packages/types/package.json ./packages/types/
COPY --from=builder /app/packages/types/dist ./packages/types/dist

# Copy BFF service (built)
COPY --from=builder /app/services/bff/package.json ./services/bff/
COPY --from=builder /app/services/bff/dist ./services/bff/dist

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Set working directory to service
WORKDIR /app/services/bff

# Expose port
EXPOSE 3006

# Set node environment
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3006/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"

# Run the service
CMD ["node", "dist/index.js"]
