# syntax=docker/dockerfile:1
#
# LXP Toolkit — API + built React UI + Playwright scraper + LibreOffice.
#
#   docker compose up -d --build     # local service on http://localhost:4174
#
# The UI is built into the image and served by the Node server, so the container
# is self-contained. Portal credentials and AI keys are injected at runtime via
# compose `env_file`; they are never copied into the image.

# ---------------------------------------------------------------------------
# Build the React UI (full dev dependencies; no browser download needed).
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS build

# Optional build-time proxy (corporate networks / Docker Desktop). Not baked
# into the runtime image.
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY

WORKDIR /app

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/portal/package.json packages/portal/
RUN HTTP_PROXY=$HTTP_PROXY HTTPS_PROXY=$HTTPS_PROXY NO_PROXY=$NO_PROXY npm ci

COPY . .
RUN npm run build -w @lxp-toolkit/web

# ---------------------------------------------------------------------------
# Runtime: production dependencies, Chromium, LibreOffice, Postgres client.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    HOME=/home/node \
    DEBIAN_FRONTEND=noninteractive

# Docker injects HTTP_PROXY/HTTPS_PROXY into every RUN when they are passed as
# build args; apt must go direct (the proxy is for npm/browser downloads).
RUN unset HTTP_PROXY HTTPS_PROXY NO_PROXY http_proxy https_proxy no_proxy \
    && apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl tini \
      libreoffice-core libreoffice-writer libreoffice-calc libreoffice-impress \
      fonts-liberation fonts-dejavu-core \
      postgresql-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Optional build-time proxy (see the build stage); declared after apt so the
# system package install still goes direct. Not persisted in the image.
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY

# Production dependencies only. `tsx` is a runtime dependency of the server and
# the portal scripts (start, dump, index), hence it lives in `dependencies`.
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/portal/package.json packages/portal/
RUN HTTP_PROXY=$HTTP_PROXY HTTPS_PROXY=$HTTPS_PROXY NO_PROXY=$NO_PROXY \
      npm ci --omit=dev && npm cache clean --force

# Chromium + its OS libraries for the scraper, submit runner and diagram PNGs.
# System deps go direct via apt; the browser download may need the proxy.
RUN http_proxy_saved="$HTTP_PROXY"; https_proxy_saved="$HTTPS_PROXY"; no_proxy_saved="$NO_PROXY"; \
    unset HTTP_PROXY HTTPS_PROXY NO_PROXY http_proxy https_proxy no_proxy; \
    npx playwright install-deps chromium || exit 1; \
    HTTP_PROXY="$http_proxy_saved" HTTPS_PROXY="$https_proxy_saved" NO_PROXY="$no_proxy_saved" \
      npx playwright install chromium || exit 1; \
    rm -rf /var/lib/apt/lists/*

# Source + built UI. `.env` and runtime data are excluded by .dockerignore.
COPY --from=build /app/apps/server ./apps/server
COPY --from=build /app/packages/portal ./packages/portal
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/setup ./setup

# Writable runtime dirs (bind-mounted in local compose, named volumes in prod).
RUN mkdir -p /data/scraped /app/apps/server/data \
    && chown -R node:node /app /data

USER node

EXPOSE 4174

HEALTHCHECK --interval=30s --timeout=5s --start-period=300s --retries=5 \
  CMD curl -fsS http://127.0.0.1:4174/api/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
# Bootstrap applies migrations, imports the catalog when empty and builds the
# UI cache before listening (see apps/server/server/server.ts).
CMD ["npm", "run", "start", "-w", "@lxp-toolkit/server"]
