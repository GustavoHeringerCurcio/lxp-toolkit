# Grupoa LXP — Reverse-engineering documentation

Scraped + reverse-engineered state of the **UniFOA / Grupoa LXP** platform
(`unifoa2.grupoa.education` + `api.plataforma.grupoa.education`).

## Index

| Doc | Contents |
|---|---|
| [auth.md](auth.md) | SSO flow, single-use token lifecycle, headers, localStorage |
| [api-endpoints.md](api-endpoints.md) | every discovered API endpoint (verb, path, payload shape) |
| [topic-types.md](topic-types.md) | authoritative `topicTypeId` → name/alias/category mapping |
| [gaps.md](gaps.md) | write-side gap analysis (quiz submit, file upload) |

> Generated captures (route maps, raw API traffic, course content) are **not** committed — they
> are per-account and written to the gitignored `scraped/` directory. Run the scraper with your
> own `.env` credentials to produce them.

## Scraped data

Each user scrapes **their own** account into `scraped/` (gitignored — never commit it):

- **Courses** (`scraped/courses/{courseId}-{slug}/`) — one `.md` per item + a `README.md`.
  Every item includes metadata, rendered HTML, full `context`, and your `studentGrade`.
  - Quizzes with complete question + option lists.
  - File-uploads with instructions, template attachments, limits.
  - Downloaded attachments (PDF/PPTX/DOCX/ZIP) → `scraped/courses/**/files/`.
- **Routes** (`scraped/routes/*.md`) — SPA routes captured via client-side navigation.
- **Surfaces** (`scraped/*.md`) — grades, calendar, notices, messages, achievements, communities,
  LTI tools, each as readable markdown + raw JSON.
- **Raw JSON** (`scraped/raw/`) — `content-tree.json`, `hidden-index.json`, `routes.json`,
  `api-calls.json`, `surfaces.json`, `topic-types.json`, `example-quiz-topic.json`,
  `example-upload-topic.json`, `deep-api.json`, `deep-routes.json`, `homework-index.json`.
- **Hidden topics** (`scraped/raw/hidden-index.json`) — the topic-detail endpoint serves content
  by id even when the topic is absent from the student's tree. `npm run dump` harvests those
  (`origin: "hidden"`); the app surfaces them read-only at `/gods-eye`.

## Friendly dashboards

- **Terminal board:** `npm run homework` → open assignments/quizzes grouped by section, sorted by
  due date (`npm run homework -- --fresh` rebuilds the index first).
- **LXP Toolkit** (the main product, lives in `apps/`): a web app with a deadline-ordered task
  board, an AI answer workbench (drafts in pt-BR, with version history), quiz practice and a
  gated send flow. See `apps/server/README.md`.

## Facts worth remembering

- Login is **always** via `unifoa.lyceum.com.br`; the LXP token is single-use and cannot be
  reused across runs (see auth.md).
- The LXP SPA is Nuxt 3, base path `/plataforma/`; use `$nuxt.$router.push()` for client-side
  navigation (a `page.goto` reload kills the token).
- The API sits behind AWS WAF; GET reads work with the bearer token alone, writes may need the
  `aws-waf-token` cookie.
- The platform is "vibecoded": topic-type names/aliases contain typos (`TESTE`, `Projeto_MKT_RTX`),
  and some endpoints return `[]` to direct fetch but full data to the SPA.

## Commands

```bash
npm run dump           # scrape your course content (incl. quizzes/uploads/links) + hidden topics + files
npm run dump-surfaces  # scrape your grades, calendar, notices, messages, achievements, communities, LTI
npm run crawl-routes   # crawl SPA routes (client-side) → scraped/routes/** + scraped/portal-map.md
npm run capture-api    # record network → scraped/api-captured.md
npm run catalog        # normalize the platform's features[] manifest → agent-docs/endpoint-catalog.json
npm run agent          # list / auto-complete readings (quiz/upload pending — see gaps.md)
npm run index          # build scraped/raw/homework-index.json (topic-linked homework index)
npm run homework       # friendly terminal board of open homework
npm run exercises -- <itemId>   # read a quiz's questions or an upload's info from the API
```

Additional one-off runners (not wired as `npm run` scripts — invoke with `npx tsx`):

```bash
npx tsx packages/portal/scripts/discover-exams.ts   # find exam topics by id sweep
npx tsx packages/portal/scripts/fetch-exams.ts      # fetch the discovered exam topics
npx tsx packages/portal/scripts/capture-forum.ts    # headful forum capture
npx tsx packages/portal/scripts/capture-forum-write.ts  # forum write discovery
```

## Topics to learn

This project is a real-world intro to reverse-engineering a web app. If you're an intern getting
started, work through these in order — each one maps directly to a file or concept in this repo.

### 1. JavaScript + TypeScript (foundation)
Variables, functions, `async`/`await`, objects/arrays, `import`/`export`, and `fetch`.
Every `src/*.ts` file is a small, readable example.

### 2. HTTP — how the web actually works
Methods (GET/POST), URLs + query params, headers, request/response bodies, status codes
(200 / 204 / 403 / 429). This is the most important concept here — every entry in
[docs/api-endpoints.md](api-endpoints.md) is just "a URL + a verb + headers". Read
[src/client.ts](../src/client.ts) to see it in practice.

### 3. Browser DevTools → Network tab (your #1 reverse-engineering tool)
Press F12 → **Network** → filter by **Fetch/XHR**, click around the site, and read each request:
URL, headers, response JSON. This is exactly how this whole API was mapped. Pair it with
[src/network.ts](../src/network.ts) (`NetworkRecorder`).

### 4. Authentication — bearer tokens & SSO
How `authorization: <token>` works, what `localStorage` is, why tokens expire. A concrete,
annotated example lives in [docs/auth.md](auth.md) and [src/auth.ts](../src/auth.ts).

### 5. Playwright (browser automation)
`page.goto`, `page.fill`, `page.evaluate`, `page.on("request")`. Used here to log in, grab the
token, and navigate. See [src/session.ts](../src/session.ts) and the `scripts/*.ts` files.

### 6. How SPAs work (single-page apps)
This site is a Nuxt 3 SPA: the browser renders the UI and calls a JSON API behind the scenes.
That's why link-crawling doesn't work and you must navigate with `$nuxt.$router.push()`.

### Suggested first exercise
Write a tiny script that logs in and prints your grades by reusing `createSession()` and:

```ts
const res = await client.get("/v1/plataforma/grades/me/course/<yourCourseId>");
console.log(JSON.stringify(res.data, null, 2));
```

That single exercise teaches auth, HTTP, and the API in one go. Then try a Discord/Telegram
notifier that polls `/v1/notification-service/notifications`.

### Gotchas you *will* hit
- The token dies on a full page reload → navigate with `$nuxt.$router.push`, never `page.goto`.
- `tsx` breaks `page.evaluate` with `__name is not defined` → a shim already handles it
  (see [src/session.ts](../src/session.ts)).
- The API sits behind AWS WAF → GET works fine; writes (quiz/upload submit) may need a real
  browser to solve the challenge.
- Automating your own coursework touches your institution's academic-integrity rules — know
  what's allowed, and keep request volume low to avoid rate-limits.
