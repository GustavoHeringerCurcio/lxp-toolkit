---
name: lxp-dashboard
description: Use when the user asks to see, explain, or visualize their homework, exercises, deadlines, or course progress on the UniFOA/Grupoa LXP portal. Triggers on: homework, exercises, tarefas, quizzes, deadlines, what's due, dashboard, "my work", "pending".
---

# LXP homework dashboard

When asked about homework / exercises / deadlines / course progress:

1. Read the precomputed index at `docs/raw/homework-index.json` (run `npm run index` first if it is
   missing or the scraped data changed).
2. Cross-reference `docs/raw/content-tree.json` when detail on a specific item is needed.
3. Explain homework in terms of **sections (topic units)** — not flat item lists. A section bundles
   content + practice quiz + the graded deliverable (file_upload). The real deadline lives on the
   `file_upload`.

## Key facts

- Only `file_upload` (Tarefa) items carry real deadlines (`deadlineAt`) in this course.
- Quiz items (`kind: "quiz"`, topicTypeId 15/37) have no `deadlineAt` but are still pending work.
- `homework-index.json` fields: `nextUp`, `homework[]` (each with `kind`, `deadlineAt`, `daysLeft`,
  `expired`, `files[]`, `siblings[]`), `courses[]`, `stats`.
- Local files live in `docs/courses/*/files/`, named `{itemId}_*` (openable/linkable by itemId).
- `nextUp` = the single nearest open assignment with a deadline.

## Friendly outputs to offer

- Terminal board: `npm run homework` (colorized). No TTY → still readable.
- Web visualizer: `npm run web` (local app, see `web/`).
- Plain summary: describe `nextUp`, then group open items by module.
