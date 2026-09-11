# Webscraping + Control — Unifoa Lyceum / Grupoa LXP

> **Status:** PLAN (approved)
> **Goal:** Map, scrape, and document *every* route, endpoint, and piece of content of the
> **Grupoa LXP platform** (`unifoa2.grupoa.education` + `api.plataforma.grupoa.education`), then
> use that map to build an agent that does the student's exercises automatically (quizzes, file
> uploads, reading items).
>
> **IMPORTANT — scope boundary:** `unifoa.lyceum.com.br` is **NOT** a scraping target. It is used
> **only** to authenticate and obtain the LXP SSO token. Do **not** crawl, dump, or document the
> Lyceum portal itself — that wastes tokens and is out of scope. The LXP platform is the sole
> subject of scraping and documentation.

This document is the single source of truth for the effort. A subagent that is asked to "scrape
the website" must read this file first, follow the scope below, and append every discovery back
into `docs/`.

---

## 1. Objective

1. **Authenticate** via `unifoa.lyceum.com.br` (used **only** as the SSO gateway — not scraped).
2. **Map every route** (frontend SPA paths) of the **LXP platform**.
3. **Map every API endpoint** (verb, path, auth, request/response contract) of the **Grupoa API**.
4. **Scrape all LXP content** reachable through the authenticated student account.
5. **Document everything exhaustively** into `docs/` — the goal is a *complete* reverse-engineered
   description of the LXP system, not just a shallow crawl.
6. **Identify gaps** — especially the write-side endpoints needed to control the LXP.
7. **Build an exercise agent** that (a) answers quizzes, (b) submits file-uploads, and
   (c) marks reading items done.

---

## 2. Target systems

| System | Frontend | API | Auth |
|---|---|---|---|
| **Lyceum portal** (Unifoa academic system) | `https://unifoa.lyceum.com.br/aluno/#/…` (hash SPA) | **OUT OF SCOPE — auth only** | `#username` / `#password` form → Microsoft SAML SSO |
| **Grupoa LXP** (learning experience platform) | `https://unifoa2.grupoa.education/plataforma/…` (Nuxt SPA) | `https://api.plataforma.grupoa.education` | `plataforma_accessToken` in `localStorage` (obtained via Lyceum SSO redirect) |
| **Static assets** | — | `https://static.plataforma.grupoa.education/unifoa_prod/unifoa2/{uuid}.pdf` | none (public URLs) |
| **PDF viewer** | `https://libs.grupoa.education/pdfreader/web/viewer.html?file=…` | — | none |

### 2.1 Login / SSO flow (already reverse-engineered)

```
GET https://unifoa.lyceum.com.br/aluno/#/login
  → fill #username, #password
  → submit form button[type=submit]
  → (optional reCAPTCHA g-recaptcha — blocks automation)
  → redirect through login.microsoftonline.com (SAML2)
  → land back on unifoa.lyceum.com.br/aluno/#/home
  → sessionStorage/localStorage contain an LXP deep-link URL
      (host contains "plataforma" / unifoa2.grupoa.education)
  → follow that link → unifoa2.grupoa.education/plataforma/...
  → localStorage["plataforma_accessToken"] is the bearer token for the API
  → localStorage["plataforma_noticeToken"] = { signature, expiredAt } (notice modal suppression)
```

**Required API headers (per existing code):**

```
authorization: <plataforma_accessToken>
accept: application/json
x-user-timezone: America/Sao_Paulo
x-notice-show-modal: false
x-notice-signature: <noticeToken.signature>
x-notice-expired-at: <noticeToken.expiredAt>
```

---

## 3. Known API endpoints (discovered so far)

Base: `https://api.plataforma.grupoa.education`

### 3.1 Courses / enrollments

| Verb | Path | Notes |
|---|---|---|
| GET | `/v1/plataforma/academic/courses?type=all&page=1&perPage=20` | `type` also observed: `available`, `enrolled`, `enrollment`, `mine`, `student` |
| GET | `/v1/plataforma/academic/courses/me?state=all&page=1&limit=50&sort=asc&sortBy=name&type=courses` | returns `{ courses: [...] }` — used to enumerate enrollments |
| GET | `/v1/plataforma/academic/enrollments/me?page=1&perPage=20` | |
| GET | `/v1/plataforma/enrollments/courses?page=1&perPage=20` | |
| GET | `/v2/plataforma/academic/courses?page=1&perPage=20` | v2 variant |
| GET | `/v2/plataforma/academic/enrollments/me?page=1&perPage=20` | v2 variant |
| GET | `/v2/plataforma/enrollments/courses?page=1&perPage=20` | v2 variant |

### 3.2 Content tree (course material)

| Verb | Path | Notes |
|---|---|---|
| GET | `/v2/plataforma/content/academics-main/{courseId}/contents` | full subject → section → item tree (`topics[]` with `children[]`) |
| GET | `/v2/plataforma/content/academics-main/{courseId}/topics/{sectionId}` | section detail, `topics[].content.html` contains rendered item HTML + `<grupoabook>` PDF tags |

### 3.3 Progress / actions (write side — partially known)

| Verb | Path | Notes |
|---|---|---|
| POST | `/v2/plataforma/content/academics-main/{courseId}/topics/{topicId}/progress` | marks a reading item as read (returns 200/204) |

### 3.4 Topic type → kind mapping (from `src/content-types.ts`)

| `topicTypeId` | Kind | Notes |
|---|---|---|
| 1 | module | container |
| 2 | section | container |
| 3 | reading / pdf | `progressTypeId === 2` → reading; has `<grupoabook file=*.pdf>` → pdf |
| 7 | link | |
| 8 | file_upload | assignment with file submission — **write endpoint unknown** |
| 9 | forum | **write endpoint unknown** |
| 37 | quiz | **question + submit endpoints unknown** |
| other | other | |

### 3.5 PDF attachment parsing

Item HTML embeds PDFs as custom tags:

```html
<grupoabook file="https://static.plataforma.grupoa.education/unifoa_prod/unifoa2/{uuid}.pdf"
            filename="..." filesize="...">
```

---

## 4. Known frontend routes

### 4.1 LXP SPA (`unifoa2.grupoa.education/plataforma/…`)

| Route | Purpose |
|---|---|
| `/plataforma/` | Home |
| `/plataforma/my-enrollments/courses` | Subjects list |
| `/plataforma/my-notices` | Notices |
| `/plataforma/messages` | Messages |
| `/plataforma/my-achievements` | Achievements |
| `/plataforma/new-calendar` | Calendar |
| `/plataforma/lti-tools` | Tools |
| `/plataforma/my-enrollments/communities` | Communities |
| `/plataforma/course/{courseId}` | Course detail (e.g. `5254272`) |
| `/plataforma/course/{courseId}/content/{itemId}` | Item detail |
| `/plataforma/my-grades/{courseId}` | Grades for a course |

### 4.2 Lyceum SPA (`unifoa.lyceum.com.br/aluno/#/…`) — OUT OF SCOPE

The Lyceum portal is only the SSO entry point. Its hash routes were observed during recon but
are **not** to be crawled, scraped, or documented. Listed here only so the auth flow is
understood; do **not** navigate them as part of the scrape. The only Lyceum URL the agent ever
touches is the login page (`#/login`).

<details>
<summary>Observed (ignored) Lyceum routes — reference only</summary>

```
#/home/acordos
#/home/ajuste-boleto
#/home/aluno-cadastro
#/home/aluno-extrato
#/home/assistencia-estudantil
#/home/avaliacao
#/home/avaliacao-descritiva
#/home/avisos
#/home/boletim
#/home/carteirinha-estudantil
#/home/central-oportunidades
#/home/cobranca
#/home/contrato
#/home/debito-autorizado
#/home/diario-classe
#/home/disciplinas
#/home/disciplinas-publicacoes
#/home/documentos
#/home/documentos-aluno
#/home/editais
#/home/editais-assistencia-estudantil
#/home/estou-chegando
#/home/ficha-medica
#/home/financeiro
#/home/frequencia
#/home/historico
#/home/indice-rendimentos
#/home/matricula
#/home/nota-fiscal-eletronica
#/home/ocorrencias
#/home/pagamento-recorrente
#/home/pgtocartao
#/home/pgtocobrancas
#/home/processo-seletivo
#/home/projetos-bolsas
#/home/servico-list
#/home/tarefa-list
#/home/trabalhos
#/resetsenha
```

</details>

---

## 5. Scraping scope — document EVERYTHING (LXP only)

For the crawl agent, the instruction is: **be exhaustive**. Nothing is too small. Capture and
document all of the following, per page and per endpoint. **Scope is limited to the LXP platform
(`unifoa2.grupoa.education` / `api.plataforma.grupoa.education`).** `unifoa.lyceum.com.br` is used
only for login and must not be crawled.

### 5.1 Per frontend route, capture

- [ ] Final URL + any query params.
- [ ] `<title>`, meta description, all `<h1>`–`<h6>` headings.
- [ ] Full accessible text snapshot (`page.locator('body').innerText()`).
- [ ] Accessibility tree snapshot (roles/names/refs) — reveals buttons, forms, links.
- [ ] Every `<a>` href, `<button>`, `<input>`, `<form>` with `action`/`method`.
- [ ] Any `data-*` attributes, Angular/Nuxt bindings, component names.
- [ ] Visible + hidden network activity (see 5.2).
- [ ] Full-page screenshot (for visual reference).
- [ ] Any `localStorage`/`sessionStorage` keys touched by the page.
- [ ] Any global JS objects exposed (e.g. `window.__NUXT__`, `__NEXT_DATA__`, app state).

### 5.2 Per API call, capture

- [ ] HTTP method + full URL (including query params).
- [ ] Request headers (esp. auth, custom `x-*` headers).
- [ ] Request body (JSON / form-data) — exact shape.
- [ ] Response status + response body (full JSON).
- [ ] Which route/action triggered the call.
- [ ] Idempotency / pagination behavior (does `page`, `limit`, `perPage` differ?).

### 5.3 Per content item, capture

- [ ] `courseId`, `courseName`, `moduleId`, `moduleTitle`, `sectionId`, `sectionTitle`.
- [ ] `itemId`, `itemTitle`, `topicTypeId`, `progressTypeId`, `progressId`, `viewed`, `grade`.
- [ ] `isRecordProgress`, `expired`, `hasCompletedAllAttempts`, `hasDeadline`, `deadlineAt`.
- [ ] Rendered HTML (converted to markdown) — including embedded `<grupoabook>` PDFs.
- [ ] All PDF download URLs + filenames.
- [ ] "done" vs "undone" state.

### 5.4 Extra surfaces to probe (do NOT skip)

- [ ] Notices / messages / achievements APIs (read side unknown).
- [ ] Grades API (`/my-grades/{id}` page + backing call).
- [ ] Calendar API (the calendar page is currently scraped via screenshot+OCR — find the real JSON endpoint).
- [ ] Communities / LTI tools APIs.
- [ ] Quiz lifecycle: start → questions → answer → submit (reverse via live interaction).
- [ ] File-upload endpoint (reverse via live interaction).
- [ ] Forum read/post endpoints.

---

## 6. Documentation structure (the deliverable)

All docs live under `docs/`. Generated, per-account captures now live in the gitignored
`scraped/` (this original tree is kept for history; paths below may show the old layout). Expected
tree:

```
docs/
├── PLAN.md                      # this file — the master plan
├── portal-map.md                # every frontend route (both platforms), grouped + annotated
├── api-endpoints.md             # every API endpoint: verb, path, headers, body, response
├── gaps.md                      # write-side / unknown-endpoint gap analysis + TODO list
├── auth.md                      # SSO flow, token lifecycle, header scheme, session expiry
├── routes/
│   ├── lxp-home.md
│   ├── lxp-subjects.md
│   ├── lxp-course-{id}.md
│   ├── lxp-content-{itemId}.md
│   └── … (one file per LXP route — Lyceum is NOT documented)
├── api/
│   ├── academic-courses.md
│   ├── content-tree.md
│   ├── content-item.md
│   ├── progress.md
│   └── … (one file per endpoint family)
├── courses/
│   └── {courseId}-{slug}/
│       ├── README.md            # course overview + section list
│       └── {section}-{itemId}.md # per-item dump (title, kind, deadline, html→md, pdfs)
└── raw/                          # machine-readable captures (JSON) for diffing/reprocessing
    ├── routes.json
    ├── api-calls.json
    └── content-tree.json
```

**Rule:** a page/endpoint is "done" only when a corresponding markdown file exists and is
non-empty with the fields listed in §5.

---

## 7. Implementation phases

> Phase 0–4 are **implemented** (see §11 project layout). Phases 5–6 remain.

### Phase 0 — Bootstrap ✅
- `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`.
- Deps: `playwright`, `dotenv`, `zod`, `pino`/`pino-pretty`, `node-html-markdown`; dev: `tsx`, `typescript`.

### Phase 1 — Auth ✅
- `src/auth.ts` — Lyceum login → SSO → LXP token + session save/load.
- `src/session.ts` — one-call session bootstrap (browser + authenticated `ApiClient`).
- `scripts/login.ts` — interactive login → `data/storageState.json`.

### Phase 2 — Route crawler ✅
- `scripts/crawl-routes.ts` — BFS over `/plataforma/*` routes (skips Lyceum), writes
  `scraped/routes/*.md` + `scraped/raw/routes.json` + `scraped/portal-map.md`.

### Phase 3 — API harvester ✅
- `src/network.ts` — `NetworkRecorder` (records requests + response bodies).
- `scripts/capture-api.ts` — drives navigation + dumps `scraped/api-captured.md` + `scraped/raw/api-calls.json`.
  `--url <itemUrl> --headful` is the one-time reverse-engineering entry point.

### Phase 4 — Content dump ✅
- `src/content.ts` — full tree-walk + classification + HTML capture.
- `src/actions.ts` — `markRead` (progress POST) + `downloadPdf`.
- `scripts/dump-content.ts` — writes `scraped/courses/**` + `scraped/raw/content-tree.json`.

### Phase 5 — Gap closing (live interaction, one-time) ⏳
- Open a quiz + a file-upload item in a headful browser with network recording.
- Submit one quiz answer + one file upload manually.
- Capture the exact write endpoints + payload schema → document in `docs/gaps.md` and
  `docs/api/*.md`.

### Phase 6 — Exercise agent ⏳ (partial)
- `scripts/agent.ts` — implemented for reading auto-complete; quiz/upload pending Phase 5.
- `src/exercises.ts` — `fetchQuiz`, `submitAnswer`, `uploadFile` (to be built after gap-closing).

---

## 8. The exercise agent (target behavior)

Three capabilities, in priority order:

1. **Reading** (`topicTypeId 3` + `progressTypeId 2`) — solved: POST `/topics/{id}/progress`.
2. **Quiz** (`topicTypeId 37`) — must discover question + submit endpoints in Phase 5, then
   implement `fetchQuiz()` / `submitAnswer()`.
3. **File upload** (`topicTypeId 8`) — must discover upload endpoint in Phase 5, then implement
   `uploadFile()`.

**Safety rules for the agent:**
- Never submit/answer unless explicitly invoked with `--run`.
- Log every mutation (item id, endpoint, payload) to an audit file.
- Respect `hasCompletedAllAttempts` — do not retry exhausted items.
- Never touch credentials/`.env` in output or logs.

---

## 9. Known risks

| Risk | Impact | Mitigation |
|---|---|---|
| reCAPTCHA on login | blocks automated login | interactive `login.ts` + reuse `storageState.json` |
| Token/session expiry | scrape returns login page | detect + re-login; document expiry in `docs/auth.md` |
| Write endpoints obfuscated / behind CSRF | can't auto-submit | Phase 5 live-interaction capture; look for CSRF headers |
| Rate limits / 403 / 429 | blocked crawl | backoff + throttle; reuse token headers exactly |

---

## 10. Secrets handling

- `.env` and `data/storageState.json` are credentials — **never** committed or logged.
- All secrets live only in `.env` (gitignored).
- Logging redacts `OPENAI_API_KEY`, `DISCORD_WEBHOOK_URL`, `LXP_PASSWORD`, DB passwords, and
  the bearer token.

---

## 11. Tooling decisions (why these tools)

The goal is *not* to scrape the DOM — it is to drive the **JSON API** directly, using the browser
only where a real DOM/SSO is unavoidable. Tool selection follows that principle:

| Tool | Role | Why |
|---|---|---|
| **Node 24 native `fetch`** | direct API access | The LXP SPA is a client over `api.plataforma.grupoa.education`; calling it directly is 90% of the scraping, with zero token/DOM overhead. Wrapped in `src/client.ts` (`ApiClient`) with retry/backoff + exact auth headers. |
| **Playwright (library)** | SSO login + token extraction + reverse-engineering | Needed only to (a) log in via Lyceum→SAML, (b) read `plataforma_accessToken` from `localStorage`, (c) record network traffic for the write-endpoints. *Not* Playwright MCP — the library is deterministic, scriptable, and cheap for bulk work. |
| **Network recorder** (`src/network.ts`) | endpoint discovery | `page.on('request'/'response')` captures every API call + body. This is how the unknown quiz/upload endpoints get reverse-engineered. |
| **`node-html-markdown`** | HTML → Markdown | Converts item HTML from the content API into clean `.md` for the research corpus (no headless-browser DOM needed). |
| **`zod`** | env/response validation | Fail-fast config; validated shapes. |
| **`pino` + `pino-pretty`** | structured logging | Redacted structured logs, easy grepping, matches the existing `lxp-notificator` style. |
| **`tsx` + TypeScript (ESM)** | dev/run | Fast TS execution, no build step for scripts; `.js` import specifiers for NodeNext. |

### What was deliberately **not** added

- **Playwright MCP** — an LLM-driver convenience layer, slow and token-heavy for deterministic
  scraping. The library is used instead.
- **Cheerio/jsdom** — unnecessary; content arrives as JSON + small HTML fragments converted by
  `node-html-markdown`.
- **A database** — not needed for a one-shot documentation dump; raw JSON is written to `scraped/raw/`.

### Project layout (implemented)

```
src/
├── config.ts        # env loading (zod) + logger
├── client.ts        # ApiClient: authenticated fetch with retry/backoff
├── auth.ts          # Lyceum SSO login, LXP token extraction, session save/load
├── session.ts       # createSession(): browser + authenticated ApiClient in one call
├── network.ts       # NetworkRecorder: record every API request/response
├── content.ts       # course enumeration + content tree-walk + classification
├── actions.ts       # markRead (progress POST) + downloadPdf
├── markdown.ts      # htmlToMarkdown, codeBlock, tableCell helpers
├── util.ts          # sanitizeFilename, slugify, sleep, ensureDir, json
└── index.ts         # CLI help entry
scripts/
├── login.ts         # interactive login → data/storageState.json
├── dump-content.ts  # scrape all content → scraped/courses/**
├── capture-api.ts   # record network → scraped/api-captured.md (+ raw JSON)
├── crawl-routes.ts  # crawl /plataforma/* routes → scraped/routes/** + portal-map.md
└── agent.ts         # list / auto-complete exercises (reading done; quiz/upload pending)
```

---

## 12. Quickstart

```bash
# 1. Install deps + browser
npm install
npx playwright install chromium

# 2. Configure credentials (copy from lxp-notificator/.env)
cp .env.example .env      # then fill LXP_USERNAME / LXP_PASSWORD

# 3. One-time interactive login (solves reCAPTCHA if prompted, saves the session)
npm run login

# 4. Scrape + document everything
npm run dump              # all course content → scraped/courses/**
npm run crawl-routes      # all LXP routes → scraped/routes/** + scraped/portal-map.md
npm run capture-api       # API traffic → scraped/api-captured.md + scraped/raw/api-calls.json

# 5. Exercise agent (reading auto-complete is live; quiz/upload after Phase 5)
npm run agent             # list quizzes/uploads/readings
npm run agent -- --read   # auto-complete undone readings
```

Reverse-engineer the missing write-endpoints (quiz/upload) with:

```bash
npm run capture-api -- --url https://unifoa2.grupoa.education/plataforma/course/5254272/content/<itemId> --headful
# → interact with the quiz/upload in the browser, then press Enter to dump the captured API calls
```

