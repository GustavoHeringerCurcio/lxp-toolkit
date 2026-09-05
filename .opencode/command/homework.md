---
description: Show the friendly homework board — open assignments + quizzes grouped by section, sorted by due date.
agent: build
---

Run the homework dashboard and summarize it for the user.

1. Run: `npm run homework`
2. If the index is missing/stale, first run `npm run index`.
3. Present the output: highlight `nextUp` (closest deadline), the grouped open items, and note how many are expired.

Keep the summary short and friendly — the terminal board is the source of truth.
