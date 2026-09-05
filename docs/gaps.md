# Gap analysis — write side & unknowns

**Status update:** the entire **read** surface is now scraped — content tree (145 items incl. quiz
questions, file-upload instructions, links), grades, notices, messages, achievements, calendar,
communities, and LTI tools. Only the **write** side (mutating the academic record) remains unknown.

## 1. Quiz submit (HIGH priority for the exercise agent)

**Status:** ❌ unknown

**Known:**
- Quiz content fully readable via `GET /v2/plataforma/content/academics-main/{courseId}/topics/{topicId}`
  → `topics.content.questions[]` (each with `id`, `enunciated`, `options[]`).
- Quiz `topicTypeId`s: 37 ("Exercícios"), 15 ("Questionário"), 29/30 (pre/post-test).
- `content.hasRetries`, `numberRetries`, `hasCompletedAllAttempts` gate retries.

**Missing:** the submit/answer endpoint(s). Candidates to probe (live interaction + network recorder):
`POST .../topics/{topicId}/answer`, `.../questions/{questionId}/answer`, `.../topics/{topicId}/finish`,
`.../attempt`.

## 2. File upload submit (HIGH priority)

**Status:** ❌ unknown

**Known:** task items (`topicTypeId` 8), `content.hasFileUpload: true`, `content.maxFilesLimit`,
`content.attempts[]`.

**Missing:** the multipart upload endpoint (`POST .../topics/{topicId}/upload` or `/attempts`).
AWS WAF (`aws-waf-token` cookie) may be required for writes.

## 3. Reading progress (MEDIUM — mostly solved)

`POST /v2/plataforma/content/academics-main/{courseId}/topics/{topicId}/progress` marks items read
(`src/actions.ts::markRead`). Request body not yet captured — verify live.

## 4. Forum post/reply (LOW)

Forum read content is captured; post/reply endpoints unknown (only 3 forum items in this course).

## 5. Token/WAF risk for writes

GET reads work without the AWS WAF token, but `aws-waf-token` cookie + `awswaf_session_storage` are
present. Writes (POST/PUT) may require the WAF challenge solved in-browser. Recommend driving all
writes through Playwright (in-page) rather than native `fetch`.

## How to close gaps 1 & 2

```bash
npm run capture-api -- --url https://unifoa2.grupoa.education/plataforma/course/5254272/content/89612190 --headful
# → answer one quiz question and upload one file, then press Enter to dump the captured API calls
```

> ⚠ These actions submit real work to the student's academic record. Run only with explicit intent.
