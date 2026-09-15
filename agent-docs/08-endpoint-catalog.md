# Endpoint catalog — the full LXP API surface (self-published)

> **Audience:** humans and AI agents doing feature work on the LXP Toolkit.
> **Why this exists:** the platform publishes its own action → endpoint manifest. We no longer
> have to guess URLs — we can read the menu.
> **Machine-readable twin:** [`endpoint-catalog.json`](./endpoint-catalog.json) (generated; same
> folder). Use the JSON when you need to filter/program against the surface; use this doc for the
> narrative, the domain map, and the feature backlog.
> **Regenerate:** `npm run catalog` → `scripts/endpoint-catalog.mjs`.

---

## TL;DR

- `GET /v2/safea-client/users/me` returns a **`features[]` manifest of 232 entries**: every SPA
  action mapped to its `alias`, `httpMethod`, `endpoint`, `webRoute`, `icon` and menu metadata.
- Deduped, that is **131 unique API endpoints** — **80 GET · 29 POST · 10 DELETE · 7 PUT · 5 PATCH**
  — plus **15 SPA web routes**.
- We currently consume **~15** of them (content tree/topic, forum read, gradebook, courses,
  topic-types, progress/quiz writes). Everything else is the feature backlog.
- The **visibility gap** (God's Eye) generalizes: several *read* endpoints do not enforce
  enrollment/visibility. Treat "read by id" as available until proven otherwise.
- Two families are pure gold for a study copilot and completely unused today:
  **corrections/feedback** and **webconference recordings**.

---

## 1. How we found it (methodology)

1. **The self-published manifest.** The identity call
   `GET /v2/safea-client/users/me` includes `features[]` — the platform's own registry of actions.
   Each row looks like:

   ```json
   {
     "description": "Home",
     "id": 404,
     "applicationId": 67,
     "featureParentId": null,
     "alias": "home",
     "endpoint": "/",
     "webRoute": null,
     "status": 1,
     "httpMethod": "GET",
     "menuPosition": -1,
     "icon": "mdi-home-variant-outline",
     "menuVisibility": true
   }
   ```

   Capture it with `npm run capture-api`, then `npm run catalog` normalizes it.

2. **The captured traffic.** `scraped/raw/api-calls.json`, `deep-api.json` and `surfaces.json`
   hold real request/response bodies (headers redacted) that we use to confirm shapes.

3. **The SPA store strings.** `scraped/api-captured.md` embeds the obfuscated Nuxt/Vuex bundle;
   its string table leaks the same action names (`api-content-v2-get-topic`,
   `api-content-v1-get-correction-answers`, …). Cross-checking the manifest against the bundle
   gives high confidence in the endpoint paths.

4. **The visibility gap.** `harvestHiddenTopics` (`packages/portal/src/content.ts`) proved the
   topic-read endpoint serves content for topics absent from the student's tree. That is the
   generalizable discovery: *reads are often under-enforced.*

> **Note on scope.** `features[]` covers the **Plataforma A** application (`applicationId: 67`).
> The `/widget/*` and `/v1/notification-service/*` endpoints are served by separate services and
> appear in captured traffic, not in this manifest.

---

## 2. Manifest schema

| Field | Meaning |
|---|---|
| `alias` | Stable action name (`api-content-v2-get-topic`, `home`). Two aliases can point at the same endpoint (a human name + an `api-…` name) — hence 232 entries / 131 unique endpoints. |
| `description` | Human label (pt-BR). Great for guessing intent. |
| `httpMethod` | `GET` = read; `POST/PUT/PATCH/DELETE` = write. |
| `endpoint` | API path (contains `:params`). |
| `webRoute` | SPA route (for `wc-*` web components / pages). |
| `applicationId` | Owning application (67 = Plataforma A). |
| `menuPosition` / `menuVisibility` / `icon` | How the SPA renders it in navigation. |
| `status` | 1 = active. |

**Access model derived from method:** `GET`/`HEAD` → **read**; everything else → **write**.

---

## 3. Access model: read vs write, and the visibility gap

- **Reads (80 GET endpoints)** are cheap and generally safe. The bearer token is enough; AWS WAF
  rarely challenges GETs. *Visibility/enrollment is not always enforced* (God's Eye).
- **Writes (51 endpoints)** mutate your academic record or account state. They may require the
  browser WAF session, and they are the same academic-integrity decision as the existing send
  flow. Documented conceptually; not to be automated blindly.
- **Single-use token.** Never `page.goto` the LXP after login; navigate the SPA with
  `window.$nuxt.$router.push()` (see `06-tooling.md`).

---

## 4. Endpoint catalog by domain

Legend for **Our status**: ✅ already used · 🔜 strong candidate · ⚪ unexplored.
"Access" is `R` (read) / `W` (write). Paths are the real API paths; `:param` are placeholders.

### 4.1 Content — the core (108 manifest entries, ~48 unique endpoints)

| Method | Path | What it gives | Our status |
|---|---|---|---|
| GET | `/v2/plataforma/content/academics-main/:courseId/contents` | Full module→section→item tree | ✅ `collectContent` |
| GET | `/v2/plataforma/content/academics-main/:courseId/topics/:topicId` | **Richest source** — `topics.content` + `context`; under-enforced (God's Eye) | ✅ `collectContent` / harvest |
| GET | `/v1/plataforma/content/enrollment/:enrollmentId/topic/:topicId/post` | Forum thread (paginated) | ✅ `collectContent` |
| GET | `/v1/plataforma/content/enrollment/:enrollmentId/quiz/:topicId` | Quiz by enrollment (attempt state) | 🔜 |
| GET | `/v1/plataforma/content/enrollment/:enrollmentId/discursive/:topicId` | **Discursive (essay) answer by enrollment** | 🔜 |
| GET | `/v1/plataforma/content/enrollment/:enrollmentId/topic/:topicId` | Topic content scoped by enrollment | 🔜 |
| GET | `/v1/plataforma/content/enrollment/:enrollmentId/page/:parentTopicId` | Page content scoped by enrollment | ⚪ |
| GET | `/v1/plataforma/content/main-content/:contentId/corrections/:topicId/enrollment/:enrollmentId` | **Professor corrections / feedback** | 🔜 |
| GET | `/v2/plataforma/content/academics-main/:courseId/topics/:topicId/corrections/counts` | Correction counts (unread feedback badge) | 🔜 |
| GET | `/v2/plataforma/content/academics-main/:courseId/topics/:topicId/references` | **Bibliography / references** | 🔜 |
| GET | `/v2/plataforma/content/academic-main/:courseId/topics/:topicId/scorm/:scormId/launch-link` | SCORM launch link | 🔜 |
| GET | `/v2/plataforma/content/academics-main/:courseId/topics/:topicId/h5p/uuid` | H5P state UUID | 🔜 |
| GET | `/v2/plataforma/content/academics-main/:courseId/topics/:topicId/webconference/records` | **Class recordings list** | 🔜 |
| GET | `/v2/plataforma/content/academics-main/:courseId/topics/:topicId/webconference/records/:recordId/url` | Recording playback URL | 🔜 |
| GET | `/v2/plataforma/content/academics-main/:courseId/topics/:topicId/webconference/url` | Live webconference URL | 🔜 |
| GET | `/v1/plataforma/content/webconference/collab/:contextId/records` | Blackboard-collab recordings | 🔜 |
| GET | `/v1/plataforma/content/webconference/collab/record/:recordId/url` | Collab recording URL | 🔜 |
| GET | `/v1/plataforma/content/lti/tool/list-by-alias/:roleAlias` | LTI tool list (library, AvaliA, …) | ✅ surfaces dump |
| GET | `/v1/plataforma/content/lti/launch` | LTI launch payload | ⚪ |
| GET | `/v2/plataforma/content/academics-main/:courseId/topics/:topicId/posts/:parentPostId` | Replies to a forum post | ⚪ |
| GET | `/v1/plataforma/content/main-content/:contentId/topic/:topicId/post` | All forum comments for a topic | ⚪ |
| GET | `/v1/plataforma/content/upload` | S3 upload pre-sign | ⚪ |
| GET | `/v1/plataforma/content/link/check/` | Link health check | ⚪ |
| GET | `/v2/plataforma/content/academics-main/:courseId/contents/:topicType/:topicId` | Content tracking / engagement | ⚪ |
| POST | `/v2/plataforma/content/academics-main/:courseId/topics/:topicId/progress` | Mark as completed | ✅ `markRead` |
| DELETE | `/v2/…/topics/:topicId/progress` | Unmark progress | ⚪ |
| POST | `/v2/plataforma/content/academics-main/:courseId/topics/:topicId/quizzes` | Answer one quiz question | ✅ `send.ts` |
| POST | `/v2/…/topics/:topicId/quizzes/attempts` | Finish a quiz attempt | ✅ `send.ts` |
| POST | `/v2/plataforma/content/academics-main/:courseId/topics/:topicId/tasks` | Submit a task (file upload) | ✅ `send.ts` |
| POST | `/v1/plataforma/content/enrollment/:enrollmentId/discursive/:topicId` | Submit a discursive answer | 🔜 (essay send) |
| POST | `/v1/plataforma/content/topic/:topicId/enrollment/:enrollmentId/post` | Forum post / reply | ✅ `submit-task` |
| PATCH | `/v1/plataforma/content/topic/:topicId/post/:postId/enrollment/:enrollmentId` | Edit own post | ⚪ |
| POST/DELETE | `/v2/…/topics/:topicId/likes` | Like / unlike topic | ⚪ |
| POST/DELETE | `/v1/plataforma/content/topic/:topicId/enrollment/:enrollmentId/like` | Like / unlike topic (v1) | ⚪ |
| POST/DELETE | `/v1/…/post/:postId/enrollment/:enrollmentId/like` | Like / unlike comment | ⚪ |
| POST | `/v2/plataforma/content/academics-main/:courseId/topics/:topicId/access-code` | Validate topic access code | ⚪ |
| POST | `/v2/…/topics/:topicId/evaluate-contents` | Rate the content | ⚪ |
| POST | `/v2/…/topics/:topicId/avalia-activities` | Submit an AvaliA assessment | ⚪ |
| POST | `/v2/…/topics/:topicId/avalia-activities/sso` | AvaliA SSO launch | ⚪ |
| POST | `/v1/plataforma/content/main-content/:courseId/topic/:topicId/print` | Server-side print (PDF) | ⚪ |
| POST | `/v2/plataforma/content/academic-main/:courseId/topics/:topicId/scorm/progress` | SCORM progress | ⚪ |

> **God's Eye note:** the two `topics/:topicId` reads are the under-enforced ones. `POST …/progress`
> is also bearer-only (no WAF), which is why `markRead` is reliable.

### 4.2 Courses & enrollments (24 entries)

| Method | Path | What it gives | Our status |
|---|---|---|---|
| GET | `/v1/plataforma/academic/courses/me` | Canonical enrollment list (with `progress`, `enrollmentId`, dates) | ✅ `fetchCourses` |
| GET | `/v1/plataforma/academic/courses/period/me` | Enrollments grouped by period | ✅ surfaces dump |
| GET | `/v1/plataforma/academic/courses/course-type/:type/me` | Courses vs communities | ✅ surfaces dump |
| GET | `/v1/plataforma/academic/courses/:courseId` | Course detail (`countParticipants`, `countStudents`, dates) | ✅ deep capture |
| GET | `/v1/plataforma/academic/me/category` | Category tree (e.g. "SISTEMAS DE INFORMAÇÃO") | ✅ deep capture |
| GET | `/v1/plataforma/academic/courses/:courseId/comments` | Course comments | 🔜 |
| GET | `/v1/plataforma/academic/courses/:courseId/roles` | Roles in the course | ⚪ |
| GET | `/v1/plataforma/academic/academics-main/enrollments` | All enrollments (history) | 🔜 |
| GET | `/v1/plataforma/academic/courses/enrollment` | Enrollment records | ⚪ |
| POST/DELETE | `/v1/plataforma/academic/courses/:courseId/favorite` | Bookmark / unbookmark course | ⚪ |

### 4.3 Grades (13 entries)

| Method | Path | What it gives | Our status |
|---|---|---|---|
| GET | `/v1/plataforma/grades/me/course/:courseId` | Classic gradebook (`structure[]`, categories) | ✅ surfaces dump |
| GET | `/v2/plataforma/grades/courses/:courseId/me` | **Grades grid v2** | 🔜 |
| GET | `/v1/plataforma/grades/course/:id/lti/class/:classId/resources[/…/grades]` and the `/v2` equivalent | LTI grade integration (AGS) | ⚪ |
| POST | `/v1/plataforma/grades/xApi/course/:courseId/topic/:topicId/event` | H5P xAPI correction event | ⚪ |

### 4.4 Calendar (20 entries)

| Method | Path | What it gives | Our status |
|---|---|---|---|
| GET | `/v1/plataforma/calendar/appointment` | Appointments/deadlines in a window | ✅ surfaces dump |
| GET | `/v1/plataforma/calendar/appointment/type` | Appointment categories + colors | ✅ surfaces dump |
| GET | `/v1/plataforma/calendar/course` | Courses for the calendar | ✅ surfaces dump |
| GET | `/v1/plataforma/calendar/appointment/topic/:topicId` | Deadline detail for a topic | 🔜 |
| GET | `/v1/plataforma/calendar/appointment/course/:courseId` | Course closing events | 🔜 |
| POST/PUT/DELETE | `/v1/plataforma/academic/calendar/appointment[/:id]` | **Create/edit/delete personal reminders** | 🔜 (first write) |

### 4.5 Notices, messages, notifications, surveys

| Method | Path | What it gives | Our status |
|---|---|---|---|
| GET | `/v1/plataforma/academic/notices-board` | Global notices | ✅ surfaces dump |
| GET | `/v1/plataforma/academic/courses/:courseId/notices-board` | Course notices | ✅ surfaces dump |
| GET | `/v1/plataforma/academic/notices/me` | Per-user notices | 🔜 |
| GET | `/v1/plataforma/academic/notices-board/me/highlight` | Highlighted notice | 🔜 |
| PUT | `/v1/plataforma/academic/notices-board/status` | Mark notices read | ⚪ |
| PUT | `/v1/plataforma/academic/courses/:courseId/notices-board/status` | Mark course notices read | ⚪ |
| GET | `/v1/plataforma/academic/messages/categories` | Message category tree | ✅ surfaces dump |
| GET | `/v1/message/messages?directory=inbox` | Inbox messages | ✅ surfaces dump |
| GET | `/v1/message/subject-categories` | Subject categories | ✅ surfaces dump |
| GET | `/v1/notification-service/notifications` | App notifications | ✅ surfaces dump |
| GET | `/v1/plataforma/academic/surveys/me` | **Active institutional survey** | 🔜 |
| POST | `/v1/plataforma/academic/surveys/me/:surveyUserId` | Answer survey | ⚪ |

### 4.6 Groups & participants

| Method | Path | What it gives | Our status |
|---|---|---|---|
| GET | `/v1/plataforma/academic/academics-main/:courseId/group-sets` | Group sets (group work) | 🔜 |
| GET | `/v1/plataforma/academic/academics-main/:courseId/group-sets/:groupSetId` | Group set detail / members | 🔜 |
| PUT | `/v1/plataforma/academic/groupset/:groupSetId/groups/:id/participants/:enrollmentId` | Self-register into a group | ⚪ |

### 4.7 Achievements & widgets

| Method | Path | What it gives | Our status |
|---|---|---|---|
| GET | `/v1/plataforma/academic/achievements` | Conquered / to-conquer badges | ✅ surfaces dump |
| GET | `/v1/plataforma/academic/achievements/:id/details` | Achievement detail | 🔜 |
| GET | `/v1/plataforma/academic/modal/me` | "Continue studying" / modal config | ✅ deep capture |
| GET | `/v1/plataforma/academic/widgets/conditionals` | Widget conditionals | ⚪ |
| POST | `/v1/plataforma/academic/widgets/continue-studying` | Continue-studying widget | ⚪ |
| GET | `/widget/pages/me`, `/widget/page-widgets/:id` | Dashboard widgets (banner, cards) | ⚪ (separate service) |

### 4.8 Settings, users, institution

| Method | Path | What it gives | Our status |
|---|---|---|---|
| GET | `/v1/plataforma/settings/institution/configuration` | Institution flags (recordings, printing, …) | ✅ deep capture |
| GET | `/v1/plataforma/settings/institution/configuration/topic-types` | 56-entry topic-type map | ✅ surfaces dump |
| GET | `/v1/plataforma/settings/institution/configuration/category-types` | Category types | ⚪ |
| GET | `/v1/plataforma/settings/institution/configuration/marketplace` | Marketplace config | ⚪ |
| GET | `/v1/plataforma/settings/accessibilities[/:id]` | Accessibility profiles | ⚪ |
| GET | `/v1/plataforma/academic/terms` | Localized labels | ✅ deep capture |
| GET | `/v1/plataforma/academic/permission` | Permission matrix | ✅ deep capture |
| GET | `/v1/plataforma/users/roles/me`, `/roles/safea` | Roles | ✅ deep capture |

### 4.9 Academic Services — a second app embedded as web components

These are SPA routes (`webRoute`) backed by the **academic-services** application, not the
plataforma API. They are the "classic student portal" domain (schedules, documents, financial) and
likely need that app's own session. Treat as exploratory.

| Web route | What it is | Our status |
|---|---|---|
| `/wc/academic-services/academic-situation` | Curricular situation (histórico) | 🔜 exploratory |
| `/wc/academic-services/enrollment-documents` | Enrollment documents | ⚪ |
| `/wc/academic-services/enrollment-student-card` | Student card | ⚪ |
| `/wc/academic-services/my-request` | My requests | ⚪ |
| `/wc/academic-services/financial-digital-wallets` | Digital wallet / financial | ⚪ |
| `/pdf-viewer` | Built-in PDF viewer | ⚪ |

### 4.10 Similarity (plagiarism) — mostly professor-side

`/v1|/v2/plataforma/content/similarity/*` (EULA, report URL) and
`/v1/plataforma/academic/integrations/similarity/providers`. Not a student feature; documented for
completeness.

---

## 5. The topic `context` object — the richest payload we parse

`GET /v2/…/topics/:topicId` returns `context` with far more than we currently store. Fields seen
live (topic 89612190):

| Field | Meaning / use |
|---|---|
| `academicMainId`, `contentId`, `academicMainExternalId`, `templateName` | Course identity |
| `topicId`, `topicTitle`, `topicTypeId`, `categoryTypeId`, `sequence` | Topic identity |
| `parentTopicId`, `parentTopicTitle`, `grandParentTopicId` | Module/section reconstruction (God's Eye) |
| `gradeBookId` | Bridge to the gradebook activity |
| `hasDeadline`, `deadlineAt`, `isBeforeDeadline`, `isFuture` | Scheduling |
| `isVisibleIsControlledByConditional`, `conditionalSetId`, `conditionals[]` | Conditional gating |
| `hasGroup`, `groupSetId`, `groupingType` | Group work |
| `rubricId`, `isRubricVisibleForStudent` | Rubrics |
| `isAccessCodeEnabled` | Locked-by-code content |
| `hasContentEvaluation`, `isContentEvaluationAllowed` | Student rates content |
| `hasReferences` | References endpoint has data |
| `isMarketplace`, `marketplaceAuthor` | Content sourced from Sagah marketplace |
| `similarityProviderAlias` | Plagiarism provider |
| `totalEnrolledStudents`, `enrollmentId`, `hasEnrollment`, `isAllowedAccess` | Access + cohort size |
| `firstAccessAt` | First time the student opened it |
| `teachers[]` (`safeaUserId`, `name`, `isVisibleToStudentSendMessage`) | Faculty + whether you can DM |
| `previousAndNextTopics` | Topic navigation graph |
| `design{}` | Theme/thumbnail/banner styling |

> `context.teachers[]` is **course-wide**; module→professor ownership is resolved separately (see
> `05-data-schemas.md`).

---

## 6. Content types (56)

Fetched from `/v1/plataforma/settings/institution/configuration/topic-types`. We classify only a
handful into `kind` (`pdf|reading|quiz|file_upload|link|forum|other`); the rest land in `other`.

| Bucket (`categoryTypeId`) | Examples (topicTypeId) |
|---|---|
| 1 containers | folder(1), page(2), learning_unit(21) |
| 2 rich content | html(3), presentation(10), infographic(12), book(13), video(22), videoaula(38), 360(24), interactive_video(41), immersive_content(44), audiobook(48), h5p(28), scorm(31), embedded_link(23), game(34), sim(45), virtual_labs(18), lab(50) |
| 4 links | link_group(7), reading_indication(42), know_more(49), link(4) |
| 5 assignments | task(8), challenge(11), case_study(39), activity(51), experiment(25) |
| 6 interaction | forum(9) |
| 8 assessments | quiz(15), exercise(37), pre_test(29), test(30), avalia_activity(27) |
| — | lti(6), web_conference_teams(20), web_conference_meet(19), payment(187), teacher_tip(14), to_think(36), resume(32), interview(40), script(26), file(5/35), 3d(17), html(52), book_alg(53) |

**Feature implication:** `other` currently hides SCORM, H5P, video, recordings, references and
simulators. Each has a read endpoint (see 4.1) that can turn it into a real, launchable card.

---

## 7. Feature opportunity map

Ties each idea to the endpoints above and to where it lands in our code.

| # | Feature | Endpoints | Read/Write | Fits in |
|---|---|---|---|---|
| 1 | **Feedback Lens** — professor corrections, rubric, essay answers, unread-feedback badge | corrections + discursive + corrections/counts | R | new page; `import.ts → project.ts`; next to `exercise.tsx` |
| 2 | **Reading Room** — references + course comments per subject | references, courses/:id/comments | R | new page |
| 3 | **Recorded Classes** — list + play recordings | webconference records + record url | R | new page / `exercise.tsx` embed |
| 4 | **Survey inbox** — active survey + badge | surveys/me | R (+W to answer) | `agora.tsx` badge |
| 5 | **Inbox** — notices/messages with unread + mark-read | notices/me, highlight, status | R (+W mark-read) | new page |
| 6 | **Unified agenda** — deadlines + appointments | calendar/*, appointment/topic | R | merge into `agora.tsx` |
| 7 | **Study reminders** — create personal calendar entries | POST/PUT/DELETE appointment | **W** | `agora.tsx` / settings |
| 8 | **Grades Lab** — weighted grades, pending, "need on final" | grades v1 + v2 grid | R | `progresso.tsx` |
| 9 | **Group work** — group set + teammates + self-register | group-sets, groupset participants | R (+W enroll) | new page |
| 10 | **SCORM/H5P support** — launch + progress instead of `other` | scorm launch/progress, h5p uuid | R (+W progress) | `content.ts::classify` + `exercise.tsx` |
| 11 | **Academic history** — past enrollments, favorites | academics-main/enrollments, favorite | R (+W favorite) | `progresso.tsx` |
| 12 | **LTI launcher** — library, AvaliA, saúde | lti/tool/list, lti/launch | R | new page / `agora.tsx` |
| 13 | **Content Radar** — generalize God's Eye to whole courses | contents + topics by arbitrary id | R | `harvestHiddenTopics` pattern |
| 14 | **Academic Services panel** — curricular situation, documents | `/wc/academic-services/*` | R | exploratory; other app session |

---

## 8. Risks, ethics & the write side

- **Academic integrity.** Writes submit real work. Keep them behind the existing explicit send
  flow; never auto-submit.
- **ToS / scope.** Content Radar and Academic Services read beyond the current enrollment/app.
  Confirm institutional policy; keep read-only and opt-in.
- **WAF.** Writes may require a solved `aws-waf-token`; drive them through Playwright
  (`submit-task.ts`), not native fetch.
- **Single-use token.** Fresh login per run; SPA navigation only.
- **Role gating.** Some correction/LTI routes may 403 for students. Confirm with a probe before
  building.

---

## 9. Capability probe plan (read-only)

Before designing a feature, confirm which candidates actually work for a student:

1. Fresh login via `createSession()`.
2. Call each candidate read endpoint once with the bearer token (cookie-aware for WAF), for a known
   `courseId`/`topicId`/`enrollmentId`.
3. Record `status` + a trimmed body shape (never store personal payloads).
4. Write results into `endpoint-catalog.json` (`status: verified|forbidden|not-found`) and update
   the tables above.

Candidate set: corrections, discursive, references, scorm launch, h5p uuid, webconference records,
surveys/me, notices/me, group-sets, academics-main/enrollments, grades grid v2.

---

## 10. Using this as AI context

When asking an agent to build a feature:

1. Point it at this file + `endpoint-catalog.json`.
2. Name the target feature from §7 (it maps idea → endpoints → files).
3. Require it to state, per endpoint: method, path, read/write, and whether §9 verified it.
4. Remind it of the gotchas: single-use token, WAF on writes, `origin:"hidden"` stays out of normal
   lists, Postgres is the source of truth.

---

## Appendix A — full unique endpoint index

Machine-generated from `endpoint-catalog.json` — one row per unique API method+path (131 total).

### academic (7)

| Method | Path | Description | Access |
|---|---|---|---|
| PUT | `/v1/plataforma/academic/integrations/similarity/providers` | Similarity - Update ingrations | W |
| POST | `/v1/plataforma/academic/ltiIntegration` | api-academic-ltiintegration-post | W |
| GET | `/v1/plataforma/academic/modal/me` | Api de listagem de exibição de modais (Avisos, Pesquisas) | R |
| GET | `/v1/plataforma/academic/permission` | Get permissions by role course | R |
| GET | `/v1/plataforma/academic/terms` | Listar termos | R |
| GET | `/v1/plataforma/academic/widgets/conditionals` | Listar condicionais widget | R |
| POST | `/v1/plataforma/academic/widgets/continue-studying` | Obter widget de "Continue Estudando" | W |

### achievements (2)

| Method | Path | Description | Access |
|---|---|---|---|
| GET | `/v1/plataforma/academic/achievements/:id/details` | API para detalhar conquista para aluno | R |
| GET | `/v1/plataforma/academic/achievements` | API para listar conquistas por papel | R |

### calendar (14)

| Method | Path | Description | Access |
|---|---|---|---|
| DELETE | `/v1/plataforma/academic/calendar/appointment/:id` | api-academic-v1-calendar-appointment-delete | W |
| GET | `/v1/plataforma/academic/calendar/appointment/:id` | api-academic-v1-calendar-appointment-get-by-id | R |
| PUT | `/v1/plataforma/academic/calendar/appointment/:id` | api-academic-v1-calendar-appointment-put | W |
| GET | `/v1/plataforma/academic/calendar/appointment` | api-academic-v1-calendar-appointment-get | R |
| POST | `/v1/plataforma/academic/calendar/appointment` | api-academic-v1-calendar-appointment-post | W |
| GET | `/v1/plataforma/academic/calendar/category` | api-academic-v1-calendar-category-get | R |
| DELETE | `/v1/plataforma/calendar/appointment/:appointmentId` | Api de exclusão dos compromissos do calendário | W |
| PUT | `/v1/plataforma/calendar/appointment/:appointmentId` | Api de edição dos compromissos do calendário | W |
| GET | `/v1/plataforma/calendar/appointment/course/:courseId` | Api de listagem dos detalhes de um evento de encerramento | R |
| GET | `/v1/plataforma/calendar/appointment/topic/:topicId` | Api de listagem dos detalhes de um compromisso | R |
| GET | `/v1/plataforma/calendar/appointment/type` | Listar Categorias de Eventos do Calendário | R |
| GET | `/v1/plataforma/calendar/appointment` | Api de listagem dos compromissos | R |
| POST | `/v1/plataforma/calendar/appointment` | Api de criação dos compromissos do calendário | W |
| GET | `/v1/plataforma/calendar/course` | Api de listagem das disciplinas do calendário | R |

### content (59)

| Method | Path | Description | Access |
|---|---|---|---|
| GET | `/v1/plataforma/content/enrollment/:enrollmentId/discursive/:topicId` | API de recuperação do conteúdo de uma atividade discursiva por matricula | R |
| POST | `/v1/plataforma/content/enrollment/:enrollmentId/discursive/:topicId` | API de responder uma atividade discursiva por matricula | W |
| GET | `/v1/plataforma/content/enrollment/:enrollmentId/page/:parentTopicId` | API de recuperação do conteúdo de um pagina por matricula | R |
| POST | `/v1/plataforma/content/enrollment/:enrollmentId/quiz/:topicId/attempt/:attemptId` | API de finalizar uma tentativa do questionário por matricula | W |
| GET | `/v1/plataforma/content/enrollment/:enrollmentId/quiz/:topicId` | API de recuperação de um questionário por matricula | R |
| POST | `/v1/plataforma/content/enrollment/:enrollmentId/quiz/:topicId` | API de responder um questionário por matricula | W |
| GET | `/v1/plataforma/content/enrollment/:enrollmentId/topic/:topicId/post` | API de recuperação das mensagens de um fórum por matricula | R |
| GET | `/v1/plataforma/content/enrollment/:enrollmentId/topic/:topicId` | API de recuperação do conteúdo do tópico da disciplina pela matricula | R |
| GET | `/v1/plataforma/content/enrollment/:enrollmentId` | API de recuperação do conteúdo da disciplina pela matricula | R |
| PUT | `/v1/plataforma/content/integrations/similarity/:externalSubmissionId/status` | Similarity - Update submission status | W |
| GET | `/v1/plataforma/content/link/check/` | API de verificação de funcionamento de um link qualquer | R |
| GET | `/v1/plataforma/content/lti/launch` | API de recuperação de dados para execução de um LTI | R |
| GET | `/v1/plataforma/content/lti/tool/list-by-alias/:roleAlias` | API de listagem de ferramentas LTI pelo alias | R |
| POST | `/v1/plataforma/content/main-content/:academicMainId/topic/:topicId/print` | Acionar lambda de impressão | W |
| GET | `/v1/plataforma/content/main-content/:contentId/corrections/:topicId/enrollment/:enrollmentId` | API de recuperação das respostas por contexto para correção de conteúdo | R |
| GET | `/v1/plataforma/content/main-content/:contentId/topic/:topicId/post` | API de recuperação de todos os comentários de um fórum | R |
| DELETE | `/v1/plataforma/content/topic/:topicId/enrollment/:enrollmentId/like` | API de remover o curtir  de um tópico do conteúdo | W |
| POST | `/v1/plataforma/content/topic/:topicId/enrollment/:enrollmentId/like` | API de curtir um tópico do conteúdo | W |
| POST | `/v1/plataforma/content/topic/:topicId/enrollment/:enrollmentId/post` | API de criação de um comentário em um fórum | W |
| DELETE | `/v1/plataforma/content/topic/:topicId/enrollment/:enrollmentId/progress` | API de desmarcar progresso de um tópico | W |
| DELETE | `/v1/plataforma/content/topic/:topicId/post/:postId/enrollment/:enrollmentId/like` | API de remover o curtir de um comentário no fórum | W |
| POST | `/v1/plataforma/content/topic/:topicId/post/:postId/enrollment/:enrollmentId/like` | API de curtir um comentário do fórum | W |
| PATCH | `/v1/plataforma/content/topic/:topicId/post/:postId/enrollment/:enrollmentId` | API de edição de um comentário de um fórum | W |
| GET | `/v1/plataforma/content/upload` | API de recuperação das informações da S3 para upload | R |
| GET | `/v1/plataforma/content/webconference/collab/:contextId/records` | Obter gravações do blackboard collab na web conferência | R |
| GET | `/v1/plataforma/content/webconference/collab/:sessionId/url` | Listar e Criar  URL do blackboard collab na web conferência | R |
| GET | `/v1/plataforma/content/webconference/collab/record/:recordId/url` | Obter URL da gravação do blackboard collab na web conferência | R |
| GET | `/v2/plataforma/content/academic-main/:academicMainId/topics/:topicId/scorm/:scormId/launch-link` | Scorm Get Launch Link | R |
| POST | `/v2/plataforma/content/academic-main/:academicMainId/topics/:topicId/scorm/progress` | Scorm - Progresso | W |
| GET | `/v2/plataforma/content/academics-main/:academicMainId/contents/:topicType/:topicId` | API para registrar o trackeamento de conteúdos | R |
| GET | `/v2/plataforma/content/academics-main/:academicMainId/contents/sync/preview` | Preview de sincronização da disciplina | R |
| GET | `/v2/plataforma/content/academics-main/:academicMainId/contents` | API de listagem do conteúdo de uma academic main | R |
| POST | `/v2/plataforma/content/academics-main/:academicMainId/topics/:topicId/access-code` | Validar código de acesso de um tópico | W |
| POST | `/v2/plataforma/content/academics-main/:academicMainId/topics/:topicId/avalia-activities/sso` | Executar SSO | W |
| POST | `/v2/plataforma/content/academics-main/:academicMainId/topics/:topicId/avalia-activities` | API para envio após finalização de uma avaliação do Avalia | W |
| GET | `/v2/plataforma/content/academics-main/:academicMainId/topics/:topicId/corrections/counts` | Listar counts de correção | R |
| POST | `/v2/plataforma/content/academics-main/:academicMainId/topics/:topicId/evaluate-contents` | api-content-v2-academic-main-topic-post-content-evaluation | W |
| GET | `/v2/plataforma/content/academics-main/:academicMainId/topics/:topicId/h5p/uuid` | Listar UUID do estado de um objeto H5P | R |
| DELETE | `/v2/plataforma/content/academics-main/:academicMainId/topics/:topicId/likes` | Descurtir tópico. | W |
| POST | `/v2/plataforma/content/academics-main/:academicMainId/topics/:topicId/likes` | Curtir tópico. | W |
| GET | `/v2/plataforma/content/academics-main/:academicMainId/topics/:topicId/posts/:parentPostId` | Listar comentários pelo pai | R |
| DELETE | `/v2/plataforma/content/academics-main/:academicMainId/topics/:topicId/posts/:postId/likes` | Excluir curtir do comentário em um fórum | W |
| POST | `/v2/plataforma/content/academics-main/:academicMainId/topics/:topicId/posts/:postId/likes` | Curtir comentário em um fórum. | W |
| PATCH | `/v2/plataforma/content/academics-main/:academicMainId/topics/:topicId/posts/:postId` | Editar comentário de um fórum | W |
| POST | `/v2/plataforma/content/academics-main/:academicMainId/topics/:topicId/posts` | Criar comentário em um fórum | W |
| DELETE | `/v2/plataforma/content/academics-main/:academicMainId/topics/:topicId/progress` | Api de exclusão de progresso no tópico. | W |
| POST | `/v2/plataforma/content/academics-main/:academicMainId/topics/:topicId/progress` | Api de marcação de progresso no tópico. | W |
| POST | `/v2/plataforma/content/academics-main/:academicMainId/topics/:topicId/quizzes/attempts` | API para envio de tentativa de um questionário | W |
| POST | `/v2/plataforma/content/academics-main/:academicMainId/topics/:topicId/quizzes` | API para envio de resposta de uma questão de um questionário | W |
| GET | `/v2/plataforma/content/academics-main/:academicMainId/topics/:topicId/references` | api-content-v2-academic-main-references | R |
| POST | `/v2/plataforma/content/academics-main/:academicMainId/topics/:topicId/tasks` | API para envio de respostas de uma tarefa | W |
| GET | `/v2/plataforma/content/academics-main/:academicMainId/topics/:topicId/webconference/records/:recordId/url` | api-content-v2-academic-main-webconference-record-url | R |
| GET | `/v2/plataforma/content/academics-main/:academicMainId/topics/:topicId/webconference/records` | api-content-v2-academic-main-webconference-records | R |
| GET | `/v2/plataforma/content/academics-main/:academicMainId/topics/:topicId/webconference/url` | api-content-v2-academic-main-webconference-url | R |
| GET | `/v2/plataforma/content/academics-main/:academicMainId/topics/:topicId` | API de listagem do conteúdo de um tópico | R |
| POST | `/v2/plataforma/content/academics-main/lti/client` | API de criação de contexto para LTI | W |
| POST | `/v2/plataforma/content/similarity/eula/:providerAlias/accept` | Similarity - Accept Eula | W |
| GET | `/v2/plataforma/content/similarity/eula/:providerAlias` | Similarity - Get Eula | R |
| GET | `/v2/plataforma/content/similarity/report/:providerAlias/:enrollmentTaskId` | Similarity - Get Url Report | R |

### courses (14)

| Method | Path | Description | Access |
|---|---|---|---|
| GET | `/v1/plataforma/academic/courses/:courseId/comments` | API Listagem de Comentários | R |
| DELETE | `/v1/plataforma/academic/courses/:courseId/favorite` | delete favorite | W |
| POST | `/v1/plataforma/academic/courses/:courseId/favorite` | favorite course | W |
| GET | `/v1/plataforma/academic/courses/:courseId/roles` | api-academic-v1-courses-id-get-roles | R |
| GET | `/v1/plataforma/academic/courses/:courseId` | Buscar disciplina por id | R |
| GET | `/v1/plataforma/academic/courses/course-type/:academicMainType/me` | Lista tipo de disciplina | R |
| GET | `/v1/plataforma/academic/courses/enrollment/category` | api-academic-v1-courses-enrollment-category-get | R |
| GET | `/v1/plataforma/academic/courses/enrollment` | api-academic-v1-courses-enrollment-get | R |
| POST | `/v1/plataforma/academic/courses/import-list` | Listagem de disciplinas com exceção das informadas | W |
| GET | `/v1/plataforma/academic/courses/me/course-types` | GET tipo de disciplina | R |
| GET | `/v1/plataforma/academic/courses/me` | Listar disciplinas do usuário | R |
| GET | `/v1/plataforma/academic/courses/period/me` | api-academic-v1-courses-period-me-get | R |
| GET | `/v1/plataforma/academic/courses/role` | api-academic-v1-courses-role-get | R |
| GET | `/v1/plataforma/academic/me/category` | Listar categorias (me) | R |

### grades (12)

| Method | Path | Description | Access |
|---|---|---|---|
| GET | `/v1/plataforma/grades/course/:courseId/lti/class/:classId/resources/:resourceId/grades` | LTI - Integração de Notas - Get Resources Grades | R |
| PATCH | `/v1/plataforma/grades/course/:courseId/lti/class/:classId/resources/:resourceId/grades` | LTI - Integração de Notas - Post Student Grade | W |
| GET | `/v1/plataforma/grades/course/:courseId/lti/class/:classId/resources/:resourceId/students/:studentId/grades/:gradeId` | LTI - Integração de Notas - Get Student Grade | R |
| GET | `/v1/plataforma/grades/course/:courseId/lti/class/:classId/resources` | LTI - Integração de Notas - Get Resources | R |
| GET | `/v1/plataforma/grades/me/course/:courseId` | Listar grades visão do aluno | R |
| POST | `/v1/plataforma/grades/xApi/course/:courseId/topic/:topicId/event` | Api de criação de uma correção H5P | W |
| GET | `/v2/plataforma/grades/course/:courseId/lti/class/:classId/resources/:resourceId/grades` | Notas dos alunos no recurso LTI - Academic Lite | R |
| PATCH | `/v2/plataforma/grades/course/:courseId/lti/class/:classId/resources/:resourceId/grades` | integração de Notas LTI | W |
| GET | `/v2/plataforma/grades/course/:courseId/lti/class/:classId/resources/:resourceId/students/:studentId/grades/:gradeId` | Detalhe da nota do aluno - LTI Academic Lite | R |
| GET | `/v2/plataforma/grades/course/:courseId/lti/class/:classId/resources` | Lista de recursos da turma LTI - Academic Lite | R |
| GET | `/v2/plataforma/grades/courses/:courseId/me` | Api de listagem da grade de notas do aluno | R |
| GET | `/v2/plataforma/grades/lti/context/:contextId/resource/:resourceId/lineitems/:itemId/results` | Consulta de resultado AGS do aluno por line item (LTI 1.3) | R |

### groups (5)

| Method | Path | Description | Access |
|---|---|---|---|
| GET | `/v1/plataforma/academic/academics-main/:courseId/group-sets/:groupSetId` | Listar conjunto de grupos do curso pelo ID. | R |
| GET | `/v1/plataforma/academic/academics-main/:courseId/group-sets` | Listar conjuntos de grupo do curso. | R |
| DELETE | `/v1/plataforma/academic/academics-main/:courseId/student-view` | Deleta usuário preview pelo token | W |
| GET | `/v1/plataforma/academic/academics-main/enrollments` | api-academic-v1-academic-main-all-get-enrollments | R |
| PUT | `/v1/plataforma/academic/groupset/:groupSetId/groups/:id/participants/:enrollmentId` | api-academic-v1-group-set-groups-participants-enroll-put | W |

### messages (1)

| Method | Path | Description | Access |
|---|---|---|---|
| GET | `/v1/plataforma/academic/messages/categories` | api-academic-v1-get-categories | R |

### notices (7)

| Method | Path | Description | Access |
|---|---|---|---|
| PUT | `/v1/plataforma/academic/courses/:courseId/notices-board/status` | Marcar avisos como lidos | W |
| GET | `/v1/plataforma/academic/courses/:courseId/notices-board` | Listar avisos da disciplina | R |
| GET | `/v1/plataforma/academic/notices-board/me/highlight` | Último aviso destaque | R |
| PUT | `/v1/plataforma/academic/notices-board/status` | Marcar avisos gerais como lidos | W |
| GET | `/v1/plataforma/academic/notices-board` | Listar avisos da gerais | R |
| PATCH | `/v1/plataforma/academic/notices/:id/action` | api-academic-user-notice-action | W |
| GET | `/v1/plataforma/academic/notices/me` | api-academic-get-user-notice | R |

### settings (6)

| Method | Path | Description | Access |
|---|---|---|---|
| GET | `/v1/plataforma/settings/accessibilities/:id` | Endpoint para retornar acessibilidade por id | R |
| GET | `/v1/plataforma/settings/accessibilities` | Endpoint para retornar acessibilidades | R |
| GET | `/v1/plataforma/settings/institution/configuration/category-types` | Listar tipos de conteúdo com base no contrato da instituição | R |
| GET | `/v1/plataforma/settings/institution/configuration/marketplace` | api-settings-institution-configuration-marketplace-get | R |
| GET | `/v1/plataforma/settings/institution/configuration/topic-types` | Listar tipos de tópicos disponíveis | R |
| GET | `/v1/plataforma/settings/institution/configuration` | API de recuperação da configuração de uma IES. | R |

### surveys (2)

| Method | Path | Description | Access |
|---|---|---|---|
| POST | `/v1/plataforma/academic/surveys/me/:surveyUserId` | Api de ação do usuário na pesquisa | W |
| GET | `/v1/plataforma/academic/surveys/me` | Exibição da pesquisa ativa ao usuário | R |

### users (2)

| Method | Path | Description | Access |
|---|---|---|---|
| GET | `/v1/plataforma/users/roles/me` | Listar papéis do usuário | R |
| GET | `/v1/plataforma/users/roles/safea` | Listar papéis safea | R |
