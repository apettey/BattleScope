# syntax=docker/dockerfile:1.6

ARG NODE_BUILD_IMAGE=node:20-bullseye
ARG NODE_RUNTIME_IMAGE=node:20-slim
ARG SERVICE_SCOPE=@battlescope/api
ARG BUILD_TARGET=backend/api
ARG EXPOSE_PORT=3000

FROM ${NODE_BUILD_IMAGE} AS builder

WORKDIR /workspace

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.base.json ./
COPY backend ./backend
COPY frontend ./frontend
COPY packages ./packages

RUN pnpm install --frozen-lockfile

# Build all packages to ensure dist folders exist
RUN pnpm -r run build

FROM ${NODE_RUNTIME_IMAGE} AS runner

WORKDIR /workspace
ENV NODE_ENV=production

# Install pnpm in runtime image for workspace support
RUN corepack enable pnpm

# Copy workspace files
COPY --from=builder /workspace/package.json ./package.json
COPY --from=builder /workspace/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /workspace/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Copy all built packages with their dist folders
COPY --from=builder /workspace/packages ./packages
COPY --from=builder /workspace/backend ./backend

# Install only production dependencies
RUN pnpm install --prod --frozen-lockfile

ARG BUILD_TARGET
ARG EXPOSE_PORT
WORKDIR /workspace/${BUILD_TARGET}

EXPOSE ${EXPOSE_PORT}
CMD ["node", "dist/index.js"]
