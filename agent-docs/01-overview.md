# Overview — the UniFOA / Grupoa LXP portal

## What the student actually uses

There are **two distinct systems** that connect via SSO:

### 1. Lyceum — `unifoa.lyceum.com.br` (academic system, OUT OF SCOPE for scraping)
- The classic student portal: enrollments, finance, documents, schedule, etc.
- Angular hash SPA at `/aluno/#/…`.
- **Used in this project ONLY as the login gateway** to reach the LXP. Do not scrape it.
- Interesting fact: login is direct (username = RA, e.g. `REDACTED_RA`) — no Microsoft SAML redirect
  happens for this tenant.

### 2. Grupoa LXP "Plataforma A" — `unifoa2.grupoa.education/plataforma/` (THE scrape target)
- The learning experience platform: course content, quizzes, file-upload assignments, grades,
  calendar, notices, messages, achievements, communities, LTI tools.
- **Nuxt 3 SPA** (client-side rendered). Base path `/plataforma/`.
- Talks to the JSON API at `https://api.plataforma.grupoa.education`.
- Auth: a bearer token stored in `localStorage["plataforma_accessToken"]`.

### How they connect (SSO handoff)
Lyceum's nav menu contains an **"LXP"** entry whose URL carries a one-time `tokenId`. Opening that
URL in the LXP SPA produces the bearer token used for all API calls. Full detail: `02-auth.md`.

## Current scraped state (what the agent can rely on)

- One enrolled course: **`5254272` — "PROGRAMAÇÃO BACK-END (8793_T01_2026_2)"**
  under the category **"SISTEMAS DE INFORMAÇÃO"** (`117574`), period `2026/2`.
- Course contains **145 content items**: 74 readings/PDFs (type 3), 35 file-upload tasks (type 8),
  8 quizzes (types 15/37), 7 links (type 7), 3 forums (type 9), 18 other.
- 102 attachment files (PDF/PPTX/DOCX/ZIP) already downloaded locally.
- All read surfaces mapped: content, grades, calendar, notices, messages, achievements,
  communities, LTI tools. See `03-api-endpoints.md`.

## The project's purpose

Reverse-engineer the platform (read-side), document it, and enable an LLM agent to answer
questions about it and drive automation. The **write side** (quiz-answer submission, file upload,
forum posting) is **deliberately not automated** — it mutates the student's academic record and is
a separate academic-integrity decision. It is documented conceptually only.
