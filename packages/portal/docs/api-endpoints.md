# API endpoints — Grupoa LXP

Base URL: `https://api.plataforma.grupoa.education`

All requests (except the public settings endpoints) carry:

```
authorization: <plataforma_accessToken>      # exchanged token (see docs/auth.md)
accept: application/json
x-user-timezone: America/Sao_Paulo
x-notice-show-modal: false
```

> Endpoints marked ✅ were hit against the live API during the scrape (full response bodies
> captured in `scraped/raw/surfaces.json` and `scraped/raw/deep-api.json`).

## Identity / auth (safea-client)

| Verb | Path | Notes |
|---|---|---|
| GET | `/v2/safea-client/settings/applications/plataforma/hostname/{host}` | ✅ public — app config, theme, tenant |
| GET | `/v2/safea-client/users/me` | ✅ current user + tenant |

## Roles / institution / settings

| Verb | Path | Notes |
|---|---|---|
| GET | `/v1/plataforma/users/roles/me` | ✅ `{ safeaRole:"student", isStudent:true, ltiRole:"urn:lti:role:ims/lis/Learner", ... }` |
| GET | `/v1/plataforma/settings/institution/configuration` | ✅ institution settings |
| GET | `/v1/plataforma/settings/institution/configuration/topic-types` | ✅ 56-entry topic-type map (docs/topic-types.md) |
| GET | `/v1/plataforma/academic/terms` | ✅ localized labels |
| GET | `/v1/plataforma/academic/permission` | ✅ permission matrix |
| GET | `/v2/integrate-module/support-settings?isActive=true` | ✅ support widget |

## Courses / enrollments

| Verb | Path | Notes |
|---|---|---|
| GET | `/v1/plataforma/academic/courses/me?state=all&page=1&limit=50&sort=asc&sortBy=name&type=courses` | ✅ `{ courses:[{id,name,…}] }` — canonical enrollment list |
| GET | `/v1/plataforma/academic/courses/me?…&type=communities` | ✅ communities list |
| GET | `/v1/plataforma/academic/courses/course-type/{1|2}/me` | ✅ courses by type (1=course, 2=community) |
| GET | `/v1/plataforma/academic/courses/period/me?academicMainTypeName={course|community}&state=all` | ✅ courses grouped by period |
| GET | `/v1/plataforma/academic/me/category?flat=false&appendDisciplines=false` | ✅ category tree (e.g. "SISTEMAS DE INFORMAÇÃO") |
| GET | `/v1/plataforma/academic/courses/{courseId}` | ✅ course detail |
| GET | `/v1/plataforma/academic/courses/{courseId}/notices-board?isHighlight=true&perPage=…&page=1&orderBy=sequence:asc` | ✅ course-level notices |
| GET | `/v1/plataforma/academic/modal/me?origin={home|course}` | ✅ continue-studying modal |

## Content tree

| Verb | Path | Notes |
|---|---|---|
| GET | `/v2/plataforma/content/academics-main/{courseId}/contents` | ✅ full module→section→item tree |
| GET | `/v2/plataforma/content/academics-main/{courseId}/topics/{sectionId}` | ✅ section detail — `topics[]` children with `content.html` |
| GET | `/v2/plataforma/content/academics-main/{courseId}/topics/{topicId}` | ✅ **item/topic detail** — `topics.content` + `context` (richest source) |
| GET | `/v1/plataforma/content/lti/tool/list-by-alias/student` | ✅ LTI tools (`results[{id,title,url,icon,ltiProviderId}]`) |

### Item/topic detail `content` shapes (see `scraped/raw/example-*.json`)

**Quiz** (`topicTypeId` 15/29/30/37) — `content.questions[]`:
```json
{ "quizTypeId":1, "hasRetries":false, "numberRetries":1, "hasCompletedAllAttempts":false,
  "questions":[ { "id":36049942, "questionTypeId":1, "enunciated":"<div>…</div>",
    "feedbackTypeId":2, "hasFileUpload":false, "grade":0,
    "options":[ {"id":175978391,"text":"<div>…</div>"} ] } ] }
```

**File upload / task** (`topicTypeId` 8) — `content`:
```json
{ "html":"<div>…<grupoaattachment file=\"…\" filename=\"…\" filesize=\"…\"/></div>",
  "isExpectedAnswerVisible":false, "hasFileUpload":true, "hasRetries":false,
  "numberRetries":1, "retryTypeId":1, "attempts":[], "hasCompletedAllAttempts":false,
  "maxFilesLimit":1, "isUnlimitedFilesEnabled":false }
```

**Links** (`topicTypeId` 7) — `content.items[]`:
```json
{ "items":[ {"id":69607828,"title":"VÍDEO 002","html":"…","type":"video",
  "url":"https://www.youtube.com/watch?v=…","icon":"mdi-play-circle-outline"} ] }
```

**Reading / PDF** (`topicTypeId` 3) — `content.html` with `<grupoabook file="…/…pdf" …/>` PDF tags.

## Grades

| Verb | Path | Notes |
|---|---|---|
| GET | `/v1/plataforma/grades/me/course/{courseId}` | ✅ full gradebook — `{ finalGrade, structure:[{ name, sequence, value, children:[{ name, maxValue, value, isSubmited, submitedAt, deadlineAt, topicTypeId, isRevised }] }] }` |

## Notices

| Verb | Path | Notes |
|---|---|---|
| GET | `/v1/plataforma/academic/notices-board?perPage=…&page=1&orderBy=postedAt:desc` | ✅ global notices |

## Messages

| Verb | Path | Notes |
|---|---|---|
| GET | `/v1/plataforma/academic/messages/categories?withoutCategory=true&isToGetOnlyActual=true` | ✅ message category tree |
| GET | `/v1/message/subject-categories` | ✅ message subject categories |
| GET | `/v1/message/messages?directory=inbox&perPage=…` | ✅ inbox messages |
| GET | `/v1/message/institutions/role-configuration` | ✅ messaging role config |

## Achievements

| Verb | Path | Notes |
|---|---|---|
| GET | `/v1/plataforma/academic/achievements?status=all&page=1&perPage=20&search=&achievementTypeId={1|2}` | ✅ `{ totalRows, conquered[], toConquer[] }` |

## Calendar

| Verb | Path | Notes |
|---|---|---|
| GET | `/v1/plataforma/calendar/appointment/type` | ✅ appointment categories (id/name/color) |
| GET | `/v1/plataforma/calendar/appointment?appointmentCategory=1,2,3,7,5,6&startDate=…&endDate=…` | ✅ appointments (deadlines) in a window |
| GET | `/v1/plataforma/calendar/course?page=1&limit=15` | ✅ courses for the calendar |

## Notifications / widgets

| Verb | Path | Notes |
|---|---|---|
| GET | `/v1/notification-service/notifications?deliveryMode=application&page=1&perPage=5&displayMode=toast&isRead=false` | ✅ toast |
| GET | `/v1/notification-service/notifications?deliveryMode=application&page=1&perPage=10` | ✅ list |
| GET | `/widget/pages/me` | ✅ dashboard widget layout |
| GET | `/widget/page-widgets/{sectionWidgetId}` | ✅ widget content |

## Progress (write side — partially known)

| Verb | Path | Notes |
|---|---|---|
| POST | `/v2/plataforma/content/academics-main/{courseId}/topics/{topicId}/progress` | ✅ "Mark as completed": empty body → `204`; bearer only, no WAF (`src/actions.ts::markRead`) |
| POST | `/v1/plataforma/content/enrollment/{enrollmentId}/quiz/{topicId}` | ✅ answer one quiz question: body `{ questionId, optionId }` (SPA action `plataforma/enrollment/actionAnswerQuizQuestion`) |
| POST | `/v1/plataforma/content/enrollment/{enrollmentId}/quiz/{topicId}/attempt/{attemptId}` | ✅ finish a quiz attempt: empty body (SPA action `plataforma/enrollment/actionFinishQuizAttempt`); pesquisas skip it |

## Static assets

| Host | Notes |
|---|---|
| `https://static.plataforma.grupoa.education/{tenant}/{app}/{uuid}.{pdf\|docx\|pptx\|zip\|…}` | content/attachment files — public, no auth |
| `https://bucket.safea.grupoa.education/{...}` | tenant logos / banners |
| `https://libs.grupoa.education/pdfreader/web/viewer.html?file=…` | PDF viewer |

## Still unknown (write side — see docs/gaps.md)

- File-upload submit endpoint (multipart POST)
- Forum post/reply endpoints

Quiz submit is solved: see the `enrollment/{id}/quiz/...` rows above.
