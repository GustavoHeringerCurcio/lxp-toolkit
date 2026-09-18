# Tooling — how to run things

## Environment

```bash
npm install
npx playwright install chromium
cp packages/portal/.env.example packages/portal/.env    # then fill LXP_USERNAME (RA) and LXP_PASSWORD
```

`.env` keys: `LXP_LOGIN_URL`, `LXP_USERNAME`, `LXP_PASSWORD`, `LXP_URL`, `API_BASE`, `TZ`,
`LOG_LEVEL`, `HEADFUL`, `OUT_DIR`. The API base defaults to
`https://api.plataforma.grupoa.education`; `OUT_DIR` defaults to `scraped` (gitignored).

## Scripts

Everything below is a `npm run <name>` unless the row says `npx tsx`.

| Script | File | What it does |
|---|---|---|
| `login` | `packages/portal/scripts/login.ts` | interactive login; saves a session to `data/storageState.json` (legacy; scripts re-login each run anyway) |
| `dump` | `packages/portal/scripts/dump-content.ts` | scrape all your course content (quizzes, uploads, links, **forum threads**) + download attachments → `scraped/courses/**` + `scraped/raw/content-tree.json`; also harvests hidden topics → `scraped/raw/hidden-index.json` (`SKIP_HARVEST=1` to skip) |
| `dump-surfaces` | `packages/portal/scripts/dump-surfaces.ts` | scrape grades, calendar, notices, messages, achievements, communities, LTI → `scraped/*.md` + `scraped/raw/surfaces.json` |
| `crawl-routes` | `packages/portal/scripts/crawl-routes.ts` | capture SPA pages via client-side nav → `scraped/routes/**` + `scraped/portal-map.md` |
| `capture-api` | `packages/portal/scripts/capture-api.ts` | record network traffic → `scraped/api-captured.md` + `scraped/raw/api-calls.json` |
| `catalog` | `scripts/endpoint-catalog.mjs` | normalize the platform's `features[]` manifest from a captured `users/me` response → `agent-docs/endpoint-catalog.json` (the full endpoint surface; see `08-endpoint-catalog.md`) |
| `npx tsx …/capture-forum.ts` | `packages/portal/scripts/capture-forum.ts` | headful forum capture that finishes by itself (no Enter): polls until a write request is seen → `scraped/forum-captured.md` + `scraped/raw/api-calls-forum.json` |
| `npx tsx …/capture-forum-write.ts` | `packages/portal/scripts/capture-forum-write.ts` | forum write-discovery: dumps the thread via the read action, spy-wraps all forum Vuex actions, waits for a manual UI post → `scraped/raw/forum-write-spy.json` + `api-calls-forum-write.json` |
| `npx tsx …/discover-exams.ts` | `packages/portal/scripts/discover-exams.ts` | sweep topic ids to discover exam/assessment topics → `scraped/raw/exam-scan.json` |
| `npx tsx …/fetch-exams.ts` | `packages/portal/scripts/fetch-exams.ts` | fetch the full content of the topics discovered by `discover-exams.ts` → `scraped/raw/exams.json` |
| `agent` | `packages/portal/scripts/agent.ts` | list actionable items; `--read`/`--complete` auto-completes undone readings **and** all "Mark as completed" content (pdf/link/rich); `--dry-run` previews |
| `index` | `packages/portal/scripts/build-homework-index.ts` | build `scraped/raw/homework-index.json` (topic-linked: upload ↔ section ↔ sibling content ↔ local files) |
| `homework` | `packages/portal/scripts/homework.ts` | friendly terminal board of open homework (grouped by section, sorted by due date); `--fresh`, `--json` |
| `exercises` | `packages/portal/scripts/exercises.ts` | read-only: `npm run exercises -- <itemId>` prints a quiz's questions or an upload's info |
| `submit-task` | `packages/portal/scripts/submit-task.ts` | gated browser runner (spawned by the server's `/api/send`): fresh login → SPA-nav to the task → deliver the answer. Uploads support `text` (typed into the portal's rich-text reply editor), `txt` and `pdf` attachments; quizzes select options; **forums** publish via the enrollment-scoped post endpoint (verified by re-reading the thread) with an SPA-composer fallback. |
| `sync` | `scripts/sync.mjs` | Full refresh: Postgres up → migrations → `dump` → `dump-surfaces` → `index` (portal) → `index:web`. Hard-fails on any step; `SKIP_SYNC=1` (skip all) / `SKIP_DUMP=1` (local index only) to bypass. |
| `dev` | `scripts/dev.mjs` | Fast local dev: API (`tsx server/server.ts`) + Vite HMR together → <http://localhost:5174>. No scrape. |
| `dev:fresh` | `scripts/dev.mjs --sync` | Runs `sync` first, then the dev servers. |
| `web` | `apps/server` | Runs `sync` via `preweb` → builds `apps/web` → serves static → <http://localhost:4174>. |
| `typecheck` | — | `tsc --noEmit` (run after any code change) |

The web app's **"Atualizar"** button (`apps/server/src/refresh.ts`) runs the same pipeline as
`sync` (minus Docker/migrations): `dump` → `dump-surfaces` → portal `index` → `index:web`, with a
headful reCAPTCHA retry.

## Content tree is the only catalog source

The content tree (`/v2/.../academics-main/{courseId}/contents`) is the scraper's source. The
portal can list a graded activity under **Notas** (`/v1/plataforma/grades/me/course/{id}`) before
(or without) publishing it in the content tree, but the gradebook is **not** merged into the task
list: it is only dumped to the human-readable `scraped/grades-*.md` surfaces. An activity appears
in the app only once the portal publishes the real topic.

> Earlier versions reconciled the gradebook into the catalog (synthetic `origin: "gradebook"`
> items grouped under fake modules named after gradebook categories). That was removed — the
> phantom modules (`AVD1`, `Atividades Formativas 1`, …) are cleaned up by migration `0013`.

## God's Eye — hidden topics

The topic-detail read endpoint does **not** enforce visibility: it returns content for a topic id
even when the topic is absent from the student's tree. `npm run dump` therefore runs
`content.ts::harvestHiddenTopics` after the tree walk: it scans the id gaps inside the dense
clusters of tree ids (plus a margin) and keeps every 200 that is not already in the tree, appending
it with `origin:"hidden"`, `gradebookId` (from `context.gradeBookId`) and the `isVisible`/`isFuture`
flags. Results are cached in `scraped/raw/hidden-index.json`; a re-run only scans new ids and drops
harvested items that the portal later publishes. Skip the sweep with `SKIP_HARVEST=1`.

Hidden items flow through import/projection (migration `0014_content_visibility.sql` adds
`origin`/`gradebook_id`/`is_visible`/`is_future` to `content_item`) but are **excluded from the
normal task lists** and surfaced read-only at the web route `/gods-eye`.

## Architecture (packages/portal/src/)

| File | Role |
|---|---|
| `config.ts` | env loading (zod) + pino logger (redacts secrets) |
| `client.ts` | `ApiClient` — authenticated `fetch` with retry/backoff + exact headers |
| `auth.ts` | Lyceum login → token extraction → `waitForExchangedToken` |
| `session.ts` | `createSession()` — launch Chromium, always fresh-login, return `{browser,context,page,client,auth}` |
| `network.ts` | `NetworkRecorder` — capture API traffic (redacts auth/cookie headers) |
| `content.ts` | `fetchCourses`, `collectContent` (tree walk), `classify`, parse helpers |
| `exercises.ts` | read helpers (`fetchTopic`, `fetchQuiz`, `fetchUploadTask`) + write-side stubs (`submitAnswer`, `uploadFile`) that intentionally throw — real writes go through `scripts/submit-task.ts` (the SPA store path), not native fetch |
| `actions.ts` | `markRead` (progress POST), `downloadPdf` |
| `markdown.ts`, `util.ts` | html→md, slugify, sanitize, io helpers |

## Architecture (apps/server/src/)

| File | Role |
|---|---|
| `db.ts`, `migrate.ts` | Postgres pool + versioned SQL migrations (`db/migrations/`) |
| `import.ts` | content tree → Postgres (idempotent); one-time reconciliation of legacy JSON |
| `store.ts` | runtime read/write layer (answers, submissions, overrides, profile, `ai_config`, `ai_run`) |
| `load.ts`, `project.ts` | `migrate → import → project` → `data/exercises.json` cache + `catalogVersion` |
| `view.ts` | enriches each activity (saved answer, override, professor photo, extra AI instructions) |
| `professor.ts`, `organizations.ts` | stable professor identity + photo directory matching |
| `project-context.ts` | per-course project + per-activity relevance detection (cached) |
| `prompt.ts`, `ai.ts` | compile `system` + `user` messages; stream OpenAI + provenance in `ai_run` |
| `classify.ts`, `build.ts` | flavor detection + lazy AI review of ambiguous uploads |
| `gate.ts` | quality gate over a draft before sending |
| `training.ts`, `training-store.ts` | training packs + persisted quiz sessions |
| `diagram.ts`, `diagram-tool.ts` | diagram generation |
| `send.ts` | spawns the portal `submit-task.ts` runner; persists `submission` |
| `config.ts` | **legacy** JSON reader used only by `import.ts` and tests |

## Prefer the offline index

`scraped/raw/homework-index.json` (built by `npm run index`) links every open assignment to its
section, sibling content, and local files. Read it instead of re-scraping. `npm run homework` is
the friendly terminal board; the browser UI is the LXP Toolkit web app — `npm run dev` (Vite HMR,
<http://localhost:5174>, fast/no scrape) or `npm run dev:fresh` (syncs first).


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

## Legitimate use

This tooling reads your own academic data. Auto-submitting quizzes/assignments to fake completion
is **not** part of this tooling and is a separate academic-integrity decision — see
`packages/portal/docs/gaps.md` for what the (unautomated) write side would require.
