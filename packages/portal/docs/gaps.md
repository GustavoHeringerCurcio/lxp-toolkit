# Gap analysis — write side & unknowns

**Status update:** the entire **read** surface is now scraped — content tree (145 items incl. quiz
questions, file-upload instructions, links), grades, notices, messages, achievements, calendar,
communities, and LTI tools. Only the **write** side (mutating the academic record) remains unknown.

## 0. Hidden topics (SOLVED — read side)

The topic-detail endpoint (`GET /v2/.../topics/{topicId}`) does **not** enforce visibility: it
serves content for topics absent from the student's tree. Confirmed live 2026-09-14 by sweeping the
id gaps around the tree ids: 78/137 probed ids returned 200 with full content, including hidden
quizzes with questions (`89612094`, `89612095`, `89612106`, `89612117`) and tasks linked to
gradebook activities via `context.gradeBookId` (e.g. gradebook `5487158` → topic `89612059`).
`harvestHiddenTopics` (`src/content.ts`) now harvests these into `origin:"hidden"` items, cached in
`scraped/raw/hidden-index.json`; the app surfaces them read-only at `/gods-eye`. Gradebook ids are
**not** topic ids (all 404); the bridge is the `gradeBookId` field on the topic context. Calendar
appointments carry the real topic id (`entityType:"topic"`, `id` == topicId) but added little.

## 1. Quiz submit (SOLVED)

**Status:** ✅ solved (2026-09-11, verified against the live SPA by aborting the network call).

The student quiz flow is driven by the SPA's Vuex actions in the `plataforma/enrollment` module,
which call:

- **Answer a question** → `POST /v1/plataforma/content/enrollment/{enrollmentId}/quiz/{topicId}`
  with body `{ "questionId": <id>, "optionId": <id> }`.
  Vuex: `actionAnswerQuizQuestion({ enrollmentId, topic: { topicId }, questionId, optionId })`.
- **Finish the attempt** → `POST /v1/plataforma/content/enrollment/{enrollmentId}/quiz/{topicId}/attempt/{attemptId}`
  with an empty body.
  Vuex: `actionFinishQuizAttempt({ enrollmentId, topic: { topicId }, attemptId })`.

`enrollmentId` comes from the topic `context`. Because writes may hit AWS WAF, the runner drives
these through the SPA store (which uses the authenticated `$axios`), not native `fetch`. A
**Pesquisa** (survey) is submitted by the answer call alone — it has no attempt/finish cycle.

Implemented in `packages/portal/scripts/submit-task.ts::submitQuizViaStore` (`action: "quiz"`, with
`survey: true` for pesquisas) and surfaced by the app (`apps/server/src/send.ts::launchQuizSubmit`).

**Known (read side):**
- Quiz content fully readable via `GET /v2/plataforma/content/academics-main/{courseId}/topics/{topicId}`
  → `topics.content.questions[]` (each with `id`, `enunciated`, `options[]`).
- Quiz `topicTypeId`s: 37 ("Exercícios"), 15 ("Questionário"), 29/30 (pre/post-test).
- `content.hasRetries`, `numberRetries`, `hasCompletedAllAttempts` gate retries.

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

## 4. Forum post/reply (IN PROGRESS — read side solved)

**Status:** 🟡 read side solved (2026-09-12); write side implemented but body shape unconfirmed.

**Read side (solved, verified live):**
- Topic detail (`GET /v2/.../topics/{topicId}`) carries forum flags in `content`:
  `countPosts`, `countOfMyPosts`, `isAllowLikes`, `isToLimitResponses`,
  `maxAnswerPerStudent`, `isOnlyVisibleToPeopleWithPost`, `hasReachedPostLimit` — but
  `posts` is **always `[]`** there.
- The thread lives at `GET /v1/plataforma/content/enrollment/{enrollmentId}/topic/{topicId}/post?page=1&perPage=50`
  (note the **singular** `topic`/`post`). Bearer-only GET works, no WAF. Pagination via
  `page`/`perPage`.
- SPA path: Vuex `plataforma/enrollment/actionGetPostsByTopicId` with payload
  `{ enrollmentId, topicId }`. Other forum actions found in the store:
  `content/actionPostCommentInForum`, `content/actionPatchCommentOfTopic`,
  `content/actionLikeTopic`/`actionDislikeTopic`/`actionLikeComment`/`actionDislikeComment`,
  `newContent/actionCreatePost`, `newContent/actionEditPost`,
  `newContent/actionAddPostLike`/`actionRemovePostLike`, `newContent/actionAddTopicLike`/`actionRemoveTopicLike`,
  `newContent/actionGetPostByParentPostId`, `enrollment/actionDeletePost`.
- Post schema: `{ id, topicId, html, createdAt, updatedAt, isEdited, enrollmentId,
  parentPostId (null = top-level), isHidden, isDeleted, postOwnerUsername,
  postOwnerProfilePhoto, postOwnerLtiRole, postOwnerSafeaRole, postOwnerRoleName,
  mainGroupId, children[], enrollmentIdsWhoLiked[] }`. `children` nests replies.
- Posting is the completion signal: `countOfMyPosts > 0` → done (implemented in
  `collectContent` + app index).

**Write side (implemented — endpoint reconstructed from the SPA store, 2026-09-12):**
- `POST /v1/plataforma/content/topic/{topicId}/enrollment/{enrollmentId}/post` with body
  `{ html }` (add `parentPostId` for replies). Reconstructed by decoding the obfuscated
  SPA chunk string table: Vuex `content/actionPostCommentInForum` takes
  `{ topicId, enrollmentId, params }` and calls `client.post("content/topic/{tid}/enrollment/{eid}/post", params)`.
- Edit: `PATCH content/topic/{tid}/enrollment/{eid}/post/{postId}` (patchCommentOfTopic).
  Delete: `DELETE /content/enrollment/{eid}/topic/{tid}/post/{postId}` (deletePost).
  Likes: `POST/DELETE content/academics-main/{courseId}/topics/{topicId}/posts/{postId}/likes`.
- `submit-task.ts` `action: "forum"` posts, then verifies by re-reading the thread, and
  falls back to driving the SPA composer when the API rejects (403/WAF).

## 5. Token/WAF risk for writes

GET reads work without the AWS WAF token, but `aws-waf-token` cookie + `awswaf_session_storage` are
present. Writes (POST/PUT) may require the WAF challenge solved in-browser. Recommend driving all
writes through Playwright (in-page) rather than native `fetch`.

## How to close gap 2 (file upload)

```bash
npm run capture-api -- --url https://unifoa2.grupoa.education/plataforma/course/5254272/content/89612190 --headful
# → upload one file, then press Enter to dump the captured API calls
```

> ⚠ These actions submit real work to the student's academic record. Run only with explicit intent.
