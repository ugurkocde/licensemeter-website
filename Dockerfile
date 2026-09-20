# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci

# Separate, one-shot schema migration image. The web container never gets the
# database owner's credentials or permission to alter the schema. Only the
# production dependencies are installed; the migrator needs postgres and
# drizzle-orm, not the build toolchain.
FROM node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS migrate
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY docker/migrations ./docker/migrations
COPY docker/migrate.mjs ./docker/migrate.mjs
USER node
CMD ["node", "docker/migrate.mjs"]

FROM dependencies AS builder
COPY . .
# Build without deployment secrets. Self-hosted pages read configuration at
# request time, so the same image can be used with a different public URL.
RUN SKIP_ENV_VALIDATION=true SELF_HOSTED=true npm run build

FROM node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 SELF_HOSTED=true PORT=3000 HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --chown=node:node docker/entrypoint.mjs docker/scheduler.mjs ./docker/
COPY --chown=node:node LICENSE THIRD_PARTY_NOTICES.md ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "docker/entrypoint.mjs"]
