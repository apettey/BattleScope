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

ARG SERVICE_SCOPE
RUN pnpm --filter ${SERVICE_SCOPE}... build

RUN pnpm prune --prod

FROM ${NODE_RUNTIME_IMAGE} AS runner

WORKDIR /workspace
ENV NODE_ENV=production

COPY --from=builder /workspace/node_modules ./node_modules
COPY --from=builder /workspace/backend ./backend
COPY --from=builder /workspace/packages ./packages
COPY --from=builder /workspace/package.json ./package.json
COPY --from=builder /workspace/pnpm-workspace.yaml ./pnpm-workspace.yaml

ARG BUILD_TARGET
ARG EXPOSE_PORT
WORKDIR /workspace/${BUILD_TARGET}

EXPOSE ${EXPOSE_PORT}
CMD ["node", "dist/index.js"]
