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
  `deep-api.json`, `deep-routes.json`.

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
```
