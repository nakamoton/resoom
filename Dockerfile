# resoom のコンテナ。Cloud Run のサービス（画面）とジョブ（取得処理など）で同じものを使う。
#   画面:             node apps/web/server.js（既定）
#   空き状況の取得:   node scripts/crawl.mjs
#   マイグレーション: node scripts/db-migrate.mjs
#   初期データ:       node scripts/db-seed.mjs

FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable
# 依存パッケージを先に入れる（ソースの変更だけならこの層を使い回せる）
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/adapters/package.json packages/adapters/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @resoom/web build && pnpm bundle:scripts

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    HOSTNAME=0.0.0.0 \
    RESOOM_MIGRATIONS_DIR=/app/drizzle \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/dist/scripts ./scripts
COPY --from=build --chown=node:node /repo/packages/db/drizzle ./drizzle
COPY --from=build --chown=node:node /repo/data/seed ./data/seed
USER node
EXPOSE 8080
CMD ["node", "apps/web/server.js"]
