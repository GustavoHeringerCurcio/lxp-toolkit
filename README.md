<div align="center">

# LXP Toolkit

**A personal study copilot for the UniFOA / Grupoa LXP portal.**

It signs in as you, turns your course content into a clean local database, and helps you
plan deadlines and draft answers — you review and own everything that gets sent.

[![Node](https://img.shields.io/badge/node-%E2%89%A522-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![npm workspaces](https://img.shields.io/badge/npm-workspaces-CB3837?logo=npm&logoColor=white)](https://docs.npmjs.com/cli/using-npm/workspaces)
[![Postgres](https://img.shields.io/badge/Postgres-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Playwright](https://img.shields.io/badge/Playwright-1.62-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

---

## Overview

LXP Toolkit is a TypeScript monorepo with two halves:

| | |
|---|---|
| **The scraper** — `packages/portal` | Logs in through Lyceum SSO with Playwright, talks to the same JSON API the portal uses, and dumps every reading, quiz, assignment, grade and notice into readable markdown + raw JSON. |
| **The app** — `apps/web` + `apps/server` | **LXP Toolkit**: a task board ordered by deadline, an AI answer workbench, quiz practice, and a gated submission flow. |

The scraper writes to the gitignored `scraped/` folder. The app imports that into a local
**Postgres** database (the source of truth) and projects a small cache the UI reads.

> [!NOTE]
> No private magic. It is a Playwright login plus a typed API client pointed at the exact
> endpoints the site already calls. The portal is a Nuxt 3 SPA; the API is
> `https://api.plataforma.grupoa.education`.

## Table of contents

- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Commands](#commands)
- [The LXP Toolkit app](#the-lxp-toolkit-app)
- [How it works](#how-it-works)
- [Data & privacy](#data--privacy)
- [Troubleshooting](#troubleshooting)
- [Built with](#built-with)
- [Documentation](#documentation)
- [Academic integrity](#academic-integrity)

---

## Architecture

```mermaid
flowchart LR
    SSO["Lyceum SSO<br/>unifoa.lyceum.com.br"] --> LXP["Grupoa LXP<br/>Nuxt 3 SPA + JSON API"]
    LXP --> SCRAPER["packages/portal<br/>Playwright scraper"]
    SCRAPER --> RAW[("scraped/<br/>gitignored")]
    RAW -->|"npm run index:web"| PG[("Postgres<br/>source of truth")]
    PG --> CACHE[("exercises.json<br/>UI cache")]
    CACHE --> SERVER["apps/server<br/>index · AI · submit"]
    SERVER --> WEB["apps/web<br/>React UI"]
    SERVER -->|"submit-task (Playwright)"| LXP
```

Two design rules keep this safe and simple:

- **Credentials never leave the scraper.** Only `packages/portal` touches a browser and your
  portal password. The web app never sees your login.
- **Writes go through a real browser.** Answering a quiz or uploading a file is done by the
  Playwright runner in `packages/portal` — never a raw `fetch` — because the bearer token is
  single-use and the API is fronted by AWS WAF.

---

## Getting started

### Prerequisites

- **Node.js ≥ 22**
- **Docker** (with the Compose v2 plugin) — provides the local Postgres container
- On bare **Linux/WSL/containers**, install Playwright's system libraries:
  `sudo npx playwright install-deps chromium`
- Optional: **LibreOffice**, for `.pdf` delivery and Office previews

### One command

From the repository root:

```bash
npm run setup
```

The wizard walks you through everything:

1. installs dependencies and the Chromium browser;
2. asks for your **portal login** (RA + password) and, optionally, your **OpenAI API key**
   (you can skip it and still use the scraper);
3. optionally records your name / matrícula to sign AI drafts;
4. writes the gitignored `.env` files and enables the personal-data commit guard;
5. starts **Postgres** and applies the schema migrations;
6. offers to run your **first scrape**, build the index, and start the app.

Check the machine at any time:

```bash
npm run doctor
```

### Manual setup

> [!IMPORTANT]
> Run every command from the **repository root**.

```bash
npm install
npx playwright install chromium          # add --with-deps on bare Linux
cp packages/portal/.env.example packages/portal/.env   # LXP_USERNAME / LXP_PASSWORD
cp apps/server/.env.example apps/server/.env           # DATABASE_URL + optional OPENAI_API_KEY
git config core.hooksPath .githooks                    # personal-data commit guard

npm run db:up            # start Postgres 16 (Docker)
npm run db:migrate       # apply the schema migrations
npm run dump             # courses, quizzes, uploads + attachments → scraped/
npm run dump-surfaces    # grades, calendar, notices, messages
npm run index:web        # migrate + import into Postgres → exercises.json cache
npm run dev              # API + Vite with hot reload → http://localhost:5174
# or
npm run web              # refresh + build + serve → http://localhost:4174
```

Edit the copied `.env` files before running: `apps/server/.env` needs a real
`OPENAI_API_KEY` (only required for AI generation) and the default
`DATABASE_URL=postgres://lxp:lxp@localhost:5433/lxp`.

### Fresh clone

Everything personal (`scraped/`, `.env`, `data/`) is gitignored, so a clone starts clean:

```bash
git clone <repo-url> && cd lxp-toolkit
npm run setup          # the wizard can scrape and start the app for you
# afterwards, any time:
npm run web            # refresh + build + serve → http://localhost:4174
```

---

## Commands

### Scraper — `packages/portal`

| Command | What it does |
|---|---|
| `npm run dump` | Scrapes all course content + downloads attachments → `scraped/courses/**`; also harvests hidden topics. |
| `npm run dump-surfaces` | Grades, calendar, notices, messages, achievements, communities, LTI → `scraped/*.md`. |
| `npm run crawl-routes` | Crawls SPA routes via client-side navigation → `scraped/routes/**`. |
| `npm run capture-api` | Records network traffic → `scraped/api-captured.md`. |
| `npm run agent` | Lists actionable items; `--read` / `--complete` auto-marks the markable ones. |
| `npm run index` | Builds the offline homework index → `scraped/raw/homework-index.json`. |
| `npm run homework` | Terminal board of what's due, deadline-first. |
| `npm run exercises -- <itemId>` | Prints one quiz's questions or an upload's info. |
| `npm run submit-task` | The gated browser bot that submits to the portal (spawned by the server). |
| `npm run login` | Interactive login → `data/storageState.json` (legacy; scripts re-login anyway). |

### App — `apps/server` + `apps/web`

| Command | What it does |
|---|---|
| `npm run dev` | **Fast development**: API + Vite together → <http://localhost:5174> (hot reload). No scrape. |
| `npm run dev:fresh` | Runs `sync` first (fresh portal content), then starts the dev servers. |
| `npm run web` | **Production-style**: refresh (`preweb`) → build the UI → serve → <http://localhost:4174>. |
| `npm run sync` | The full refresh pipeline (see below). |
| `npm run db:up` / `db:down` | Start / stop the local Postgres container. |
| `npm run db:migrate` | Apply the versioned SQL migrations. |
| `npm run db:import` | Import `scraped/` + legacy JSON into Postgres (idempotent). |
| `npm run index:web` | `migrate → import → project`: `scraped/` → Postgres → `exercises.json`. |

**Full refresh pipeline** — what `sync`, `dev:fresh`, `web`'s `preweb`, and the app's
**Atualizar** button run:

```
db:up → db:migrate → dump → dump-surfaces → index → index:web
```

Skip it with `SKIP_SYNC=1`, skip only the scrape with `SKIP_DUMP=1`, or skip the hidden-topic
sweep with `SKIP_HARVEST=1`.

### Handy

| Command | What it does |
|---|---|
| `npm run typecheck` | Type-checks every workspace. |
| `npm run build` | Builds every workspace. |
| `npm run test` | Runs the test suites. |

---

## The LXP Toolkit app

| Area | What it does |
|---|---|
| **Agora** (`/`) | Status line, next-task hero with a live countdown, and an urgency-grouped open queue. |
| **Tarefas** (`/tarefas`) | Every `Tarefa` and `Questionário` sorted by deadline, with done / expired / due-soon badges. |
| **Atividade** (`/tarefa/:id`) | Instructions, previewable files, quiz questions, per-activity AI notes, and a streaming answer workbench with version history. |
| **Progresso** (`/progresso`) | Per-module progress and status/type distribution. |
| **Treino de quiz** (`/treino/quiz`) | Gamified practice quiz generated from your course material (or the real portal questions). |
| **Perguntar à IA** (`/treino/estudo`) | Free-text study Q&A scoped to a subject. |
| **God's Eye** (`/gods-eye`) | Read-only view of hidden/upcoming topics the portal serves but doesn't list. |
| **Ajustes** (`/ajustes`) | Profile, AI voice/format/rules, generation params, organization directory. |
| **Design** (`/design`) | Living style guide. |

**Answer workbench.** Drafts stream from OpenAI, are saved as immutable versions, and can be
restored. Quizzes are answered in `Q<id>: <letter>` format and mapped onto the portal's options.
Uploads can be delivered as **text**, **`.txt`**, or **`.pdf`** — with a preview of the exact
file first. A quality gate flags drafts that look off before you send.

---

## How it works

1. **Scrape.** `createSession()` logs in fresh (the token is single-use / single-page-session),
   the typed `ApiClient` walks the content tree, classifies each topic by `topicTypeId`,
   converts HTML to markdown, and downloads attachments.
2. **Import.** `import.ts` loads `scraped/raw/content-tree.json` into **Postgres** (normalized:
   courses, modules, professors, questions, activity). Professor identity is keyed by the stable
   `safeaUserId`, never the display string.
3. **Project.** `project.ts` projects the `v_exercise_current` view into
   `apps/server/data/exercises.json`, computing `status` (`open` / `expired` / `done`) and
   `daysLeft`. The cache is invalidated by its `catalogVersion`.
4. **Compose.** `prompt.ts` builds a `system` message from the structured style rules and a
   `user` message with just the activity content. No section markers are sent.
5. **Generate.** `ai.ts` streams a pt-BR draft and stores it in Postgres as an immutable
   `answer_attempt`.
6. **Send.** `send.ts` spawns the portal runner, which navigates the SPA with
   `$nuxt.$router.push()`, attaches or selects the answer, and confirms. Nothing auto-submits.

---

## Data & privacy

- `scraped/` is **your account's data** and is gitignored — every user generates their own.
- Credentials live only in `packages/portal/.env`; the OpenAI key only in `apps/server/.env`.
  Both are gitignored.
- Logs redact passwords, tokens and `authorization` headers.
- The web app **never** receives your portal credentials; submissions are spawned server-side.
- Postgres runs **locally and per-user**; your academic data never leaves your machine.
- Nothing auto-submits — every write requires an explicit confirmation.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Portal asks for a reCAPTCHA | Re-run `HEADFUL=true npm run dump`; solve it in the window that opens. The app's **Atualizar** button also retries headful. |
| Browser won't launch on Linux | `sudo npx playwright install-deps chromium`, or set `PLAYWRIGHT_NO_SANDBOX=true` in `packages/portal/.env`. |
| `.pdf` delivery / Office previews fail | Install **LibreOffice**; on macOS set `SOFFICE_BIN` to its `soffice` binary. |
| `docker` not found / Postgres down | Install and start Docker, then `npm run db:up && npm run db:migrate`. |
| `DATABASE_URL` not configured | Run `npm run setup`, or add it to `apps/server/.env` (see `.env.example`). |
| Port 4174 in use | Set `PORT=4175` in `apps/server/.env`. |
| Port 5433 busy | The bundled container uses host port **5433** on purpose; keep `DATABASE_URL` on `localhost:5433`. |
| Not sure what's missing | `npm run doctor` reports exactly what to fix. |

---

## Built with

| Layer | Tools |
|---|---|
| **Language** | TypeScript (ESM, NodeNext) on Node ≥ 22 |
| **Monorepo** | npm workspaces (`apps/*`, `packages/*`) |
| **Scraping** | Playwright, `node-html-markdown`, `zod`, `pino` |
| **Backend** | Node `http`, Postgres 16 (`pg`), OpenAI SDK, `pdf-parse`, LibreOffice (optional) |
| **Frontend** | React 18, Vite 5, Tailwind v4, shadcn / Base UI, lucide-react, react-router, sonner |
| **Runner** | `tsx` (no build step for scripts) |

---

## Documentation

| Doc | Contents |
|---|---|
| [`agent-docs/00-INDEX.md`](agent-docs/00-INDEX.md) | The machine-readable knowledge base — start here for portal work. |
| [`packages/portal/docs/README.md`](packages/portal/docs/README.md) | Reverse-engineering index. |
| [`packages/portal/docs/auth.md`](packages/portal/docs/auth.md) | SSO flow, token lifecycle, headers. |
| [`packages/portal/docs/api-endpoints.md`](packages/portal/docs/api-endpoints.md) | Every endpoint discovered. |
| [`apps/server/README.md`](apps/server/README.md) | The app's full feature tour. |
| [`apps/server/docs/ARQUITETURA.md`](apps/server/docs/ARQUITETURA.md) | How the app's pieces connect. |
| [`apps/web/DESIGN.md`](apps/web/DESIGN.md) | Design system and component contracts. |

---

## Academic integrity

This tool reads **your own** academic data, for studying. Know what your institution allows,
and don't use it to fake your way through coursework. That is exactly why sending is locked
behind a confirmation dialog — you are the one standing behind what goes in.
