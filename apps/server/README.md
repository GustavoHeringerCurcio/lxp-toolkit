# LXP Toolkit

The **main product** of `lxp-toolkit`: a web app that gives friendly views of your LXP
activities plus **AI answer drafts** (you review and own what gets sent). It reads the data
produced by the portal toolkit (`packages/portal/`) and only talks to the portal through the
scraper's Playwright runner.

This package (`apps/server/`) is the backend: it imports scraped content into **Postgres**,
projects the UI index, generates drafts, bridges portal submissions, and serves the built web
app on `http://localhost:4174`.

```
scraped/  ──index:web──►  Postgres (source of truth)  ──project──►  data/exercises.json (UI cache)
                                  │
      apps/web  ◄── HTTP /api ──  apps/server  ──►  OpenAI
                                      │
                                      └──spawn──►  packages/portal/scripts/submit-task.ts  ──►  portal
```

## Setup

Run from the **repo root**:

```bash
npm install
cp apps/server/.env.example apps/server/.env   # OPENAI_API_KEY (optional) + DATABASE_URL
npm run db:up                                   # start Postgres 16 (Docker)
npm run db:migrate                              # apply the schema migrations
npm run dump                                    # scrape content first (portal toolkit)
npm run index:web                               # migrate → import → project → data/exercises.json
npm run web                                     # build apps/web + serve → http://localhost:4174
```

The OpenAI key is only required for AI generation; the app can browse and index without it.

## Web

```bash
npm run dev        # fast: API + Vite with hot reload → http://localhost:5174
npm run dev:fresh  # sync first (fresh portal content), then the dev servers
npm run web        # refresh + build + serve → http://localhost:4174
```

`npm run dev` does not scrape, so it starts instantly. `npm run dev:fresh` runs `sync` first
(Postgres → migrations → portal scrape → index); `npm run web` refreshes via `preweb`. Skip the
refresh with `SKIP_SYNC=1`, or just the scrape with `SKIP_DUMP=1`.

## Data model

**Postgres is the source of truth** (local, per-user; `DATABASE_URL` gitignored). The schema
lives in `apps/server/db/migrations/` and covers:

- **Identity/tenant** — `institution`, `student`, `enrollment`.
- **Catalog** — `course`, `module`, `professor`, `module_professor`, `section`, `content_item`,
  `attachment`.
- **Question bank** — `question`, `question_option` (deduped by `text_hash` across terms).
- **Student activity** — `item_state` (append-only per scrape), `answer_attempt` (immutable;
  the shown one is `is_current`), `answer_selection`, `submission`, `submission_payload`,
  `item_annotation`.
- **AI** — `ai_config`, `ai_run`.
- **Customization** — `professor_link`, `project_profile`, `activity_project`.
- **Training** — `training_quiz`, `training_question`, `training_answer`.
- **Read model** — view `v_exercise_current` → projected to `apps/server/data/exercises.json`.

Runtime writes go straight to Postgres via `apps/server/src/store.ts` (answers, submissions,
overrides, profile, AI config, `ai_run`). The old `answers.json` / `submissions.json` /
`overrides.json` / `profile.json` are **legacy**: they are read once by `import.ts` and never
written again. `exercises.json` is a cache invalidated by its `catalogVersion`.

## Features

| Route | Page | What it does |
|---|---|---|
| `/` | **Agora** | Combined status line, next-task hero with a live countdown, urgency-grouped open queue. |
| `/tarefas` | **Tarefas** | Scope tabs (Abertas / Atrasadas / Concluídas / Todas) + module/type chips + list. |
| `/progresso` | **Progresso** | Per-module progress bars and status/type distribution. |
| `/tarefa/:id` | **Atividade** | Reading column + sticky workbench: instructions, previewable files, quiz questions, per-activity AI notes, streamed drafts with version history, focus mode, send-confirmation modal. |
| `/treino/quiz` | **Treino de quiz** | Gamified practice quiz generated from your course material (or the real portal questions). |
| `/treino/estudo` | **Perguntar à IA** | Free-text study Q&A scoped to the selected subject. |
| `/gods-eye` | **God's Eye** | Read-only view of hidden/upcoming topics the portal serves but doesn't list. |
| `/ajustes` | **Ajustes** | Hub with tabs: Pessoal · IA · Avançado · Organização. |
| `/design` | **Design** | Living style guide. |

Global: a **⌘K / Ctrl+K command palette** (navigate, jump to a tarefa, filter by module, toggle
theme, refresh content). The header **Atualizar** button re-scrapes the portal and rebuilds the
list with live progress.

## AI answers

The model receives **two messages**, both built in `src/prompt.ts`:

- **`system`** — the structured `style` rules (persona, voice, format, extra rules), plus the
  per-activity extra instructions, the ability block, and any project-context block.
- **`user`** — just the selected activity content.

No `=== … ===` scaffolding is sent, so the model has nothing to echo back. Placeholders:
`{nome}`, `{matricula}`, `{atividade}`, `{tipo}`, `{modulo}`, `{prazo}`, `{enunciado}`,
`{arquivos}`, `{questoes}`, `{observacoes}`.

Every generation saves a new immutable version (`answer_attempt`); you can restore any of them
before sending. Model roles are configurable (generation, detection, classification, diagram,
gate, training) in Ajustes → IA, which also lets you edit abilities and a live preview of the
`system` message.

**Send.** `src/send.ts` writes a request file, spawns
`packages/portal/scripts/submit-task.ts`, and records the result as a `submission`. For uploads
the confirmation dialog lets you choose **Texto direto** (typed into the portal's reply editor),
**Arquivo .txt**, or **Arquivo .pdf** (converted with LibreOffice); you can preview or download
the exact file first. Quizzes select the marked alternatives; forums publish via the
enrollment-scoped post endpoint. Nothing auto-submits — the explicit confirmation CTA is the
gate.

**Quality gate.** `src/gate.ts` analyzes a draft for problems (off-topic, missing parts, AI
tells) before you send; `GatePanel` surfaces the verdict in the UI.

## Training

The Treino routes share `TrainingSubjectPicker` + `lib/training-state.tsx` (persisted
course/module scope). The server builds a knowledge pack from Postgres — catalog + question bank
+ the **precomputed `content_text`** extracted at index time. Quiz practice is **material-first**:
`ai` writes new questions from the material, `mixed` uses the real portal questions that exist
and fills the rest with AI. Sessions and scores persist in Postgres.

## Configuration

Editable files in `apps/server/config/` (personal ones gitignored):

- **`ai-config.json`** → models, temperature, max output tokens, the structured `style` rules,
  `activitySections` toggles, abilities, project auto-detect.
- **`organizations.json`** → committed organization directory (professors + LinkedIn) matched to
  local `professor` rows.
- **`profile.json`** → your `nome` / `matricula` (legacy; the runtime copy lives in Postgres).

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | for AI | Drafts, classification, project detection, gate, training. |
| `DATABASE_URL` | yes | Postgres connection (default `postgres://lxp:lxp@localhost:5433/lxp`). |
| `DATA_DIR` | no | Scraped data location (defaults to `../../scraped`). |
| `PORT` | no | HTTP port (default `4174`). |
| `SOFFICE_BIN` | no | LibreOffice binary for `.pdf` delivery / Office previews. |
| `LXP_HOST` | no | Portal host used during import (default `unifoa2.grupoa.education`). |
| `GITHUB_TOKEN` | no | Fetching project source files from GitHub. |

## Documentação

- [docs/README.md](./docs/README.md) — objetivo e fluxo ponta a ponta.
- [docs/ARQUITETURA.md](./docs/ARQUITETURA.md) — como as peças se conectam.
- [docs/PROMPT.md](./docs/PROMPT.md) — regras de escrita enviadas ao modelo.
- [`../web/DESIGN.md`](../web/DESIGN.md) — design system e contratos de componente.
