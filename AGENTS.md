# lxp-toolkit — UniFOA / Grupoa LXP

This monorepo reverse-engineers the **Grupoa LXP** learning platform
(`unifoa2.grupoa.education` + `api.plataforma.grupoa.education`), which the student reaches
through Lyceum SSO (`unifoa.lyceum.com.br`), and ships the **LXP Toolkit** web app on top of it.

Two cores:

- **`packages/portal/`** — the reverse-engineering toolkit (scraper). Human notes live in
  `packages/portal/docs/`.
- **`apps/web/` + `apps/server/`** — the **LXP Toolkit** web app (main product; design system in
  `apps/web/DESIGN.md`).

**Before doing any portal-related task (auth, scraping, API calls, automations), read the
knowledge base in `agent-docs/` — start with `00-INDEX.md`.** `agent-docs/` is the distilled
context an agent needs; `packages/portal/docs/` holds the human reverse-engineering notes.
Per-user scraped output lives in the gitignored `scraped/` folder (never commit it).

## Where to read (by task)

| Task | Read first |
|---|---|
| Portal auth / API / scraping | `agent-docs/00-INDEX.md` → `01`–`08` |
| App internals (`apps/server`/`apps/web`), DB, AI, send | `agent-docs/09-app-architecture.md` |
| Hosting / topology / limits / secrets | `agent-docs/10-deployment.md` (+ `HOSTING.md` for humans) |
| Day-2 ops: commands, backup, upgrade, debug | `agent-docs/11-operations.md` |
| Design system / components | `apps/web/DESIGN.md` |
| Prompt rules sent to the model | `apps/server/docs/PROMPT.md` |

**Cloud deploy is split (hybrid).** The static UI + a thin proxy (`api/proxy/[...path].ts`,
`vercel.json`) run on Vercel; the API, Playwright scraper, LibreOffice and Postgres run on a VM
(`Dockerfile` + `docker-compose.prod.yml`, Oracle Cloud Always Free). The browser only resolves
`*.vercel.app`; the proxy injects `TOOLKIT_TOKEN` server-side so the secret never ships to the
client. `/api/*` and `/scraped/**` are gated by `apps/server/src/auth.ts`; `/api/health` is public.
Full detail: `agent-docs/10-deployment.md`.

## Quick facts

- The LXP bearer token is single-use/single-page-session → always fresh-login; navigate the SPA
  with `$nuxt.$router.push()`, never `page.goto`.
- API base: `https://api.plataforma.grupoa.education`. `unifoa.lyceum.com.br` is login-only.
- Each user logs in with their own `.env` credentials and scrapes their own enrolled courses.
- **Postgres is the source of truth** (local, per-user, `DATABASE_URL` gitignored; no JSON
  fallback). `npm run db:up` starts it via Docker, `npm run db:migrate` applies
  `apps/server/db/migrations/`. `npm run index:web` runs `migrate → import → project`, writing
  the UI cache `apps/server/data/exercises.json`. Schema details: `agent-docs/05-data-schemas.md`.
- **Runtime activity writes straight to Postgres** via `apps/server/src/store.ts` (answers,
  submissions, overrides, profile, AI config, `ai_run`). `answers.json`/`submissions.json`/
  `overrides.json`/`profile.json` are **legacy** (read once by `import.ts`; never written).
  `exercises.json` is a cache invalidated by its `catalogVersion`.
- Commands (run from the repo root; they delegate to the workspaces): `npm run setup`
  (interactive onboarding: deps + browser + env files + database), `npm run doctor` (health check),
  `npm run db:up`, `npm run db:migrate`, `npm run dump`, `npm run dump-surfaces`,
  `npm run crawl-routes`, `npm run capture-api`, `npm run catalog` (regenerate the endpoint
  catalog from a captured `users/me` manifest), `npm run agent`, `npm run homework`,
  `npm run exercises`, `npm run index`, `npm run index:web`, `npm run sync`, `npm run dev`,
  `npm run dev:fresh`, `npm run web`. `npm run dev` (Vite HMR) is fast (no scrape);
  `npm run dev:fresh` runs `sync` first; `npm run web` (built) refreshes via `preweb`. Skip with
  `SKIP_SYNC=1` (or `SKIP_DUMP=1`). Run
  `npm run typecheck` after code changes.
- **Full refresh = `dump` → `dump-surfaces` → `index` → `index:web`** (that's what `sync`,
  `dev:fresh`, `web`'s `preweb`, and the web app's **"Atualizar"** button run). The content tree is
  the only source for the catalog; the gradebook is dumped separately for the human-readable
  `scraped/grades-*.md` surfaces, not merged into the task list.
- **God's Eye (hidden topics):** the portal's topic-detail endpoint serves content by id even when
  the topic is absent from the student's content tree. `npm run dump` harvests those topics
  (`content.ts::harvestHiddenTopics`, cached in `scraped/raw/hidden-index.json`) and appends them
  with `origin:"hidden"`. They flow through import/projection but are kept **out of the normal
  lists** and surfaced read-only at the web route `/gods-eye`. Skip the sweep with
  `SKIP_HARVEST=1`; the columns live in migration `0014_content_visibility.sql`.
- `scraped/raw/homework-index.json` (built by `npm run index`) links each open assignment to its
  section + sibling content + local files — prefer it over re-scraping. The web UI is
  `npm run dev` (serves `apps/web` via Vite + `apps/server`) or `npm run web` (built static).
- **Verify changes with `npm run typecheck` and `npm test`** (server + web + portal suites). The
  auth gate is covered by `apps/server/test/auth.test.ts`; `npm run doctor` checks the machine.
- **Never commit** `.env`, `scraped/`, `data/`, or `deploy/.env.prod` — all gitignored, all
  personal/secret.
