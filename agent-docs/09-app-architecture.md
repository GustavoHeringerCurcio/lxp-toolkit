# App architecture — the LXP Toolkit product (`apps/server` + `apps/web`)

This file is the **product** counterpart to the portal knowledge base (files `01`–`08`). Read it
before changing anything under `apps/`, before touching the API, the database, the AI chain, or
the send flow. Portal reverse-engineering (login, endpoints, schemas) stays in `01`–`08`.

> Scope: how the running app works. For where it runs and how it is deployed, see
> `10-deployment.md`; for day-2 commands, `11-operations.md`.

---

## 1. Monorepo map

```
lxp-toolkit/
├── packages/portal/          CORE 1 — the scraper + portal RE toolkit
│   ├── src/                  config, client, auth, session, network, content, actions, exercises
│   └── scripts/              login, dump, dump-surfaces, index, submit-task, agent, homework, …
├── apps/server/              CORE 2 — backend: API, Postgres, AI, send bridge, static server
│   ├── server/server.ts      the single HTTP entrypoint (node:http)
│   ├── src/                  db, import, store, load, project, view, ai, prompt, gate, send, …
│   ├── db/migrations/        0001…0014 versioned SQL (Postgres is the source of truth)
│   └── data/                 runtime outputs (gitignored): exercises.json, send/, previews/, …
├── apps/web/                 React UI (Vite + Tailwind v4), built to apps/web/dist
├── setup/                    `npm run setup` / `npm run doctor` (onboarding + health)
├── scripts/                  sync.mjs, dev.mjs, endpoint-catalog.mjs
├── deploy/                   Caddyfile, systemd units, .env.prod.example
├── api/proxy/[...path].ts    Vercel serverless proxy (production only)
├── Dockerfile                backend image (Node + Chromium + LibreOffice)
├── docker-compose.prod.yml   backend + Postgres stack
├── vercel.json               frontend build + proxy rewrites
├── agent-docs/               THIS knowledge base
├── DEPLOY.md / HOSTING.md    deployment reference / friendly guide
└── scraped/                  per-user scrape output (gitignored)
```

Two cores, one direction of data: `packages/portal` **writes** `scraped/`; `apps/server` **reads**
it into Postgres and serves the UI. The only reverse arrow is the send bridge
(`apps/server/src/send.ts` → `packages/portal/scripts/submit-task.ts` → portal).

---

## 2. Runtime topology (local)

```
┌──────────────────────┐        HTTP /api        ┌──────────────────────────────┐
│ apps/web (Vite :5174)│ ──────────────────────► │ apps/server (node:http :4174)│
└──────────────────────┘                         │  server/server.ts            │
        ▲  /scraped/**                            └──────────────┬───────────────┘
        │                                                          │
        │                          ┌───────────────────────────────┼───────────────────────┐
        │                          ▼                               ▼                       ▼
        │                   Postgres (source of truth)        OpenAI (fetch)      packages/portal
        │                   store.ts / import.ts              ai.ts                submit-task.ts
        │                   exercises.json (UI cache)                              (Playwright)
        └──────────────────────── project.ts
```

`npm run dev` (`scripts/dev.mjs`) starts the API (`tsx server/server.ts`) and Vite together; Vite
proxies `/api` and `/docs` to `127.0.0.1:4174` (`apps/web/vite.config.ts`). `npm run web` builds
the UI and serves `apps/web/dist` from the same server.

**Bootstrap order** (`server.ts::bootstrap`): `healthCheck()` → `runMigrations()` →
`ensureImported()` (only when `content_item` is empty) → `ensureProjection()` (rebuild cache when
`catalogVersion` differs) → `ensureContentText()` → `server.listen(PORT, "0.0.0.0")`.

---

## 3. HTTP API (`apps/server/server/server.ts`)

One `createServer` handler with string-matched routes. Request order at the top:

1. **CORS** — only when `ALLOWED_ORIGIN` is set; answers `OPTIONS` with 204.
2. **`GET /api/health`** — always public `{ ok, time }`.
3. **Auth gate** — every `/api/*` and `/scraped/**` needs `Authorization: Bearer TOOLKIT_TOKEN`
   (or `x-toolkit-token`). No `TOOLKIT_TOKEN` ⇒ local mode (everything allowed). Logic:
   `apps/server/src/auth.ts::isAuthorized`.

### Route table (grouped)

| Group | Routes |
|---|---|
| Catalog / config | `GET /api/exercises`, `GET /api/config`, `GET /api/profile`, `GET /api/organizations` |
| Professor photos | `GET /api/professor-links`, `POST /api/professor-link`, `DELETE /api/professor-link/:id` |
| Answers | `GET /api/answer/:id`, `POST /api/answer`, `POST /api/answer/stream` (SSE), `POST /api/answer/manual`, `POST /api/answer/:id/restore`, `DELETE /api/answer/:id/history` |
| Quality gate | `POST /api/gate` |
| Project context | `GET/POST /api/project-profile`, `GET /api/activity-project/:id`, `POST /api/activity-project`, `POST /api/context/analyze`, `GET /api/activity-abilities/:id`, `POST /api/activity-ability` |
| Project source | `GET/POST /api/project-source`, `POST /api/project-source/fetch`, `POST /api/project-source/file`, `DELETE /api/project-source/file/:id` |
| Flavor / tags | `POST /api/flavor/classify`, `POST /api/tag` |
| Notes / AI request | `POST /api/note`, `POST /api/ai-request` |
| Diagram | `POST /api/diagram` |
| Training | `GET /api/training/subjects`, `GET /api/training/stats`, `POST /api/training/quiz`, `POST /api/training/quiz/:id/complete`, `POST /api/training/study` (SSE) |
| Resumo | `GET /api/summary?courseId=&moduleId=`, `POST /api/summary` (SSE) |
| Send | `GET /api/send/config`, `GET /api/send/preview`, `GET /api/send/:id`, `POST /api/send`, `POST /api/send/upload`, `POST /api/send/artifact` |
| Debug | `GET /api/debug-logs`, `GET /api/debug-log/:id` |
| Refresh | `POST /api/refresh`, `GET /api/refresh/status` |
| Export | `GET /api/export/:id` |
| Files | `GET /api/preview?url=` (Office→PDF), `GET /scraped/**` (local study files) |
| SPA | `/` and `/assets/*` serve `apps/web/dist`; anything else falls back to `index.html` |

`json(res, status, body)` is the JSON helper; `readBody(req)` parses the request body;
`sendStatic(res, file, fallback)` streams files. The web client addresses all of this through
`apps/web/src/api.ts` (`req()` wrapper) plus a few direct `fetch()` calls.

### SSE endpoints

`POST /api/answer/stream` and `POST /api/training/study` write `text/event-stream` manually
(`res.write("data: …\n\n")`) and emit `start` / `delta` / `done` (+ `gate` for answers) / `error`.
The Vercel proxy streams the body through unchanged — do not buffer these.

---

## 4. Data pipeline — `migrate → import → project`

`apps/server/src/load.ts` orchestrates `npm run index:web`:

1. **`migrate.ts` / `db.ts::runMigrations`** — applies `db/migrations/*.sql` in lexical order,
   each in its own transaction, recorded in `schema_migrations`. Idempotent.
2. **`import.ts::importAll`** — reads `scraped/raw/content-tree.json` and upserts the normalized
   catalog by natural key (courses, modules, professors, sections, content items, attachments,
   questions/options). Also reconciles **legacy JSON** (`answers.json`, `submissions.json`,
   `overrides.json`, `profile.json`, `ai-config.json`) exactly once. Includes hidden topics
   (`origin:"hidden"`).
3. **`project.ts::writeProjection`** — reads the `v_exercise_current` view and writes
   `apps/server/data/exercises.json` + projection metadata (`catalogVersion`). The UI reads this
   cache; `ensureProjection` rebuilds it whenever the DB catalog version no longer matches.

**Postgres is the only source of truth.** `exercises.json` is a cache; the legacy JSON files are
never written by the app.

### Schema by migration

| Migration | Adds |
|---|---|
| `0001_foundation` | `institution`, `student`, `enrollment`, `course`, `module`, `professor`, `module_professor`, `section`, `content_item`, `attachment`, `question`, `question_option`, `item_state`, `answer_attempt`, `answer_selection`, `submission`, `submission_payload`, `item_annotation`, `ai_config`, `ai_run`, view `v_exercise_current` |
| `0002_runtime_activity` | runtime answer/submission/override/profile support |
| `0003_training` | `training_quiz`, `training_question`, `training_answer` |
| `0004_content_text` | precomputed `content_text` (material for training/AI) |
| `0005_professor_link` | per-student professor photo (`linkedin_url` / `image_url`) |
| `0006_project_context` | `project_profile` (course main project), `activity_project` (per-activity relevance) |
| `0007_project_source` | external project source (repo/README/files) |
| `0008_flavor_classify` | cached auto-flavor verdict on `item_annotation` |
| `0009_template_fill` | template `.docx` fill metadata |
| `0010_model_roles_and_gate` | per-role models + quality gate result |
| `0011_abilities` | ability toggles |
| `0012_debug_log` | `debug_log` (gate failures, full context) |
| `0013_remove_gradebook_only_items` | cleans phantom gradebook-only items |
| `0014_content_visibility` | `content_item.origin/gradebook_id/is_visible/is_future` (God's Eye) |
| `0015_study_summary` | `study_summary` (saved Resumo per course/module scope) |

Key read model: `v_exercise_current` feeds `/api/exercises` via `view.ts::enrich`.

---

## 5. Runtime store (`apps/server/src/store.ts`)

All runtime writes go straight to Postgres through `store.ts` (no JSON). Representative functions
(used by `server.ts`): `getAnswers`, `getAnswerRecord`, `saveAnswerVersion`, `restoreAnswerVersion`,
`clearAnswerHistory`, `saveAnswerGate`, `getOverrides`, `saveNote`, `saveTag`, `saveAiRequest`,
`saveAutoFlavor`, `getProfile`, `saveProfile`, `getAiConfig`, `saveAiConfig`, `recordAiRun`,
`appendSubmission`, `getSubmissions`, `setManualStatus`, `getProfessorLinks`, `saveProfessorLink`,
`deleteProfessorLink`, `getProjectProfile`, `saveProjectProfile`, `getActivityProject`,
`saveActivityProject`, `getActivityAbilities`, `setActivityAbility`, `getProjectSource`,
`saveProjectSource`, `saveProjectSourceReadme`, `getDebugLog`, `listDebugLogs`.

Rules to preserve:

- `answer_attempt` is **immutable and append-only**; exactly one row per item is `is_current`.
- `item_state` is an append-only snapshot per scrape.
- `submission` records every send attempt with `status` (`running`/`ok`/`already`/`unknown`/`failed`).
- Manual edits (`source:"manual"`) are never overwritten by auto-detection.

---

## 6. Enrichment & identity (`view.ts` and friends)

- **`view.ts::enrich`** turns a projected exercise into the UI DTO: attaches the current saved
  answer + history, overrides, professor photo URL, and extra AI instructions.
- **`professor.ts`** resolves the module's professor from the `moduleTitle` suffix
  ("… - Profa. Débora Amorim") to the stable `safeaUserId`, writing `module_professor`.
  Never key on the display string.
- **`organizations.ts`** matches `apps/server/config/organizations.json` (committed) to local
  `professor` rows; the browser loads avatars from `unavatar.io` (not downloaded server-side).
- **`project-context.ts`** lazily detects the course main project and per-activity relevance with
  the cheapest model, caching in `project_profile` / `activity_project`; a regex pre-pass
  short-circuits obvious cases.
- **`build.ts` / `classify.ts`** assign each upload task a `flavor`
  (`question` | `ghost` | `print`) and `needsReview` heuristically; ambiguous ones get one lazy AI
  verdict cached in `item_annotation.auto_flavor`. Precedence: manual `tag` → cached AI → heuristic.

---

## 7. AI generation chain

| File | Role |
|---|---|
| `prompt.ts` | Builds the two messages: `system` (structured `style` rules + abilities + project block + extra instructions) and `user` (the activity content). Exposes `humanizeQuizAnswer`, `parseQuizSelections`, `composeGhostAnswer`. |
| `ai.ts` | Calls OpenAI with streaming; returns text + provenance (model, tokens, prompt hash). Also `cheapJsonCompletion` for detection. |
| `classify.ts` | Lazy AI review of ambiguous uploads. |
| `gate.ts` | `analyzeDraftQuality` — advisory quality gate over a draft. |
| `training.ts` | Builds the per-subject knowledge pack (catalog + bank + `content_text`) and generates practice quizzes / streamed study guides. |
| `summary.ts` | `Resumo`: chunk-aware map-reduce summary of a subject (streamed), persisted via `summary-store.ts`. |
| `project-context.ts` | Project detection/merge for the prompt. |
| `template.ts` / `docx.ts` / `usecase.ts` | Template `.docx` detection, use-case parsing, filled-document rendering. |
| `diagram.ts` / `diagram-tool.ts` | UML diagram spec + rasterization. |

`server.ts::generateAndSave` is the orchestrator: resolves project context → builds extra
instructions → `generateAnswer` → saves an immutable `answer_attempt` (with model + prompt hash) →
records an `ai_run` → runs the gate detached (streamed to the client as a `gate` event). Model
**roles** (generation, detection, classification, diagram, gate, training) live in `ai_config`.

Prompt rules are documented in `apps/server/docs/PROMPT.md`. `DEFAULT_STYLE` exists in **two**
places (`apps/server/src/config.ts` and `apps/web/src/lib/prompt-preview.ts`) — keep them in sync.

---

## 8. Send bridge (the only write path to the portal)

```
POST /api/send ──► send.ts::launch*Submit ──► spawn tsx packages/portal/scripts/submit-task.ts
                       writes req-<id>-<ts>.json         (fresh login + SPA navigation)
                       reads  res-<id>-<ts>.json   ◄──── Playwright attaches/selects/confirms
                       persists `submission` (Postgres)
```

- `sendEnv()` gates the feature: it checks the portal package, the runner script, Playwright, and
  `tsx`; if any is missing the API returns `503` with a reason.
- Actions: `upload` (text/`.txt`/`.pdf`/`.docx`/`image`/`fill`), `quiz` (option ids), `forum`
  (enrollment-scoped post + SPA composer fallback), `mark` (progress POST).
- On `ok`/`already` the server writes `manual_status='done'`; the UI shows it as completed.
- Nothing auto-submits — the confirmation modal is the gate.

The portal runner details (selectors, endpoints, WAF) are in `06-tooling.md` and
`packages/portal/docs/gaps.md`.

---

## 9. Refresh controller (`apps/server/src/refresh.ts`)

Owns the scrape→index pipeline used by the **Atualizar** button and by cron:

```
dump → dump-surfaces → index → index:web
```

- Refuses a concurrent run (`start()` returns `false` while running).
- Retries the scrape **once headful** when the log matches `/reCAPTCHA/` (for the UI/terminal case;
  a headless cloud server can't show the window).
- Keeps the last ~8 KB of output in `status().log`; `GET /api/refresh/status` exposes
  `{ running, step, error, startedAt, finishedAt, log }`.

`scripts/sync.mjs` runs the same steps locally plus Docker/migrations, hard-failing on any step.
`scripts/dev.mjs` starts API + Vite without scraping.

---

## 10. Frontend (`apps/web`)

- React 18 + Vite 5 + Tailwind v4; design system in `apps/web/DESIGN.md` ("Folio").
- Routes: `/` (Agora), `/tarefas`, `/progresso`, `/tarefa/:id`, `/treino/quiz`, `/treino/estudo`,
  `/treino/resumo`, `/gods-eye`, `/ajustes`, `/design`.
- All API calls go through `src/api.ts::req()` (relative `/api/...`), so the same build works
  behind the Vite proxy (dev), the Node server (prod), and the Vercel proxy (cloud). `src/lib/files.ts`
  builds file preview URLs (`/api/preview?url=…` for Office, direct CDN URL for PDFs).
- Streaming uses `fetch` + `ReadableStream` (not `EventSource`), which is why the Vercel proxy must
  preserve streaming.

---

## 11. Environment variables

| Variable | Package | Required | Purpose |
|---|---|---|---|
| `LXP_LOGIN_URL`, `LXP_USERNAME`, `LXP_PASSWORD` | portal | for scrape | Lyceum SSO credentials |
| `LXP_URL`, `API_BASE` | portal | no | portal/API bases |
| `OUT_DIR` | portal | no | scrape output (default `scraped`; in Docker `/data/scraped`) |
| `HEADFUL`, `PLAYWRIGHT_NO_SANDBOX`, `LOG_LEVEL`, `TZ` | portal | no | browser/run behavior |
| `OPENAI_API_KEY` | server | for AI | generation/classification/gate/training |
| `DATABASE_URL` | server | **yes** | Postgres connection (no JSON fallback) |
| `DATA_DIR` | server | no | scraped data location (Docker `/data/scraped`) |
| `PORT` | server | no | HTTP port (default `4174`) |
| `TOOLKIT_TOKEN` | server | in cloud | shared secret for the API/scraped files |
| `ALLOWED_ORIGIN` | server | no | enables CORS for direct browser calls |
| `SOFFICE_BIN` | server | no | LibreOffice binary for PDF/Office previews |
| `GITHUB_TOKEN` | server | no | fetch private project READMEs |
| `BACKEND_URL`, `TOOLKIT_TOKEN` | Vercel | in cloud | proxy target + secret |

---

## 12. Verification & tests

```bash
npm run typecheck     # all workspaces
npm test              # server + web + portal suites
npm run doctor        # machine preflight (Node, Chromium, Postgres, Docker, LibreOffice, ports)
npm run build         # builds the web app
```

Server tests live in `apps/server/test/`; the auth gate is covered by
`apps/server/test/auth.test.ts`. Portal tests are in `packages/portal/src/*.test.ts`. Web tests use
Testing Library. CI (`.github/workflows/ci.yml`) runs typecheck + tests against a Postgres service.
