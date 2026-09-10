# 🎓 UniFOA / Grupoa LXP — Study Toolkit

Your own little helper for the **UniFOA / Grupoa LXP** portal (the *PROGRAMAÇÃO BACK-END*
course). It logs in once, saves every material / quiz / homework as readable markdown so you can
study offline, and adds friendly dashboards + AI study help on top.

> No black magic — just a Playwright login + a bunch of small scripts that talk to the same JSON
> API the website uses. See `docs/README.md` and `agent-docs/` if you want the deep dive.

## What you can do with it

- 📚 **Read everything offline** — every reading, slide, exercise and quiz saved as `.md` files.
- ✅ **See what's due** — a terminal board of your open homework, sorted by deadline.
- 🤖 **Get answer drafts** — the LXP Homework generates natural pt-BR answers with a cheap AI
  model (you still decide what to actually submit).

## Quick start (first time)

```bash
npm install
npx playwright install chromium
cp .env.example .env     # then edit .env
```

Open `.env` and fill in just two things:

```ini
LXP_USERNAME=seu_ra
LXP_PASSWORD=sua_senha
```

That's it — the rest of `.env` already has sensible defaults.

## Everyday commands

| Command | What it does |
|---|---|
| `npm run dump` | Full re-scrape of all course content (readings, quizzes, uploads, links) + download attachments → `docs/courses/**` |
| `npm run dump-surfaces` | Scrape grades, calendar, notices, messages → `docs/*.md` |
| `npm run homework` | Friendly terminal board of open homework, deadline-first (`-- --fresh` rebuilds the index first) |
| `npm run exercises -- <itemId>` | Read one quiz's questions or an upload's info |
| `npm run index` | Build the offline homework index (`docs/raw/homework-index.json`) |
| `npm run agent` | List / auto-complete leftover readings |
| `npm run typecheck` | Check the code after you edit it |

Deeper reverse-engineering tools for studying how the site works: `crawl-routes`,
`capture-api`, `login` — details in `docs/README.md`.

## Friendly dashboards

- **Terminal:** `npm run homework` → open homework grouped by section, sorted by due date.
- **Browser (LXP Homework):** in `assistant/`, run `npm run web` → dashboard at
  `http://localhost:4174` with done/expired badges and an AI answer panel. Or stay in the terminal
  with `npm run assistant -- list`. See `assistant/README.md`.

## Where things live

| Folder | What's inside |
|---|---|
| `docs/courses/` | Your course materials — one `.md` per item + downloaded attachments |
| `docs/raw/` | Raw JSON captures (`content-tree.json`, `homework-index.json`, …) |
| `src/` + `scripts/` | The code: auth, API client, and one script per command |
| `assistant/` | The friendly CLI + web dashboard + AI answers |
| `agent-docs/` | Distilled notes for working on this repo |

## Good to know (the gotchas)

- 🔑 The login token is **single-use** — every run logs in fresh. That's normal; just keep request
  volume low so you don't trip rate-limits.
- 🚫 Don't fully reload the LXP page mid-run — it kills the token. Navigate with
  `$nuxt.$router.push()`.
- 🛑 Auto-submitting quizzes/assignments isn't wired up on purpose — see `docs/gaps.md`.

## Fair use

This toolkit reads **your own** academic data for studying. Know what your institution allows,
and don't use it to fake completion of coursework.
