# 🎓 LXP Homework

Friendly views of your LXP exercises + **AI-generated answers**. It reads the scraped data
produced by the study repo (root of this repository) and never talks to the portal except to read
content.

```
┌─────────────────────────────┐      data (../docs)          ┌──────────────────────┐
│ CLI: npm run assistant      │  ──► content-tree.json ──►   │ data/exercises.json  │
│ Web:  npm run web           │                               │  + answers.json      │
└─────────────────────────────┘                               │  + overrides.json    │
                       └────────── AI (OpenAI gpt-4o) ──────►│  ai-config.json      │
```

## Setup

```bash
cd assistant
cp .env.example .env     # put your OPENAI_API_KEY (gitignored)
npm install
npm run index            # build data/exercises.json from ../docs (run the study `npm run dump` first)
```

Everything editable by hand lives in `assistant/config/`:
- **`ai-config.json`** → `model`, `temperature`, `max_output_tokens`, the structured **`style`**
  rules and the **`activitySections`** toggles. The style becomes the `system` message and the
  selected activity content becomes the `user` message.
- **`profile.json`** → your `nome` / `matricula` (filled once in the web UI; feeds the
  `{nome}` / `{matricula}` placeholders).
- **`overrides.json`** → per-exercise `aiRequest` (free-text extra instructions), `notes`, `hide`,
  `tag`, `manualStatus`.

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
- **Activity detail** (`/tarefa/:id`): instructions, files (PDFs open via `/scraped/…`), quiz
  questions, an **"O que a IA recebe"** editor — free-text extra instructions just for that
  activity, with a live preview of the compiled `system` + `user` messages — and an **answer
  workbench** that streams the AI answer and keeps a **version history** (regenerate keeps previous
  drafts).
- **Atualizar** (header) scrapes fresh portal content (`npm run dump` in the study repo) and
  rebuilds the list (`npm run index`), showing progress and reloading when done.
- **Perfil** (menu / header) sets your name/matrícula.
- **IA Ajustes** (`/ajustes`) edits the writing rules as cards (voz, formato, regras, conteúdo
  enviado) plus the model, temperature and max output tokens, with a live preview of the `system`
  message.

## Data model

Every exercise is one of:
- **upload** (`Tarefa`) — the exercise is its attached PDFs / instructions; answer = a file.
- **quiz** (`Questionário`/`Exercícios`) — questions are in the platform; answer = the selection.

`npm run index` normalizes the scraped content tree into `data/exercises.json`, computing
`status` (`done` / `expired` / `open`) and `daysLeft`. Answers are stored separately in
`data/answers.json` so regenerating the index never wipes them.

## AI answers

The model receives **two messages**: a `system` message compiled from the structured `style` rules
(plus any per-exercise extra instructions) and a `user` message with the selected activity content.
The activity scaffolding is built in code — no `=== … ===` markers are sent, so the model has
nothing to echo back. Available placeholders: `{nome}`, `{matricula}`, `{atividade}`, `{tipo}`,
`{modulo}`, `{prazo}`, `{enunciado}`, `{arquivos}`, `{questoes}` and `{observacoes}`.
`{nome}` / `{matricula}` come from `config/profile.json`; the rest come from the activity
(instructions, PDF text or quiz questions). Every
generation saves a **new version** (history kept in `data/answers.json`); you can restore any of
them before sending. **Gerar e enviar** generates and submits in one step (upload and quiz) via a
real browser runner; a confirmation dialog is always shown before anything reaches the portal.
For upload tasks the dialog lets you pick the delivery format: **Texto direto** (typed into the
portal's reply editor), **Arquivo .txt** or **Arquivo .pdf** (converted with LibreOffice and
attached). Before confirming you can **Pré-visualizar** or **Baixar** the exact `.txt`/`.pdf` file
that will be attached — it is generated from the current draft without submitting. Quizzes are
answered by selecting the marked alternatives.

## Documentação

- [docs/README.md](./docs/README.md) — objetivo e fluxo ponta a ponta.
- [docs/PROMPT.md](./docs/PROMPT.md) — regras de escrita enviadas ao modelo.
- [docs/ARQUITETURA.md](./docs/ARQUITETURA.md) — como as peças se conectam.
