# Send answers from the LXP Homework web app — plan

Goal: from `assistant/web` (the LXP Homework), one click sends a generated answer into the real
portal — quiz answer selection or file-upload submission — then refreshes the task status.

This is a **portal write** feature. It mutates the student's academic record, so it is gated behind
explicit intent everywhere and never auto-runs.

## 0. Constraints that shape the architecture

Facts from `agent-docs/` (do not fight these):

1. The LXP submit endpoints are **unknown** — quiz-answer POST and file-upload POST are still open
   gaps (`docs/gaps.md` §1–2). `assistant/src/submit.ts` and the CLI `send` command intentionally
   throw until a real contract exists.
2. LXP access token is **single-use / single-page-session**. Full reload kills it. Navigation must
   go through `window.$nuxt.$router.push()`, never `page.goto` (agent-docs 00, 06).
3. **AWS WAF** fronts `api.plataforma.grupoa.education`. GETs work with the bearer token alone;
   **POST/PUT writes may require the WAF challenge solved in a real browser** (agent-docs 06 §gotcha 3).
4. Browser tooling + Lyceum SSO login + token exchange + WAF session code all live in the **root
   study repo** (`src/session.ts`, `src/auth.ts`, `playwright` dep, creds in root `.env` as
   `LXP_USERNAME`/`LXP_PASSWORD`). The `assistant/` project is a separate npm app with no browser
   dep and no portal creds, and must keep it that way.

Consequence: the submitter is a **gated runner in the root repo**; the assistant server shells out
to it. Creds never leave the root `.env`, never reach the web frontend.

## 1. Architecture

```
assistant/web (React)
   │  POST /api/submit/preview + /api/submit (consent token in body)
   ▼
assistant/server/server.ts  ── spawns (tsx) ──▶  scripts/submit-task.ts  (root repo)
                                                    │ fresh Playwright login (session.ts)
                                                    │ $nuxt router → task page
                                                    │ select answers / attach file → real submit
                                                    ▼
                                           data/submissions.json (assistant, for history/status)
   ◀── poll GET /api/submissions/:id ──  result JSON {ok, status, detail, at}
```

Data flow per activity kind:
- **upload**: server writes the AI answer to a temp file (`.txt`/`.md`; see Open Questions A3), the
  runner attaches it on the portal and confirms.
- **quiz**: requires structured answers (per question → chosen option). See Open Questions A2.

## 2. Phases

### Phase 1 — Controlled discovery (human-in-the-loop, one-time)
Objective: close `docs/gaps.md` §1–2 with real contracts.
- Use the existing tool: `npm run capture-api -- --url <quiz item> --headful`, answer one question
  for real, press Enter → inspect `scraped/raw/api-calls.json` + `scraped/api-captured.md`.
  Repeat once for a file-upload task (upload one file).
- Record: endpoint path, HTTP method, JSON/multipart body shape, required headers, whether an
  `aws-waf-token` was sent and matters, and **DOM selectors + confirm-click flow** (radio/label,
  "entregar", success state) — capture screenshots/DOM dumps to support the runner.
- Deliverables: update `agent-docs/03-api-endpoints.md` (new "write side" table), close the two gap
  entries, save a short `scraped/raw/submit-contract.json` describing payload + DOM flow.

Gate: this submits real work. Only run with explicit intent.

### Phase 2 — Gated runner in the root repo
Objective: one command that performs a fresh login and submits one task.
- New `scripts/submit-task.ts` (mirrors `capture-api.ts` patterns): input = JSON request file
  `{ exerciseId, kind, answerText?, selections? [{questionId, optionIndex}], filePath? }`; does
  `createSession()`, SPA-nav to the task route, fills/selects, clicks confirm, waits for the portal
  success state, then re-reads status; output = JSON result `{ ok, status, attemptsLeft?, detail }`.
- Implement **two strategies** behind one interface, chosen per what Phase 1 proved:
  - `browser` (default, robust — WAF + UI confirm) — drive the page.
  - `nativeApi` (only if Phase 1 shows POST works with bearer + WAF cookie without a challenge).
- Respect existing guardrails: keep `assistant/src/submit.ts` stubs updated to the real call once a
  contract exists; never auto-fire on read/refresh flows.
- Add npm script `submit-task`; wire root `.env` creds (reuse `src/config.ts`). HEADFUL option for
  supervised runs.

### Phase 3 — Assistant service layer
- `server/server.ts`:
  - `POST /api/submit/preview` → dry run: returns exactly what would be sent (kind, file/answer,
    target task, "consumes 1 attempt", non-reversible warning text).
  - `POST /api/submit` body `{ id, confirm: "<uuid consent token>" }` → validates exercise is
    `open`/`expired` (never `done`), has an answer; writes a request file; spawns the root runner;
    records `assistant/data/submissions.json` `{ id, exerciseId, kind, at, status }`.
  - `GET /api/submissions/:exerciseId` → status + last result (for polling after a reload).
  - Submissions are allowed only when the process has a path to the root runner (config: repo root
    + credentials present); otherwise the endpoints return a friendly "não configurado" error.
- The web app itself never receives portal credentials.

### Phase 4 — Web UI (assistant/web)
- In `ActivityDetail`, under the AI answer block: button **"Enviar no portal"**.
  - Enabled only when: task not done, an answer exists, and `/api/submit/preview` responds ok.
  - Clicking opens a small consent dialog (reuse shadcn pieces): plain-pt-BR warning that this is a
    real submission to the portal, not reversible, consumes the attempt; shows the preview payload;
    a confirm checkbox is required before the action button enables.
- During submission: busy state ("Enviando… login no portal e submetendo"); the existing
  `refreshLive` reload re-reads status afterwards; show the resulting status (done/late/none) or the
  error reason (WAF/login/task state) inline.
- Show recent submissions in a small history section (from `GET /api/submissions/:exerciseId`).
- Keep copy pt-BR, icons lucide, no new colors — matches DESIGN.md.

### Phase 5 — CLI parity
- Un-stub `npm run assistant -- send <id>` to call the same root runner path used by the server
  (single code path, no divergence). Keep the pre-flight consent flag (`--yes` required).

### Phase 6 — Safety & integrity checklist
- No submission without explicit user confirm + consent token; nothing fires from `reload`/polling.
- Fresh login per submission (single-use token), creds only in root `.env`, WAF/log redaction of
  auth headers (reuse `src/network.ts` redaction).
- Respect portal attempt limits (`content.hasRetries`, `numberRetries` — expose before submitting
  in the preview).
- Guard rails remain documented: `assistant/README.md` and `docs/gaps.md` updated to reflect that
  submission is now implemented-but-gated.
- Keep academic-integrity stance explicit in the UI copy (student stands behind what they send).

### Phase 7 — Verification
- `npm run typecheck` (root) + `tsc -p web/tsconfig.json` + `vite build` green.
- Manual happy path (supervised, one real task): quiz selection submits and marks done; upload
  submits a file; portal shows the result.
- Failure paths: expired/done task → blocked in preview; no creds → friendly "não configurado";
  WAF/login hiccup → error surfaced, no partial state claimed (poll to confirm actual status).

## 3. Open questions (decide before/while building)
- **A1** Runner location confirmed in root repo, spawned by assistant server via absolute path
  (`tsx <root>/scripts/submit-task.ts`)? Alternative: add playwright to assistant (not recommended —
  duplicate login/WAF code + creds spread).
- **A2** Quiz semantics: does "send" mean auto-select the option the AI marks as correct, or only
  for open-text/"dissertativa" tasks (option quizzes done by hand)? Most LXP quizzes here are
  multiple-choice → need an AI step that returns structured `{questionId, optionIndex}` plus a
  parser that maps it to whatever Phase 1 reveals the payload needs.
- **A3** Upload type: the assistant answer is text (`.md`). Does the portal accept `.txt`/`.md` for
  these `Tarefa` uploads, or must the answer be rendered to PDF before attaching? Resolve in
  Phase 1 (check `maxFilesLimit`/allowed types or the real uploader).
- **A4** Consent UX depth: always-blocking checkbox, or a once-per-session "entendi" acknowledgement?
- **A5** Should submission also be reachable from the CLI's existing `send` placeholder in this
  same effort (recommended) or web-only first?

## 4. Definition of done
- Quiz and upload submissions both work end-to-end from the web app (and CLI), fully gated.
- `agent-docs` + `docs/gaps.md` + `assistant/README.md` updated; submit endpoints documented.
- Statuses refresh after submit; failures are honest; no accidental submissions possible.
