# syntax=docker/dockerfile:1
# Pulse API — multi-stage production image
# Build:  docker build -f apps/api/Dockerfile -t pulse-api .
# Run:    docker run --env-file .env -p 4000:4000 pulse-api

FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN pnpm install --frozen-lockfile --filter @pulse/api --fetch-retries=6 --fetch-retry-mintimeout=30000 --network-concurrency=6

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
RUN pnpm --filter @pulse/api exec prisma generate && pnpm --filter @pulse/api build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/packages ./packages
WORKDIR /app/apps/api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/health >/dev/null 2>&1 || exit 1
CMD ["node", "dist/main.js"]
