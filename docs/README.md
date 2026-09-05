# Grupoa LXP — Reverse-engineering documentation

Scraped + reverse-engineered state of the **UniFOA / Grupoa LXP** platform
(`unifoa2.grupoa.education` + `api.plataforma.grupoa.education`).

## Index

| Doc | Contents |
|---|---|
| [PLAN.md](PLAN.md) | original plan / source of truth (see corrections in auth.md) |
| [auth.md](auth.md) | SSO flow, single-use token lifecycle, headers, localStorage |
| [api-endpoints.md](api-endpoints.md) | every discovered API endpoint (verb, path, payload shape) |
| [topic-types.md](topic-types.md) | authoritative `topicTypeId` → name/alias/category mapping |
| [gaps.md](gaps.md) | write-side gap analysis (quiz submit, file upload) |
| [portal-map.md](portal-map.md) | frontend SPA routes (generated) |
| [api-captured.md](api-captured.md) | raw captured traffic (generated) |

## Scraped data

- **Courses** (`docs/courses/{courseId}-{slug}/`) — 1 course, **145 items**, one `.md` per item +
  a `README.md`. Every item includes metadata, rendered HTML, full `context`, `studentGrade`:
  - **8 quizzes** with complete question + option lists.
  - **35 file-uploads** with instructions, template attachments, limits.
  - **7 links** with their target URLs.
  - **102 attachment files** downloaded (PDF/PPTX/DOCX/ZIP, ~81 MB) → `docs/courses/**/files/`.
- **Routes** (`docs/routes/*.md`) — 10 SPA routes captured via client-side navigation (incl.
  course detail + grades grid).
- **Surfaces** (`docs/*.md`) — grades, calendar, notices, messages, achievements, communities,
  LTI tools, each as readable markdown + raw JSON.
- **Raw JSON** (`docs/raw/`) — `content-tree.json`, `routes.json`, `api-calls.json`,
  `surfaces.json`, `topic-types.json`, `example-quiz-topic.json`, `example-upload-topic.json`,
  `deep-api.json`, `deep-routes.json`, `homework-index.json`.

## Friendly dashboards

- **Terminal board:** `npm run homework` → open assignments/quizzes grouped by section, sorted by
  due date (`npm run homework -- --fresh` rebuilds the index first).
- **Web app:** `npm run web` → local dashboard at `http://localhost:4173` (Plan + Browse views,
  opens the downloaded PDFs natively). Built with Vite + React in `web/`.
- **LXP Assistant** (automation + AI product, lives in `assistant/`): ordered exercise list with
  green/red badges and **gpt-4o-mini answers in pt-BR**. See `assistant/README.md`.

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
npm run dump           # scrape all course content (incl. quizzes/uploads/links) + download files
npm run dump-surfaces  # scrape grades, calendar, notices, messages, achievements, communities, LTI
npm run crawl-routes   # crawl SPA routes (client-side) → docs/routes/** + portal-map.md
npm run capture-api    # record network → docs/api-captured.md
npm run agent          # list / auto-complete readings (quiz/upload pending — see gaps.md)
npm run index          # build docs/raw/homework-index.json (topic-linked homework index)
npm run homework       # friendly terminal board of open homework
npm run exercises -- <itemId>   # read a quiz's questions or an upload's info from the API
npm run web            # local web dashboard (builds web/ + serves docs)
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
const res = await client.get("/v1/plataforma/grades/me/course/5254272");
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
