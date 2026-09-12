# Topic types — how content is classified

Every content-tree node / item carries a `topicTypeId`. This is the authoritative mapping
(fetched from `/v1/plataforma/settings/institution/configuration/topic-types`). `categoryTypeId`
groups them into coarse buckets.

## The IDs that matter for automation

| `topicTypeId` | Name (pt) | alias | cat | Scraper `kind` |
|---|---|---|---|---|
| 1 | Grupo de módulos | folder | 1 | (module container) |
| 2 | Módulo | page | 1 | (section container) |
| **3** | **Conteúdo** | html | 2 | **reading / pdf** |
| 7 | Links | link_group | 4 | **link** |
| **8** | **Tarefa** | task | 5 | **file_upload (assignment)** |
| 9 | Fórum | forum | 6 | forum |
| 10 | Apresentação | presentation | 2 | other |
| 11 | Desafio | challenge | 5 | other |
| 12 | Infográfico | infographic | 2 | other |
| 13 | Sumário teórico | book | 2 | other |
| **15** | **Questionário** | quiz | 8 | **quiz** |
| 16 | Na prática | practice | 2 | other |
| 22 | Vídeo | video | 2 | other |
| **29** | **Pré-teste** | pre_test | 8 | **quiz** |
| **30** | **Pós-teste** | test | 8 | **quiz** |
| **37** | **Exercícios** | exercise | 8 | **quiz** |
| 49 | Saiba mais | know_more | 4 | other |

The table above is **not exhaustive** — full 53-entry list in `scraped/raw/topic-types.json`.
Notable tenant-specific junk entries exist (typos like `TESTE`, `Projeto_MKT_RTX`) — the platform
is "vibecoded".

## Classification buckets by `categoryTypeId`

| cat | Meaning | relevant kinds |
|---|---|---|
| 1 | containers | module / section / learning unit |
| 2 | rich content | presentation, video, book, infographic, … |
| 5 | **assignments** | task(8), challenge(11), case study(39), activity(51) |
| 8 | **quizzes/assessments** | quiz(15), exercise(37), pre/post-test(29/30) |
| 4 | links | link_group(7), reading indications |

## Which kinds are "actionable" (drivable)

- **reading / pdf** (type 3) — mark read via progress POST.
- **quiz** (types 15, 29, 30, 37) — has `content.questions[]`.
- **file_upload** (type 8) — has `content.hasFileUpload`, `content.maxFilesLimit`.

## Which kinds have a "Mark as completed" button

The portal shows **"Mark as completed"** on content-type items with
`isRecordProgress === true` and no submission flow: `pdf`, `reading`, `link`, and every
rich "other" type (apresentação 10, infográfico 12, livro 13, na prática 16, dica 22,
saiba mais 49, desafio 11). Clicking it sends an **empty-body** `POST .../topics/{id}/progress`
→ `204`. Quizzes, file-upload tasks and forums are **not** manually markable.

`packages/portal/src/content.ts::isMarkable(item)` captures this; `npm run agent -- --read` (alias
`--complete`) marks all pending ones. See `packages/portal/docs/gaps.md` §3.

## How the code classifies (`packages/portal/src/content.ts::classify`)

```ts
8        -> "file_upload"
37,15,29,30 -> "quiz"
7        -> "link"
9        -> "forum"
3        -> "reading" | "pdf"   (pdf if a *.pdf attachment exists, else reading)
default  -> "other"
```

## Present in the scraped course (measured)

| type | count | kind |
|---|---|---|
| 3 | 74 | reading/pdf |
| 8 | 35 | file_upload |
| 15 | 4 | quiz |
| 37 | 4 | quiz |
| 7 | 7 | link |
| 9 | 3 | forum |
| 10/11/12/13/16/22/49 | 18 | other |
