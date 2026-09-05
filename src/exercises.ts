import type { ApiClient } from "./client.js";
import { parseQuizQuestions, type QuizQuestion } from "./content.js";

/**
 * Exercise helpers.
 *
 * The READ side is fully implemented (quizzes and assignments are readable through the
 * content API). The WRITE side (submitting answers / uploading files) is intentionally
 * NOT wired to the live account until its endpoints are captured in a controlled session —
 * see docs/gaps.md. The functions below throw until then, so no accidental submission
 * can happen.
 */

export interface TopicContent {
  context: Record<string, unknown> | null;
  content: Record<string, unknown> | null;
}

/** Fetch the item/topic detail (the richest source) for any content item. */
export async function fetchTopic(client: ApiClient, courseId: number, topicId: number): Promise<TopicContent> {
  const res = await client.get<{ context?: Record<string, unknown>; topics?: { content?: Record<string, unknown> } }>(
    `/v2/plataforma/content/academics-main/${courseId}/topics/${topicId}`,
  );
  return { context: res.data.context ?? null, content: res.data.topics?.content ?? null };
}

/** Read a quiz's questions + options (no submission). */
export async function fetchQuiz(client: ApiClient, courseId: number, topicId: number): Promise<QuizQuestion[]> {
  const { content } = await fetchTopic(client, courseId, topicId);
  return parseQuizQuestions(content);
}

/** Read a file-upload task's instructions, attachments and limits (no submission). */
export async function fetchUploadTask(
  client: ApiClient,
  courseId: number,
  topicId: number,
): Promise<Record<string, unknown> | null> {
  const { content } = await fetchTopic(client, courseId, topicId);
  return content;
}

function notCaptured(fn: string): never {
  throw new Error(
    `${fn}(): the quiz/upload SUBMIT endpoint has not been captured yet. ` +
      `See docs/gaps.md — run a controlled headful capture (npm run capture-api -- --url <item> --headful) ` +
      `and submit one attempt to record the POST contract before implementing this.`,
  );
}

/**
 * Submit a quiz answer. Placeholder until the write endpoint is captured.
 * Never call against a live account with real answers unless explicitly intended.
 */
export async function submitAnswer(
  _client: ApiClient,
  _courseId: number,
  _topicId: number,
  _answers: { questionId: number; optionIds: number[] }[],
): Promise<unknown> {
  return notCaptured("submitAnswer");
}

/**
 * Upload a file to a task. Placeholder until the write endpoint is captured.
 * Never call against a live account unless explicitly intended.
 */
export async function uploadFile(
  _client: ApiClient,
  _courseId: number,
  _topicId: number,
  _filePath: string,
): Promise<unknown> {
  return notCaptured("uploadFile");
}
