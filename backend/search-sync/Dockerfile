# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/database/package.json ./packages/database/
COPY packages/esi-client/package.json ./packages/esi-client/
COPY packages/search/package.json ./packages/search/
COPY packages/shared/package.json ./packages/shared/
COPY backend/search-sync/package.json ./backend/search-sync/

# Install pnpm and dependencies
RUN corepack enable pnpm && pnpm install --frozen-lockfile

# Copy source code
COPY packages/database ./packages/database
COPY packages/esi-client ./packages/esi-client
COPY packages/search ./packages/search
COPY packages/shared ./packages/shared
COPY backend/search-sync ./backend/search-sync
COPY tsconfig.base.json ./

# Build search-sync and all its dependencies in one command
RUN pnpm --filter @battlescope/search-sync... run build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/database/package.json ./packages/database/
COPY packages/esi-client/package.json ./packages/esi-client/
COPY packages/search/package.json ./packages/search/
COPY packages/shared/package.json ./packages/shared/
COPY backend/search-sync/package.json ./backend/search-sync/

# Install pnpm and production dependencies only
RUN corepack enable pnpm && pnpm install --frozen-lockfile --prod

# Copy built artifacts from builder
COPY --from=builder /app/packages/database/dist ./packages/database/dist
COPY --from=builder /app/packages/esi-client/dist ./packages/esi-client/dist
COPY --from=builder /app/packages/search/dist ./packages/search/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/backend/search-sync/dist ./backend/search-sync/dist

# Set user for security
USER node

CMD ["node", "backend/search-sync/dist/backend/search-sync/src/index.js"]
