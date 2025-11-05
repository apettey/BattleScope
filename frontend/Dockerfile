# syntax=docker/dockerfile:1.6

ARG NODE_BUILD_IMAGE=node:20-bullseye

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

RUN pnpm --filter @battlescope/frontend... build

FROM nginx:1.25-alpine AS runner

COPY --from=builder /workspace/frontend/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
