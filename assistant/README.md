# 🎓 LXP Assistant

Friendly views of your LXP exercises + **AI-generated answers (pt-BR)** using a cheap model
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
- **`ai-config.json`** → `model`, `temperature`, `language`, `max_output_tokens`, and the
  **`system_prompt`** (edit freely; `{language}` is replaced at runtime).
- **`overrides.json`** → per-exercise `notes` (context for the AI), `hide`, `tag`, `manualStatus`.

## Terminal

```bash
npm run assistant -- list                # open exercises, deadline-first (chips: 🟢done 🔴expired)
npm run assistant -- list --all          # include expired + done
npm run assistant -- list --quizzes      # filter by kind
npm run assistant -- show <id>           # instructions + files + quiz questions
npm run assistant -- note <id> "…"       # add context for the AI
npm run assistant -- answer <id>         # generate pt-BR answer (streams), saves to data/answers.json
npm run assistant -- export <id>         # answer → assistant/out/<id>.md + .txt
npm run assistant -- config              # show current model / config path
npm run assistant -- send <id>           # ⚠ not available yet (submit endpoints not captured)
```

## Web

```bash
npm run web        # builds + serves → http://localhost:4174
```

- **List** ordered by deadline with badges (green done / red expired / amber due soon).
- **Activity detail**: instructions, files (PDFs open in the browser via `/docs/…`), quiz
  questions, notes box, and an **AI panel** that generates the answer, with Copy / Download .md.
- Config shown in the header (edit `config/ai-config.json` to change the model).

## Data model

Every exercise is one of:
- **upload** (`Tarefa`) — the exercise is its attached PDFs / instructions; answer = a file.
- **quiz** (`Questionário`/`Exercícios`) — questions are in the platform; answer = the selection.

`npm run index` normalizes the scraped content tree into `data/exercises.json`, computing
`status` (`done` / `expired` / `open`) and `daysLeft`. Answers are stored separately in
`data/answers.json` so regenerating the index never wipes them.

## AI answers

Prompt = `system_prompt` + instructions + PDF text (text-based PDFs) or quiz questions + your
notes → answer in **pt-BR**, natural, student-like. Save/copy it and submit what you'll stand
behind — auto-submit endpoints are intentionally not wired (they're not captured yet and would
consume real attempts).
