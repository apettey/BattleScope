FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm
COPY services/enrichment/package.json ./
RUN pnpm install
COPY tsconfig.base.json ../
COPY services/enrichment/tsconfig.json ./
COPY services/enrichment/src ./src
RUN pnpm build

FROM node:20-alpine
WORKDIR /app
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
USER nodejs
EXPOSE 3002
CMD ["node", "dist/index.js"]
