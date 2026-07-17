# syntax=docker/dockerfile:1
# Multi-stage: web (Nuxt/Nitro), worker (sync loop), migrate (one-shot Drizzle).
ARG NODE_VERSION=20
ARG PNPM_VERSION=10.34.5

FROM node:${NODE_VERSION}-bookworm-slim AS base
ARG PNPM_VERSION
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/
COPY apps/docs/package.json apps/docs/
COPY apps/website/package.json apps/website/
COPY packages/auth/package.json packages/auth/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
COPY packages/ee/package.json packages/ee/
COPY packages/licensing/package.json packages/licensing/
COPY packages/sync/package.json packages/sync/
COPY packages/ui/package.json packages/ui/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @pms/web build && pnpm --filter @pms/website build

# --- Production web (Nitro node-server) — commercial app at app.pms.do ---
FROM base AS web
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
COPY --from=build /app/apps/web/.output /app/.output
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", ".output/server/index.mjs"]

# --- Public marketing website — pms.do ---
FROM base AS website
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
COPY --from=build /app/apps/website/.output /app/.output
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", ".output/server/index.mjs"]

# --- Sync worker (pull + ack loop via web internal APIs / local jobs) ---
FROM deps AS worker
ENV NODE_ENV=production
COPY . .
WORKDIR /app
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "const fs=require('fs');const p=process.env.WORKER_HEALTH_FILE||'/tmp/pms-worker-health.json';const h=JSON.parse(fs.readFileSync(p,'utf8'));if(Date.now()-Date.parse(h.lastTickAt)>120000)process.exit(1)"
CMD ["pnpm", "--filter", "@pms/sync", "worker"]

# --- One-shot migrations (must complete before web/worker traffic) ---
FROM deps AS migrate
ENV NODE_ENV=production
COPY packages/db packages/db
COPY packages/auth packages/auth
COPY tsconfig.json ./
CMD ["pnpm", "--filter", "@pms/db", "migrate"]
