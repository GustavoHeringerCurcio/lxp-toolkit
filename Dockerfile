# LXP Toolkit backend — API + Playwright scraper + LibreOffice conversion.
#
# The web UI is deployed separately (Vercel); this image serves the API and the
# `/scraped/**` files, runs the scrape/submit runners, and talks to Postgres.
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    DEBIAN_FRONTEND=noninteractive

# LibreOffice (PDF delivery + Office previews), fonts, curl (cron/health),
# postgresql-client (pg_dump/restore) and tini (signal handling).
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl tini \
      libreoffice-core libreoffice-writer libreoffice-calc libreoffice-impress \
      fonts-liberation fonts-dejavu-core \
      postgresql-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install the workspace dependencies first (best Docker layer caching).
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/portal/package.json packages/portal/
RUN npm ci

# Chromium + its system libraries for the scraper and submit runner.
RUN npx playwright install --with-deps chromium && rm -rf /var/lib/apt/lists/*

# The rest of the monorepo (see .dockerignore for what is excluded).
COPY . .

EXPOSE 4174

ENTRYPOINT ["/usr/bin/tini", "--"]
# Bootstrap applies migrations, imports the catalog when empty and builds the
# UI cache before listening (see apps/server/server/server.ts).
CMD ["npm", "run", "start", "-w", "@lxp-toolkit/server"]
