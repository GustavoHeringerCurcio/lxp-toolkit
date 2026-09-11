# API endpoints — `https://api.plataforma.grupoa.education`

All requests carry the headers from `02-auth.md`. Query params shown are real examples; `page`,
`perPage`/`limit` are interchangeable pagination params the SPA uses inconsistently.

## Identity / settings (safea-client)

| Verb | Path | Notes |
|---|---|---|
| GET | `/v2/safea-client/settings/applications/plataforma/hostname/{host}` | public app/tenant config |
| GET | `/v2/safea-client/users/me` | identity + tenant |
| GET | `/v1/plataforma/users/roles/me` | `{ safeaRole:"student", isStudent:true, ... }` |
| GET | `/v1/plataforma/settings/institution/configuration` | institution flags |
| GET | `/v1/plataforma/settings/institution/configuration/topic-types` | full topic-type map (see 04) |
| GET | `/v1/plataforma/academic/terms` | localized labels |
| GET | `/v1/plataforma/academic/permission` | permission matrix |
| GET | `/v2/integrate-module/support-settings?isActive=true` | support widget config |

## Courses / enrollments

| Verb | Path | Notes |
|---|---|---|
| GET | `/v1/plataforma/academic/courses/me?state=all&page=1&limit=50&sort=asc&sortBy=name&type=courses` | canonical enrollment list → `{ courses:[{id,name,…}] }` |
| GET | `…/courses/me?…&type=communities` | communities |
| GET | `/v1/plataforma/academic/courses/course-type/{1|2}/me` | 1=course, 2=community |
| GET | `/v1/plataforma/academic/courses/period/me?academicMainTypeName={course\|community}&state=all` | grouped by period |
| GET | `/v1/plataforma/academic/me/category?flat=false&appendDisciplines=false` | category tree |
| GET | `/v1/plataforma/academic/courses/{courseId}` | course detail |
| GET | `/v1/plataforma/academic/courses/{courseId}/notices-board?isHighlight=true&perPage=…&page=1&orderBy=sequence:asc` | course-level notices |
| GET | `/v1/plataforma/academic/modal/me?origin={home\|course}` | "continue studying" modal |

## Content (the core)

| Verb | Path | Notes |
|---|---|---|
| GET | `/v2/plataforma/content/academics-main/{courseId}/contents` | full module→section→item tree |
| GET | `/v2/plataforma/content/academics-main/{courseId}/topics/{sectionId}` | section detail (children html) |
| GET | `/v2/plataforma/content/academics-main/{courseId}/topics/{topicId}` | **item/topic detail** — richest source (`topics.content` + `context`) |
| GET | `/v1/plataforma/content/lti/tool/list-by-alias/student` | LTI tool list |
| POST | `/v2/plataforma/content/academics-main/{courseId}/topics/{topicId}/progress` | "Mark as completed" (write). Empty body → `204`; bearer only, no WAF. See `04-topic-types.md` + `src/content.ts::isMarkable` |

## Grades

| Verb | Path | Notes |
|---|---|---|
| GET | `/v1/plataforma/grades/me/course/{courseId}` | full gradebook → `{ finalGrade, structure:[{ name, children:[…] }] }` |

## Notices / messages / achievements / calendar

| Verb | Path | Notes |
|---|---|---|
| GET | `/v1/plataforma/academic/notices-board?perPage=50&page=1&orderBy=postedAt:desc` | global notices |
| GET | `/v1/plataforma/academic/messages/categories?withoutCategory=true&isToGetOnlyActual=true` | message category tree |
| GET | `/v1/message/subject-categories` | subject categories |
| GET | `/v1/message/messages?directory=inbox&perPage=50` | messages |
| GET | `/v1/message/institutions/role-configuration` | messaging config |
| GET | `/v1/plataforma/academic/achievements?status=all&page=1&perPage=20&search=&achievementTypeId={1\|2}` | `{ totalRows, conquered[], toConquer[] }` |
| GET | `/v1/plataforma/calendar/appointment/type` | appointment categories (id/name/color) |
| GET | `/v1/plataforma/calendar/appointment?appointmentCategory=1,2,3,7,5,6&startDate=…&endDate=…` | appointments/deadlines in a window |
| GET | `/v1/plataforma/calendar/course?page=1&limit=15` | courses for the calendar |

## Notifications / dashboard widgets

| Verb | Path | Notes |
|---|---|---|
| GET | `/v1/notification-service/notifications?deliveryMode=application&page=1&perPage=5&displayMode=toast&isRead=false` | toast |
| GET | `/v1/notification-service/notifications?deliveryMode=application&page=1&perPage=10` | list |
| GET | `/widget/pages/me` | dashboard layout |
| GET | `/widget/page-widgets/{sectionWidgetId}` | widget content |

## Static assets (public, no auth)

- `https://static.plataforma.grupoa.education/{tenant}/{app}/{uuid}.{pdf|docx|pptx|zip|…}`
- `https://bucket.safea.grupoa.education/...` (logos/banners)
- `https://libs.grupoa.education/pdfreader/web/viewer.html?file=…` (PDF viewer)

## Known unknowns (write side, deliberately not automated)

Quiz submit, file-upload submit, forum post/reply endpoints. See `docs/gaps.md`.
