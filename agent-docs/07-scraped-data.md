# Scraped data — what already exists & how to search it

You usually DON'T need to re-scrape — the data is already on disk under `scraped/` (gitignored,
per-account). Read the right file instead of hitting the live API.

> If `scraped/` is empty, the current user hasn't scraped yet: run `npm run dump` /
> `npm run dump-surfaces` / `npm run index` with their own `.env` credentials.

## Content dumps

- `scraped/courses/{courseId}-{slug}/README.md` — course overview + breakdown + every item linked.
- `scraped/courses/{courseId}-{slug}/{itemId}-{slug}.md` — one file per content item, containing:
  metadata table, attachments, quiz questions, assignment details, rendered HTML content, and raw
  JSON.
- `scraped/courses/{courseId}-{slug}/files/` — downloaded attachments (PDF/PPTX/DOCX/ZIP).
- `scraped/raw/content-tree.json` — the whole course as normalized JSON (easiest to query
  programmatically / grep).

**To answer "is X done / what's due / how many quizzes":** read `content-tree.json` or the course
`README.md`. Example queries:
```bash
# list all undone quizzes
node -e 'const c=require("./scraped/raw/content-tree.json");c[0].items.filter(i=>i.kind==="quiz"&&!i.done).forEach(i=>console.log(i.itemTitle,i.itemId))'
```

## Surface dumps

- `scraped/grades-{courseId}-*.md` — human-readable gradebook (categories + evaluations + grades).
- `scraped/calendar.md`, `scraped/calendar-types.md` — appointments in a 5-week window.
- `scraped/notices.md`, `scraped/messages.md`, `scraped/message-categories.md` — notices & messages.
- `scraped/achievements.md`, `scraped/communities.md`, `scraped/lti-tools.md` — those surfaces.
- `scraped/raw/surfaces.json` — all of the above as raw JSON (grades keyed by course).

## Routes & network

- `scraped/portal-map.md` — index of captured SPA routes.
- `scraped/routes/*.md` — per-route DOM text capture.
- `scraped/api-captured.md` + `scraped/raw/api-calls.json` — captured API traffic (headers redacted).
- `scraped/raw/deep-api.json`, `scraped/raw/deep-routes.json` — deeper navigation captures.

## Reference JSON

- `scraped/raw/topic-types.json` — authoritative 53-entry topic-type mapping.
- `scraped/raw/example-quiz-topic.json`, `scraped/raw/example-upload-topic.json` — example API payloads.

## When to re-scrape instead

- Data changed (new items, grades updated, submissions made).
- You need something not captured (a specific PDF body, a route not captured, a fresh calendar
  window). Run the relevant script from `06-tooling.md`.

## Golden rule

Read, don't rewrite: prefer grepping `scraped/` over re-running the scraper for the same answer.
The scraper needs a live login + token (see `02-auth.md`), which is slower and rate-limit-prone.
