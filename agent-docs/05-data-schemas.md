# Data schemas — the JSON shapes you'll parse

These are the real shapes returned by the API. Raw examples live in `scraped/raw/`.

## Postgres store (source of truth)

Since the database foundation, the canonical data lives in **Postgres** (local, per-user;
`docker compose up -d db` + `npm run db:migrate`; schema in `apps/server/db/migrations/`).
The JSON shapes below are the raw scrape / UI cache; the DB is what the app and future AI read.

Domains (see `apps/server/db/migrations/0001_foundation.sql`):

- **Identity/tenant** — `institution`, `student`, `enrollment`.
- **Catalog** — `course`, `module`, `professor`, `module_professor`, `section`, `content_item`,
  `attachment`.
- **Question bank** — `question`, `question_option` (`question.text_hash` dedupes across terms).
- **Student activity** — `item_state` (append-only snapshot per scrape), `answer_attempt`
  (immutable attempts; the shown one is `is_current`), `answer_selection`, `submission`,
  `submission_payload`, `item_annotation`.
- **AI** — `ai_config`, `ai_run`.
- **Customization** — `professor_link` (per-student professor photo; see below).
- **Read model** — view `v_exercise_current` → projected to `apps/server/data/exercises.json`.

Runtime writes go straight to the DB via `apps/server/src/store.ts` (answers, submissions,
overrides, profile, AI config, `ai_run`). The old `answers.json` / `submissions.json` /
`overrides.json` / `profile.json` are **legacy**: the app no longer writes them; they are read
once by `import.ts` (reconciled by natural key) and then ignored. `exercises.json` is a cache
invalidated by `catalogVersion`.

### Professor identity (stable ids)

`context.teachers[]` is **course-wide** (the same faculty on every item), so it identifies who
teaches the course, not who owns a module. The module→professor link is resolved by
`apps/server/src/professor.ts`: it parses the `moduleTitle` suffix ("… - Profa. Débora Amorim"),
normalizes it, and matches tokens against `professor.full_name`, storing
`module_professor(module_id, professor_id, source, confidence)`. The app keys accents/grouping by
`safeaUserId` (stable across renames), never by the display string. Raw shape per teacher:

```json
{ "userId": 8346005, "roleCourseName": "Professor1", "safeaRole": "teacher",
  "name": "DEBORA AMORIM DE CARVALHO", "safeaUserId": 5723877, "externalUserId": "d72d…" }
```

### Professor photos (`professor_link`) + organization directory

Photos are **not downloaded server-side**. The browser loads them straight from
`https://unavatar.io/linkedin/<slug>`; `SubjectAvatar` falls back to the subject pictogram, then the
module monogram, on error. Two sources are resolved in `view.ts::enrich` (personal wins):

1. `professor_link` (`0005_professor_link.sql`) — per-student override keyed
   `(student_id, professor_id)`, storing a `linkedin_url` or a manual `image_url`. Endpoints:
   `GET /api/professor-links`, `POST /api/professor-link`, `DELETE /api/professor-link/:professorId`.
2. **Organization directory** — hardcoded in `apps/server/config/organizations.json` (org metadata +
   `professors: [{ name, linkedin, professorId? }]`), loaded by `apps/server/src/organizations.ts`
   and matched to local `professor` rows by normalized name (exact first, then a conservative
   token-subset flagged "probable"). `GET /api/organizations` feeds the Ajustes → Organização tab.

`professorPhotoUrl` is attached per exercise at request time (never written to the `exercises.json`
cache).

## Content item (normalized, in `scraped/raw/content-tree.json`)

Each leaf item in the scraped content tree looks like:

```json
{
  "courseId": 1234567,
  "courseName": "YOUR COURSE (CODE_CLASS_TERM)",
  "moduleId": 10000001, "moduleTitle": "Module title - Prof. Name",
  "sectionId": 10000002, "sectionTitle": "Material Didático",
  "itemId": 10000003, "itemTitle": "Apostila de exemplo",
  "topicTypeId": 3, "categoryTypeId": 2,
  "progressTypeId": 1, "isRecordProgress": false,
  "kind": "pdf",                    // pdf | reading | quiz | file_upload | link | forum | other
  "done": false, "viewed": false,
  "expired": false,
  "hasDeadline": false, "deadlineAt": null,
  "hasCompletedAllAttempts": null,
  "grade": null, "studentGrade": null,
  "attachments": [{ "url": "https://static.plataforma.grupoa.education/.../uuid.pdf",
                    "filename": "Apostila.pdf", "filesize": 834978 }],
  "html": "<div>…rendered content…</div>",   // null for quiz & link kinds
  "content": { … },                          // topic payload (below)
  "context": { … },                          // full academic context object
  "links": []                                // populated for link kind
}
```

## Quiz content (`topicTypeId` 15/29/30/37)

```json
{ "quizTypeId": 1, "hasFeedback": false, "isForShuffle": false,
  "instructions": "<p></p>", "hasRetries": false, "numberRetries": 1, "retryTypeId": 1,
  "hasCompletedAllAttempts": false,
  "questions": [ {
      "id": 36049942, "questionTypeId": 1,
      "enunciated": "<div class=\"question\">…HTML…</div>",
      "feedbackTypeId": 2, "hasFileUpload": false, "grade": 0,
      "options": [ { "id": 175978391, "text": "<div class=\"question-option\">…</div>" } ]
  } ] }
```

## File-upload / task content (`topicTypeId` 8)

```json
{ "html": "<div>…instructions…<grupoaattachment file=\"…docx\" filename=\"…\" filesize=\"…\"/></div>",
  "isExpectedAnswerVisible": false, "expectedAnswerAt": null,
  "hasFileUpload": true, "hasRetries": false, "numberRetries": 1, "retryTypeId": 1,
  "attempts": [], "hasCompletedAllAttempts": false,
  "maxFilesLimit": 1, "isUnlimitedFilesEnabled": false }
```

## Links content (`topicTypeId` 7) — `content.items[]`

```json
{ "items": [ { "id": 69607828, "title": "VÍDEO 002",
               "html": "<div>…</div>", "type": "video",
               "url": "https://www.youtube.com/watch?v=…",
               "icon": "mdi-play-circle-outline", "bookId": null } ] }
```

## Forum content (`topicTypeId` 9)

Topic-detail `content` carries the flags but `posts` is **always `[]`** — fetch the
thread from `/v1/plataforma/content/enrollment/{eid}/topic/{tid}/post` (see `03`).

```json
{ "countPosts": 5, "countOfMyPosts": 0, "isAllowLikes": true,
  "isToLimitResponses": false, "maxAnswerPerStudent": 0,
  "isOnlyVisibleToPeopleWithPost": false, "hasReachedPostLimit": false,
  "posts": [] }
```

Thread post (from the enrollment endpoint; `children` nests replies):

```json
{ "id": 5605173, "topicId": 89612128, "html": "<div>…</div>",
  "createdAt": "2026-08-25 22:11:33.712398", "updatedAt": "…", "isEdited": true,
  "enrollmentId": 120880466, "parentPostId": null,
  "isHidden": false, "isDeleted": false, "deletedBy": null,
  "postOwnerUsername": "NOME DO ALUNO", "postOwnerProfilePhoto": null,
  "postOwnerLtiRole": "urn:lti:role:ims/lis/Learner", "postOwnerSafeaRole": "student",
  "postOwnerRoleName": "Estudante", "mainGroupId": null,
  "children": [], "enrollmentIdsWhoLiked": [120887299] }
```

Completion: `countOfMyPosts > 0` (posting is the forum's "done").

## Reading / PDF — `content.html`

Contains custom tags to watch for:
- `<grupoabook file="https://static…/{uuid}.pdf" filename="…" filesize="…">` → PDF reading content
- `<grupoaattachment file="…" filename="…" filesize="…">` → embedded template files

## Grades — `/v1/plataforma/grades/me/course/{id}`

```json
{ "finalGrade": { "value": null, "isVisible": null, "formula": "" },
  "structure": [ {
      "id": 2724241, "name": "AVD1", "sequence": 1, "value": null,
      "children": [ {
          "id": 5487142, "name": "DBE I - BIM 1 - Exercício 001",
          "maxValue": 10, "value": null,
          "isSubmited": false, "submitedAt": null,
          "isRevised": false, "deadlineAt": "2026-03-26T22:00:00.000Z",
          "topicTypeId": 8, "categoryTypeId": 5 } ] } ] }
```

## Calendar appointments — `/v1/plataforma/calendar/appointment`

```json
[ { "id": 92629211, "title": "BDI - Atividade 07",
    "startAt": "2026-09-03 18:00:00", "endAt": "2026-09-03 20:00:00",
    "appointmentCategoryId": 1, "entityType": "topic", "isCompleted": false,
    "academicMain": [ { "academicMainId": 5254272, "academicMainTitle": "PROGRAMAÇÃO BACK-END …" } ] } ]
```

## LTI tools — `/v1/plataforma/content/lti/tool/list-by-alias/student`

```json
{ "results": [ { "id": 12971, "title": "Biblioteca Digital EAD",
                 "url": "https://…/lti/launch.php", "icon": "rocket-launch",
                 "isForOpenInNewTab": true, "ltiProviderId": 17045 } ] }
```
