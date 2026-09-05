# Scraped data — what already exists & how to search it

You usually DON'T need to re-scrape — the data is already on disk. Read the right file instead of
hitting the live API.

## Content dumps

- `docs/courses/{courseId}-{slug}/README.md` — course overview + breakdown + every item linked.
- `docs/courses/{courseId}-{slug}/{itemId}-{slug}.md` — one file per content item (145 in the
  scraped course), containing: metadata table, attachments, quiz questions, assignment details,
  rendered HTML content, and raw JSON.
- `docs/courses/{courseId}-{slug}/files/` — 102 downloaded attachments (PDF/PPTX/DOCX/ZIP).
- `docs/raw/content-tree.json` — the whole course as normalized JSON (easiest to query
  programmatically / grep).

**To answer "is X done / what's due / how many quizzes":** read `content-tree.json` or the course
`README.md`. Example queries:
```bash
# list all undone quizzes
node -e 'const c=require("./docs/raw/content-tree.json");c[0].items.filter(i=>i.kind==="quiz"&&!i.done).forEach(i=>console.log(i.itemTitle,i.itemId))'
```

## Surface dumps

- `docs/grades-5254272-*.md` — human-readable gradebook (categories + evaluations + grades).
- `docs/calendar.md`, `docs/calendar-types.md` — appointments in a 5-week window.
- `docs/notices.md`, `docs/messages.md`, `docs/message-categories.md` — notices & messages.
- `docs/achievements.md`, `docs/communities.md`, `docs/lti-tools.md` — those surfaces.
- `docs/raw/surfaces.json` — all of the above as raw JSON (grades keyed by course).

## Routes & network

- `docs/portal-map.md` — index of captured SPA routes.
- `docs/routes/*.md` — per-route DOM text capture (10 routes).
- `docs/api-captured.md` + `docs/raw/api-calls.json` — captured API traffic (headers redacted).
- `docs/raw/deep-api.json`, `docs/raw/deep-routes.json` — deeper navigation captures.

## Reference JSON

- `docs/raw/topic-types.json` — authoritative 53-entry topic-type mapping.
- `docs/raw/example-quiz-topic.json`, `docs/raw/example-upload-topic.json` — example API payloads.

## When to re-scrape instead

- Data changed (new items, grades updated, submissions made).
- You need something not captured (a specific PDF body, a route not in the 10, a fresh calendar
  window). Run the relevant script from `06-tooling.md`.

## Golden rule

Read, don't rewrite: prefer grepping `docs/` over re-running the scraper for the same answer.
The scraper needs a live login + token (see `02-auth.md`), which is slower and rate-limit-prone.
