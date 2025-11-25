# Build stage
FROM node:22-alpine AS builder

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages ./packages
COPY services/authentication ./services/authentication

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build packages first
RUN pnpm --filter "@battlescope/database" build
RUN pnpm --filter "@battlescope/logger" build
RUN pnpm --filter "@battlescope/types" build
RUN pnpm --filter "@battlescope/events" build

# Build authentication service
RUN pnpm --filter "@battlescope/authentication" build

# Production stage
FROM node:22-alpine AS runner

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy built packages
COPY --from=builder /app/packages/database/package.json ./packages/database/
COPY --from=builder /app/packages/database/dist ./packages/database/dist
COPY --from=builder /app/packages/logger/package.json ./packages/logger/
COPY --from=builder /app/packages/logger/dist ./packages/logger/dist
COPY --from=builder /app/packages/types/package.json ./packages/types/
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/events/package.json ./packages/events/
COPY --from=builder /app/packages/events/dist ./packages/events/dist

# Copy authentication service
COPY --from=builder /app/services/authentication/package.json ./services/authentication/
COPY --from=builder /app/services/authentication/dist ./services/authentication/dist
COPY --from=builder /app/services/authentication/migrations ./services/authentication/migrations

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

ENV NODE_ENV=production

WORKDIR /app/services/authentication

EXPOSE 3007

CMD ["node", "dist/index.js"]
