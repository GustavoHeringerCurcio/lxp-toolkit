# 🎓 lxp-toolkit — UniFOA / Grupoa LXP

A monorepo for studying the **UniFOA / Grupoa LXP** portal. It has **two cores**:

| Core | Lives in | What it is |
|---|---|---|
| **Portal toolkit** | `packages/portal/` | Reverse-engineering + scraper: logs in with your account, maps the API, and dumps every reading / quiz / assignment to readable markdown under `scraped/`. |
| **LXP Homework** (main product) | `apps/web/` + `apps/server/` | A web app that reads the scraped data: an ordered task board, deadlines, and AI-generated answer drafts. |

> No black magic — a Playwright login plus a set of small scripts talking to the same JSON API the
> website uses. See `packages/portal/docs/` and `agent-docs/` for the deep dive.

## Quick start (first time)

```bash
npm install
npx playwright install chromium
cp packages/portal/.env.example packages/portal/.env   # LXP_USERNAME + LXP_PASSWORD
cp apps/server/.env.example apps/server/.env           # OPENAI_API_KEY
```

Open `packages/portal/.env` and fill in your portal credentials:

```ini
LXP_USERNAME=seu_ra
LXP_PASSWORD=sua_senha
```

Then open `apps/server/.env` and set your OpenAI key (the rest has sensible defaults).

## Everyday commands

All commands run from the **repo root** (they delegate to the right workspace).

| Command | What it does |
|---|---|
| `npm run dump` | Full re-scrape of **your** course content + attachments → `scraped/courses/**` |
| `npm run dump-surfaces` | Scrape grades, calendar, notices, messages → `scraped/*.md` |
| `npm run homework` | Terminal board of open homework, deadline-first |
| `npm run index` | Build the offline homework index (`scraped/raw/homework-index.json`) |
| `npm run exercises -- <itemId>` | Read one quiz's questions or an upload's info |
| `npm run agent` | List / auto-complete leftover readings |
| `npm run web` | Build the web app and serve it → `http://localhost:4174` |
| `npm run web:dev` | Vite dev server (hot reload) for the web app |
| `npm run typecheck` | Type-check every workspace |

Deeper reverse-engineering tools: `crawl-routes`, `capture-api`, `login` — see
`packages/portal/docs/README.md`.

## The LXP Homework web app

```bash
npm run web        # builds apps/web, then starts apps/server → http://localhost:4174
```

- **List** ordered by deadline with done/expired/due-soon badges and quick actions.
- **Activity detail** (`/tarefa/:id`): instructions, files, quiz questions, per-activity AI
  instructions, and an answer workbench with version history.
- **Atualizar** scrapes fresh portal content and rebuilds the list.
- **Perfil** / **IA Ajustes** set your name/matrícula and the writing rules.

See `apps/server/README.md` for the full feature tour.

## Where things live

| Path | What's inside |
|---|---|
| `packages/portal/` | The scraper toolkit (`src/`, `scripts/`) + human RE notes (`docs/`) |
| `packages/portal/docs/` | Reverse-engineering knowledge base (auth, API endpoints, topic types) |
| `apps/web/` | The React web app (main product) |
| `apps/server/` | Backend: exercise index, AI answers, portal submission bridge, static server |
| `scraped/` | **Your** course materials + raw JSON captures (local only, gitignored) |
| `agent-docs/` | Distilled notes for working on this repo |

> 🔒 Everything under `scraped/` is **your account's data** and is gitignored on purpose. Each
> user logs in with their own `.env` credentials and generates their own `scraped/` locally —
> nothing personal is ever committed.

## Good to know (the gotchas)

- 🔑 The login token is **single-use** — every run logs in fresh. That's normal; keep request
  volume low so you don't trip rate-limits.
- 🚫 Don't fully reload the LXP page mid-run — it kills the token. Navigate with
  `$nuxt.$router.push()`.
- 🛑 Auto-submitting quizzes/assignments is gated behind explicit confirmation — see
  `packages/portal/docs/gaps.md`.

## Fair use

This toolkit reads **your own** academic data for studying. Know what your institution allows,
and don't use it to fake completion of coursework.
