# Tooling — how to run things

## Environment

```bash
npm install
npx playwright install chromium
cp .env.example .env    # then fill LXP_USERNAME (RA) and LXP_PASSWORD
```

`.env` keys: `LXP_LOGIN_URL`, `LXP_USERNAME`, `LXP_PASSWORD`, `LXP_URL`, `API_BASE`, `TZ`,
`LOG_LEVEL`, `HEADFUL`, `OUT_DIR`. The API base defaults to
`https://api.plataforma.grupoa.education`; `OUT_DIR` defaults to `scraped` (gitignored).

## Scripts (`npm run <name>`)

| Script | File | What it does |
|---|---|---|
| `login` | `scripts/login.ts` | interactive login; saves a session to `data/storageState.json` (legacy; scripts re-login each run anyway) |
| `dump` | `scripts/dump-content.ts` | scrape all your course content (quizzes, uploads, links) + download attachments → `scraped/courses/**` + `scraped/raw/content-tree.json` |
| `dump-surfaces` | `scripts/dump-surfaces.ts` | scrape grades, calendar, notices, messages, achievements, communities, LTI → `scraped/*.md` + `scraped/raw/surfaces.json` |
| `crawl-routes` | `scripts/crawl-routes.ts` | capture SPA pages via client-side nav → `scraped/routes/**` + `scraped/portal-map.md` |
| `capture-api` | `scripts/capture-api.ts` | record network traffic → `scraped/api-captured.md` + `scraped/raw/api-calls.json` |
| `agent` | `scripts/agent.ts` | list actionable items; `--read`/`--complete` auto-completes undone readings **and** all "Mark as completed" content (pdf/link/rich); `--dry-run` previews |
| `index` | `scripts/build-homework-index.ts` | build `scraped/raw/homework-index.json` (topic-linked: upload ↔ section ↔ sibling content ↔ local files) |
| `homework` | `scripts/homework.ts` | friendly terminal board of open homework (grouped by section, sorted by due date); `--fresh`, `--json` |
| `exercises` | `scripts/exercises.ts` | read-only: `npm run exercises -- <itemId>` prints a quiz's questions or an upload's info |
| `submit-task` | `scripts/submit-task.ts` | gated browser runner (spawned by the assistant's `/api/send`): fresh login → SPA-nav to the task → deliver the answer. Uploads support `text` (typed into the portal's rich-text reply editor), `txt` and `pdf` attachments; quizzes select options. |
| `typecheck` | — | `tsc --noEmit` (run after any code change) |

## Architecture (src/)

| File | Role |
|---|---|
| `config.ts` | env loading (zod) + pino logger (redacts secrets) |
| `client.ts` | `ApiClient` — authenticated `fetch` with retry/backoff + exact headers |
| `auth.ts` | Lyceum login → token extraction → `waitForExchangedToken` |
| `session.ts` | `createSession()` — launch Chromium, always fresh-login, return `{browser,context,page,client,auth}` |
| `network.ts` | `NetworkRecorder` — capture API traffic (redacts auth/cookie headers) |
| `content.ts` | `fetchCourses`, `collectContent` (tree walk), `classify`, parse helpers |
| `exercises.ts` | read helpers (`fetchQuiz`, `fetchUploadTask`) + safe write-side stubs (`submitAnswer`, `uploadFile`) that throw until the submit endpoint is captured |
| `actions.ts` | `markRead` (progress POST), `downloadPdf` |
| `markdown.ts`, `util.ts` | html→md, slugify, sanitize, io helpers |

## Prefer the offline index

`scraped/raw/homework-index.json` (built by `npm run index`) links every open assignment to its
section, sibling content, and local files. Read it instead of re-scraping. `npm run homework` is
the friendly terminal board; the browser UI is the LXP Homework (`npm run web` inside `assistant/`).


## The three gotchas that WILL bite you

1. **Never `page.goto` the LXP** after login — full reload kills the single-use token and the SPA
   redirects to `/auth/signin`. Use client-side navigation:
   ```js
   await page.evaluate((p) => window.$nuxt?.$router.push(p), "/course/<courseId>/content/<itemId>");
   ```
2. **`tsx` + `page.evaluate`** throw `ReferenceError: __name is not defined` because tsx/esbuild
   transpiles with `keepNames`. `createSession()` already injects a global `__name` shim, so any
   `page.evaluate` under a session is safe. Standalone Playwright scripts must add the shim too.
3. **AWS WAF** fronts the API (`aws-waf-token` cookie + `awswaf_session_storage`). GET reads work
   with the bearer token alone; **writes (POST/PUT) may require a real browser to solve the WAF
   challenge** — drive writes through Playwright, not native fetch.

## Anti-patterns / notes

- `storageState.json` (in `data/`) is useless for auth now — always fresh-login.
- `page.goto` works fine on the **Lyceum** domain (it's a normal multi-page-ish Angular SPA); the
  restriction is only about the LXP Nuxt app.
- Running repeated logins back-to-back can occasionally hit a reCAPTCHA; wait or solve it once.
- `docs/PLAN.md` is the original plan and contains some now-outdated guesses (e.g. Microsoft SAML
  redirect) — trust `agent-docs/02-auth.md` over PLAN.md §2.1.

## Legitimate use

This tooling reads your own academic data. Auto-submitting quizzes/assignments to fake completion
is **not** part of this tooling and is a separate academic-integrity decision — see
`docs/gaps.md` for what the (unautomated) write side would require.
