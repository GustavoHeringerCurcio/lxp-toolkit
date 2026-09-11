# UniFOA / Grupoa LXP — portal scraper & knowledge

This repo reverse-engineers the **Grupoa LXP** learning platform
(`unifoa2.grupoa.education` + `api.plataforma.grupoa.education`), which the student reaches
through Lyceum SSO (`unifoa.lyceum.com.br`).

**Before doing any portal-related task (auth, scraping, API calls, automations), read the
knowledge base in `agent-docs/` — start with `00-INDEX.md`.** The `docs/` folder holds the
human reverse-engineering notes; `agent-docs/` is the distilled context an agent needs. Per-user
scraped output lives in the gitignored `scraped/` folder (never commit it).

## Quick facts

- The LXP bearer token is single-use/single-page-session → always fresh-login; navigate the SPA
  with `$nuxt.$router.push()`, never `page.goto`.
- API base: `https://api.plataforma.grupoa.education`. `unifoa.lyceum.com.br` is login-only.
- Each user logs in with their own `.env` credentials and scrapes their own enrolled courses.
- Commands: `npm run dump`, `npm run dump-surfaces`, `npm run crawl-routes`,
  `npm run capture-api`, `npm run agent`, `npm run homework`, `npm run exercises`.
  Run `npm run typecheck` after code changes.
- `scraped/raw/homework-index.json` (built by `npm run index`) links each open assignment to its
  section + sibling content + local files — prefer it over re-scraping. The friendly UIs live in
  `assistant/` (CLI + web app, `npm run web` inside `assistant/`).
