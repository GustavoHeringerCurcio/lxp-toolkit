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

## 3. "Mark as completed" progress (SOLVED)

`POST /v2/plataforma/content/academics-main/{courseId}/topics/{topicId}/progress` is the endpoint
behind the portal's **"Mark as completed"** button (`src/actions.ts::markRead`). Confirmed live
(2026-09-11, headful capture of a manual click):

- **Request body: empty** (no `content-type`, no payload).
- **Response: `204 No Content`**.
- Works with the bearer token alone — **no AWS WAF challenge** needed for this write.
- The same button/endpoint applies to every content kind that records progress: readings (`3`),
  PDFs (`3`), links (`7`) and the rich "other" types (apresentação `10`, infográfico `12`, livro
  `13`, na prática `16`, dica `22`, saiba mais `49`, desafio `11`). Quiz/file-upload/forum do
  **not** use it — they complete via real submissions.

`src/content.ts::isMarkable` enumerates these; `npm run agent -- --read` (alias `--complete`)
marks them all in one pass.

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
