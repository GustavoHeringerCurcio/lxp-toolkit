# UniFOA / Grupoa LXP — portal scraper & knowledge

This repo reverse-engineers the **Grupoa LXP** learning platform
(`unifoa2.grupoa.education` + `api.plataforma.grupoa.education`), which the student reaches
through Lyceum SSO (`unifoa.lyceum.com.br`).

**Before doing any portal-related task (auth, scraping, API calls, automations), read the
knowledge base in `agent-docs/` — start with `00-INDEX.md`.** The docs under `docs/` hold the
scraped data and human notes; `agent-docs/` is the distilled context an agent needs.

## Quick facts

- The LXP bearer token is single-use/single-page-session → always fresh-login; navigate the SPA
  with `$nuxt.$router.push()`, never `page.goto`.
- API base: `https://api.plataforma.grupoa.education`. `unifoa.lyceum.com.br` is login-only.
- Course: `5254272` "PROGRAMAÇÃO BACK-END", 145 items, 8 quizzes, 35 file-uploads.
- Commands: `npm run dump`, `npm run dump-surfaces`, `npm run crawl-routes`,
  `npm run capture-api`, `npm run agent`, `npm run homework`, `npm run exercises`.
  Run `npm run typecheck` after code changes.
- `docs/raw/homework-index.json` (built by `npm run index`) links each open assignment to its
  section + sibling content + local files — prefer it over re-scraping. The friendly UIs live in
  `assistant/` (CLI + web app, `npm run web` inside `assistant/`).
