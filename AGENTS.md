# lxp-toolkit — UniFOA / Grupoa LXP

This monorepo reverse-engineers the **Grupoa LXP** learning platform
(`unifoa2.grupoa.education` + `api.plataforma.grupoa.education`), which the student reaches
through Lyceum SSO (`unifoa.lyceum.com.br`), and ships the **Pauta** web app on top of it.

Two cores:

- **`packages/portal/`** — the reverse-engineering toolkit (scraper). Human notes live in
  `packages/portal/docs/`.
- **`apps/web/` + `apps/server/`** — the **Pauta** web app (main product; design system in
  `apps/web/DESIGN.md`).

**Before doing any portal-related task (auth, scraping, API calls, automations), read the
knowledge base in `agent-docs/` — start with `00-INDEX.md`.** `agent-docs/` is the distilled
context an agent needs; `packages/portal/docs/` holds the human reverse-engineering notes.
Per-user scraped output lives in the gitignored `scraped/` folder (never commit it).

## Quick facts

- The LXP bearer token is single-use/single-page-session → always fresh-login; navigate the SPA
  with `$nuxt.$router.push()`, never `page.goto`.
- API base: `https://api.plataforma.grupoa.education`. `unifoa.lyceum.com.br` is login-only.
- Each user logs in with their own `.env` credentials and scrapes their own enrolled courses.
- Commands (run from the repo root; they delegate to the workspaces): `npm run setup`
  (interactive onboarding: deps + browser + env files), `npm run doctor` (health check),
  `npm run dump`, `npm run dump-surfaces`, `npm run crawl-routes`, `npm run capture-api`,
  `npm run agent`, `npm run homework`, `npm run exercises`, `npm run index`, `npm run index:web`,
  `npm run web`. Run `npm run typecheck` after code changes.
- `scraped/raw/homework-index.json` (built by `npm run index`) links each open assignment to its
  section + sibling content + local files — prefer it over re-scraping. The web UI is
  `npm run web` (serves `apps/web` via `apps/server`).
