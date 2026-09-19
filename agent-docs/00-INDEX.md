# Agent knowledge base — UniFOA / Grupoa LXP

This folder is the **machine-readable knowledge base** for an LLM agent working with the
**UniFOA / Grupoa LXP** college portal. Read the relevant file **before** answering or acting on
anything portal-related.

## Read order (fastest path to full context)

1. **`01-overview.md`** — what the portal is, the two systems, how they connect. (3 min)
2. **`02-auth.md`** — how to authenticate; the single most common failure point. (3 min)
3. **`03-api-endpoints.md`** — the full API surface. (5 min)
4. **`04-topic-types.md`** — how course content is classified. (2 min)
5. **`05-data-schemas.md`** — the JSON shapes you'll parse. (5 min)
6. **`06-tooling.md`** — the scripts that already do the work + gotchas. (3 min)
7. **`07-scraped-data.md`** — where already-scraped data lives (read on demand). (2 min)
8. **`08-endpoint-catalog.md`** — the platform's full self-published endpoint surface + feature
   backlog. Read before designing any new feature. (5 min)

Working on the **app** (`apps/server` + `apps/web`) or the **deployment**? Read these instead:

9. **`09-app-architecture.md`** — the product: API routes, data pipeline, Postgres schema, AI
   chain, send bridge, refresh controller, frontend, env vars. (6 min)
10. **`10-deployment.md`** — hybrid Vercel + Oracle topology, auth/secret model, container,
    volumes, cron, TLS, failure modes. (5 min)
11. **`11-operations.md`** — day-2 runbook: commands, backup/restore, upgrade, rotate token,
    debug proxy/SSE. (4 min)

If the task is narrow (e.g. "why did grades come back empty"), read the one relevant file only.
Before building a feature, also open `08-endpoint-catalog.md` + `endpoint-catalog.json`.

## Map of the repo

```
agent-docs/                 ← THIS knowledge base (read this first)
packages/portal/            ← CORE 1: reverse-engineering toolkit
├── src/                    ← TypeScript source (config, client, auth, session, network, content, actions, exercises)
├── scripts/                ← runnable entry points (login, dump, dump-surfaces, crawl-routes, capture-api,
│                              catalog, agent, index, homework, exercises, submit-task, capture-forum,
│                              discover-exams, fetch-exams)
└── docs/                   ← human reverse-engineering notes (committed): auth.md, api-endpoints.md, …
scraped/                    ← YOUR scraped data (gitignored; never commit)
├── courses/{courseId}-{slug}/   ← per-item .md dumps + downloaded files/
├── raw/                    ← content-tree.json, hidden-index.json, homework-index.json,
│                              surfaces.json, topic-types.json …
├── routes/                 ← SPA route DOM captures
└── grades-*.md, calendar.md, notices.md, messages.md, achievements.md, lti-tools.md …
apps/                       ← CORE 2: the LXP Toolkit web app (main product)
├── web/                    ← React UI (Agora, Tarefas, Atividade, Treino, God's Eye, Ajustes)
└── server/                 ← backend API + AI + Postgres (serves the web build)
deploy/                     ← Caddyfile, systemd refresh units, .env.prod.example
Dockerfile                  ← backend image (Node + Chromium + LibreOffice)
docker-compose.prod.yml     ← backend + Postgres stack (Oracle VM)
vercel.json + api/proxy/    ← frontend build + serverless proxy (production)
DEPLOY.md / HOSTING.md      ← deploy reference / friendly pt-BR walkthrough
```

## Golden rules (always true)

- The LXP access token is **single-use / single-page-session**. Never persist it. Always do a
  fresh login. Full page reloads kill it — navigate the SPA with `$nuxt.$router.push()`.
- API base: `https://api.plataforma.grupoa.education`
- `unifoa.lyceum.com.br` is **only** the SSO login gateway. It is not a scrape target.
- Course content is fetched via JSON endpoints; the SPA (Nuxt 3) is just a client.
- **Cloud deploy is split:** the UI + a thin proxy run on Vercel; the API, Playwright scraper,
  LibreOffice and Postgres run on a VM (Docker). The proxy adds `TOOLKIT_TOKEN` server-side, so the
  browser never holds the secret. See `10-deployment.md`.
