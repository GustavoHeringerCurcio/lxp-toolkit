# 🎓 LXP Assistant

Friendly views of your LXP exercises + **AI-generated answers** using a cheap model
(`gpt-4o-mini` by default). It reads the scraped data produced by the study repo (root of this
repository) and never talks to the portal except to read content.

```
┌─────────────────────────────┐      data (../docs)          ┌──────────────────────┐
│ CLI: npm run assistant      │  ──► content-tree.json ──►   │ data/exercises.json  │
│ Web:  npm run web           │                               │  + answers.json      │
└─────────────────────────────┘                               │  + overrides.json    │
                       └────────── AI (OpenAI gpt-4o-mini) ──►│  ai-config.json      │
```

## Setup

```bash
cd assistant
cp .env.example .env     # put your OPENAI_API_KEY (gitignored)
npm install
npm run index            # build data/exercises.json from ../docs (run the study `npm run dump` first)
```

Everything editable by hand lives in `assistant/config/`:
- **`ai-config.json`** → `model`, `temperature`, `max_output_tokens` and **`message_template`**.
  The template is the **entire message** sent to the model (a single `user` message); it contains
  `{placeholders}` filled with the activity content at generation time. Nothing is injected behind
  the scenes.
- **`profile.json`** → your `nome` / `matricula` (filled once in the web UI; feeds the
  `{nome}` / `{matricula}` placeholders).
- **`overrides.json`** → per-exercise `aiRequest` (custom message template), `hide`, `tag`,
  `manualStatus`.

## Terminal

```bash
npm run assistant -- list                # open exercises, deadline-first (chips: 🟢done 🔴expired)
npm run assistant -- list --all          # include expired + done
npm run assistant -- list --quizzes      # filter by kind
npm run assistant -- show <id>           # instructions + files + quiz questions
npm run assistant -- note <id> "…"       # add context for the AI
npm run assistant -- answer <id>         # generate an answer (streams), saves to data/answers.json
npm run assistant -- export <id>         # answer → assistant/out/<id>.md + .txt
npm run assistant -- config              # show current model / config path
npm run assistant -- send <id>           # ⚠ not available yet (submit endpoints not captured)
```

## Web

```bash
npm run web        # builds + serves → http://localhost:4174
```

- **List** ordered by deadline with badges (green done / red expired / amber due soon). Each card
  has a quick-action menu (Gerar com IA, abrir no portal, copiar link, baixar resposta).
- **Activity detail** (`/tarefa/:id`): instructions, files (PDFs open via `/docs/…`), quiz
  questions, an **"O que a IA recebe"** editor — one textarea holding the whole message sent to the
  model, with click-to-insert placeholders and a live preview — and an **answer workbench** that
  streams the AI answer and keeps a **version history** (regenerate keeps previous drafts).
- **Perfil** (menu / header) sets your name/matrícula.
- **Ajustes** (`/ajustes`) sets the model, temperature and max output tokens.

## Data model

Every exercise is one of:
- **upload** (`Tarefa`) — the exercise is its attached PDFs / instructions; answer = a file.
- **quiz** (`Questionário`/`Exercícios`) — questions are in the platform; answer = the selection.

`npm run index` normalizes the scraped content tree into `data/exercises.json`, computing
`status` (`done` / `expired` / `open`) and `daysLeft`. Answers are stored separately in
`data/answers.json` so regenerating the index never wipes them.

## AI answers

The model receives exactly one message: the **`message_template`** (global, or the per-exercise
override) with its placeholders replaced. Available placeholders: `{nome}`, `{matricula}`,
`{atividade}`, `{tipo}`, `{modulo}`, `{prazo}`, `{enunciado}`, `{arquivos}`, `{questoes}` and
`{observacoes}`. `{nome}` / `{matricula}` come from `config/profile.json`; the rest come from the
activity (instructions, PDF text or quiz questions). Every
generation saves a **new version** (history kept in `data/answers.json`); you can restore any of
them before sending. Copy / download it and submit what you'll stand behind — auto-submit
endpoints are not wired by default.
