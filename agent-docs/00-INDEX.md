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

If the task is narrow (e.g. "why did grades come back empty"), read the one relevant file only.

## Map of the repo

```
agent-docs/         ← THIS knowledge base (read this first)
docs/                ← human reverse-engineering notes (committed)
├── auth.md, api-endpoints.md, topic-types.md, gaps.md, README.md, PLAN.md
scraped/             ← YOUR scraped data (gitignored; never commit)
├── courses/{courseId}-{slug}/   ← per-item .md dumps + downloaded files/
├── raw/            ← content-tree.json, homework-index.json, surfaces.json, topic-types.json …
├── routes/         ← SPA route DOM captures
└── grades-*.md, calendar.md, notices.md, messages.md, achievements.md, lti-tools.md …
src/                ← TypeScript source (config, client, auth, session, network, content, actions, exercises)
scripts/            ← runnable entry points (login, dump, dump-surfaces, crawl-routes, capture-api,
                      agent, index, homework, exercises)
assistant/          ← LXP Homework: CLI + web app (npm run web inside assistant/)
```

## Golden rules (always true)

- The LXP access token is **single-use / single-page-session**. Never persist it. Always do a
  fresh login. Full page reloads kill it — navigate the SPA with `$nuxt.$router.push()`.
- API base: `https://api.plataforma.grupoa.education`
- `unifoa.lyceum.com.br` is **only** the SSO login gateway. It is not a scrape target.
- Course content is fetched via JSON endpoints; the SPA (Nuxt 3) is just a client.
