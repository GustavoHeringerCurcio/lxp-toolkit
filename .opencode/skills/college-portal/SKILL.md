---
name: college-portal
description: Use when working with or answering questions about the UniFOA/Grupoa LXP college portal, its JSON API, scraping, or automation. Triggers on: unifoa, grupoa, lxp, lyceum, plataforma, course content, grades, calendar, notices, quiz, enrollment, assignment, scraping. Read the agent-docs/ knowledge base before acting.
---

# College Portal (UniFOA / Grupoa LXP)

This repo is about the **UniFOA / Grupoa LXP** learning platform. Before doing ANYTHING else —
answering, writing code, or running a scrape — read the knowledge base so you work from the real
reverse-engineered facts, not assumptions.

## Mandatory first step

1. Read `agent-docs/00-INDEX.md` (the map).
2. Read the file(s) relevant to the task:
   - `agent-docs/01-overview.md` — what the portal is (Lyceum = login only; LXP = the platform).
   - `agent-docs/02-auth.md` — authentication. **Read this before any login/scrape task.**
   - `agent-docs/03-api-endpoints.md` — the API surface.
   - `agent-docs/04-topic-types.md` — content classification.
   - `agent-docs/05-data-schemas.md` — JSON payload shapes.
   - `agent-docs/06-tooling.md` — the scripts + gotchas.
   - `agent-docs/07-scraped-data.md` — already-scraped data (prefer reading it over re-scraping).

If scraped data already answers the question (`docs/`), use it instead of hitting the live API.

## Critical facts — never forget these

- **The LXP bearer token is single-use / single-page-session.** Never save and reuse it. Always do
  a fresh login through `unifoa.lyceum.com.br`. A full `page.goto` reload on the LXP kills the
  token → the SPA redirects to `/auth/signin`.
- **Navigate the LXP SPA with `$nuxt.$router.push(path)`, never `page.goto`.**
- API base: `https://api.plataforma.grupoa.education`. Headers: `authorization`,
  `accept: application/json`, `x-user-timezone: America/Sao_Paulo`,
  `x-notice-show-modal: false`.
- Login is **direct** on Lyceum (username = RA). No Microsoft SAML redirect for this tenant.
- The API is behind AWS WAF: GET reads work with the token; writes (POST/PUT) likely need a real
  browser to solve the challenge.
- `src/session.ts::createSession()` returns `{ client, page, auth, … }` and always fresh-logins —
  prefer it over hand-rolled auth.

## After reading the docs

Answer from the actual documented facts (auth flow, endpoint list, schemas, scraped data
locations). If you intend to write code, match the repo conventions (`src/*.ts`, ESM with `.js`
import specifiers, run `npm run typecheck`). Prefer extending the existing scripts
(`dump-content`, `dump-surfaces`, `agent`) over new parallel tools.
