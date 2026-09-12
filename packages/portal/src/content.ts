import type { ApiClient } from "./client.js";
import { logger } from "./config.js";

export interface ContentAttachment {
  url: string;
  filename: string | null;
  filesize: number | null;
}

export interface QuizOption {
  id: number;
  text: string;
}

export interface QuizQuestion {
  id: number;
  questionTypeId: number;
  enunciated: string;
  options: QuizOption[];
  hasFileUpload?: boolean;
  grade?: unknown;
  feedbackTypeId?: number;
}

export interface LinkItem {
  id: number | null;
  title: string;
  type: string | null;
  url: string;
  html: string | null;
}

/** One forum publication (top-level post or nested reply via `children`). */
export interface ForumPost {
  id: number;
  topicId: number;
  html: string;
  createdAt: string;
  updatedAt: string;
  isEdited: boolean;
  /** Author enrollment — the id that appears in `enrollmentIdsWhoLiked`. */
  enrollmentId: number;
  /** `null` = top-level post; set = reply to another post. */
  parentPostId: number | null;
  isHidden: boolean;
  isDeleted: boolean;
  postOwnerUsername: string;
  postOwnerProfilePhoto: string | null;
  postOwnerSafeaRole: string | null;
  postOwnerRoleName: string | null;
  children: ForumPost[];
  enrollmentIdsWhoLiked: number[];
}

/** Forum state as exposed by the topic detail `content` object. */
export interface ForumInfo {
  countPosts: number;
  countOfMyPosts: number;
  isAllowLikes: boolean;
  isToLimitResponses: boolean;
  maxAnswerPerStudent: number;
  isOnlyVisibleToPeopleWithPost: boolean;
  hasReachedPostLimit: boolean;
  posts: ForumPost[];
}

export interface ContentItem {
  courseId: number;
  courseName: string;
  moduleId: number;
  moduleTitle: string;
  sectionId: number | null;
  sectionTitle: string | null;
  itemId: number;
  itemTitle: string;
  topicTypeId: number;
  categoryTypeId: number | null;
  kind: ContentKind;
  progressTypeId: number;
  isRecordProgress: boolean;
  done: boolean;
  viewed: boolean;
  expired: boolean;
  hasDeadline: boolean;
  deadlineAt: string | null;
  hasCompletedAllAttempts: boolean | null;
  grade: unknown;
  studentGrade: unknown;
  attachments: ContentAttachment[];
  html: string | null;
  content: Record<string, unknown> | null;
  context: Record<string, unknown> | null;
  links: LinkItem[];
}

export interface ContentCourse {
  courseId: number;
  courseName: string;
  items: ContentItem[];
}

export type ContentKind =
  | "pdf"
  | "reading"
  | "quiz"
  | "file_upload"
  | "link"
  | "forum"
  | "other";

const PDF_TAG_RE = /<grupoabook\b[^>]*>/gi;
const ATTACH_TAG_RE = /<grupoaattachment\b[^>]*>/gi;

const NAMED_ENTITIES: Record<string, string> = {
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  atilde: "ã", otilde: "õ", Atilde: "Ã", Otilde: "Õ",
  ccedil: "ç", Ccedil: "Ç", ntilde: "ñ", Ntilde: "Ñ",
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
};

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (_, name: string) => NAMED_ENTITIES[name] ?? `&${name};`);
}

function attrOf(tag: string, name: string): string | null {
  const re = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i");
  const match = tag.match(re);
  return match ? (match[1] ?? null) : null;
}

export function parsePdfAttachments(html: string | null | undefined): ContentAttachment[] {
  if (!html) return [];
  const out: ContentAttachment[] = [];
  const seen = new Set<string>();
  for (const tag of html.match(PDF_TAG_RE) ?? []) {
    const file = attrOf(tag, "file");
    if (!file || !/\.pdf$/i.test(file) || seen.has(file)) continue;
    const filename = attrOf(tag, "filename");
    const filesize = attrOf(tag, "filesize");
    seen.add(file);
    out.push({
      url: file,
      filename: filename ? decodeHtmlEntities(filename) : null,
      filesize: filesize ? Number(filesize) || null : null,
    });
  }
  // `<grupoaattachment>` embeds template files (docx/pdf/...) in file-upload tasks.
  for (const tag of html.match(ATTACH_TAG_RE) ?? []) {
    const file = attrOf(tag, "file");
    if (!file || seen.has(file)) continue;
    const filename = attrOf(tag, "filename");
    const filesize = attrOf(tag, "filesize");
    seen.add(file);
    out.push({
      url: file,
      filename: filename ? decodeHtmlEntities(filename) : null,
      filesize: filesize ? Number(filesize) || null : null,
    });
  }
  return out;
}

/** Extract the quiz questions embedded in a topic-detail `content` object. */
export function parseQuizQuestions(content: Record<string, unknown> | null | undefined): QuizQuestion[] {
  if (!content) return [];
  const questions = content.questions;
  if (!Array.isArray(questions)) return [];
  return questions.map((q) => {
    const raw = q as Record<string, unknown>;
    const options = Array.isArray(raw.options)
      ? raw.options.map((o) => {
          const opt = o as Record<string, unknown>;
          return { id: Number(opt.id), text: String(opt.text ?? "") };
        })
      : [];
    return {
      id: Number(raw.id),
      questionTypeId: Number(raw.questionTypeId ?? 0),
      enunciated: String(raw.enunciated ?? ""),
      options,
      hasFileUpload: raw.hasFileUpload === true,
      grade: raw.grade ?? null,
      feedbackTypeId: raw.feedbackTypeId != null ? Number(raw.feedbackTypeId) : undefined,
    };
  });
}

/** Extract the list of links embedded in a topic-detail `content.items` (type 7 "Links"). */
export function parseLinks(content: Record<string, unknown> | null | undefined): LinkItem[] {
  if (!content) return [];
  const items = content.items;
  if (!Array.isArray(items)) return [];
  return items.map((it) => {
    const raw = it as Record<string, unknown>;
    return {
      id: raw.id != null ? Number(raw.id) : null,
      title: String(raw.title ?? ""),
      type: raw.type != null ? String(raw.type) : null,
      url: String(raw.url ?? ""),
      html: raw.html != null ? String(raw.html) : null,
    };
  });
}

/** Count top-level + nested posts authored by the given enrollment. */
export function countMyPosts(posts: ForumPost[], enrollmentId: number): number {
  return posts.reduce(
    (n, p) => n + (p.enrollmentId === enrollmentId && !p.isDeleted ? 1 : 0) + countMyPosts(p.children, enrollmentId),
    0,
  );
}

/** Parse the `content.posts[]` array of a forum topic detail. */
export function parseForumPosts(raw: unknown): ForumPost[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((p) => {
    const r = p as Record<string, unknown>;
    return {
      id: Number(r.id),
      topicId: Number(r.topicId ?? 0),
      html: String(r.html ?? ""),
      createdAt: String(r.createdAt ?? ""),
      updatedAt: String(r.updatedAt ?? ""),
      isEdited: r.isEdited === true,
      enrollmentId: Number(r.enrollmentId ?? 0),
      parentPostId: r.parentPostId != null ? Number(r.parentPostId) : null,
      isHidden: r.isHidden === true,
      isDeleted: r.isDeleted === true,
      postOwnerUsername: String(r.postOwnerUsername ?? ""),
      postOwnerProfilePhoto: r.postOwnerProfilePhoto != null ? String(r.postOwnerProfilePhoto) : null,
      postOwnerSafeaRole: r.postOwnerSafeaRole != null ? String(r.postOwnerSafeaRole) : null,
      postOwnerRoleName: r.postOwnerRoleName != null ? String(r.postOwnerRoleName) : null,
      children: parseForumPosts(r.children),
      enrollmentIdsWhoLiked: Array.isArray(r.enrollmentIdsWhoLiked)
        ? r.enrollmentIdsWhoLiked.map(Number)
        : [],
    };
  });
}

/** Extract the forum state from a topic-detail `content` object (null when not a forum). */
export function parseForumInfo(content: Record<string, unknown> | null | undefined): ForumInfo | null {
  if (!content || !("countPosts" in content) || !("posts" in content)) return null;
  return {
    countPosts: Number(content.countPosts ?? 0),
    countOfMyPosts: Number(content.countOfMyPosts ?? 0),
    isAllowLikes: content.isAllowLikes === true,
    isToLimitResponses: content.isToLimitResponses === true,
    maxAnswerPerStudent: Number(content.maxAnswerPerStudent ?? 0),
    isOnlyVisibleToPeopleWithPost: content.isOnlyVisibleToPeopleWithPost === true,
    hasReachedPostLimit: content.hasReachedPostLimit === true,
    posts: parseForumPosts(content.posts),
  };
}

export function classify(topicTypeId: number, progressTypeId: number, hasPdf: boolean): ContentKind {
  switch (topicTypeId) {
    case 8:
      return "file_upload";
    case 37:
    case 15:
    case 29:
    case 30:
      return "quiz";
    case 7:
      return "link";
    case 9:
      return "forum";
    case 3:
      if (progressTypeId === 2) return "reading";
      if (hasPdf) return "pdf";
      return "reading";
    default:
      return "other";
  }
}

export function isDone(item: {
  progressId?: number | null;
  viewed?: boolean | null;
  grade?: unknown;
  hasCompletedAllAttempts?: boolean | null;
}): boolean {
  if (item.progressId != null) return true;
  if (item.hasCompletedAllAttempts === true) return true;
  if (item.grade != null) return true;
  return item.viewed === true;
}

export const ACTIONABLE_KINDS: ContentKind[] = ["pdf", "reading", "quiz", "file_upload"];

/**
 * Kinds that the portal lets the student complete with a manual
 * "Mark as completed" button. Quizzes, file-upload tasks and forums are NOT
 * here — they are completed by real work (answering/uploading/posting).
 */
export const MARKABLE_KINDS: ContentKind[] = ["pdf", "reading", "link", "other"];

/**
 * Whether an item exposes the portal's "Mark as completed" action and is still
 * pending. The SPA shows the button on content-type items that record progress
 * (`isRecordProgress === true`) and have no submission flow. Confirmed live:
 * the button POSTs an empty body to `.../topics/{id}/progress` and returns 204.
 */
export function isMarkable(item: Pick<ContentItem, "kind" | "isRecordProgress" | "done">): boolean {
  if (!item.isRecordProgress || item.done) return false;
  return MARKABLE_KINDS.includes(item.kind);
}

interface RawLeaf {
  courseId: number;
  courseName: string;
  moduleId: number;
  moduleTitle: string;
  sectionId: number | null;
  sectionTitle: string | null;
  itemId: number;
  itemTitle: string;
  topicTypeId: number;
  categoryTypeId: number | null;
  progressTypeId: number;
  progressId: number | null;
  viewed: boolean;
  grade: unknown;
  isRecordProgress: boolean;
  expired: boolean;
  hasCompletedAllAttempts: boolean | null;
  hasDeadline: boolean;
  deadlineAt: string | null;
}

/** Enumerate all enrolled courses. Returns `{ id, name }[]`. */
export async function fetchCourses(client: ApiClient): Promise<{ id: number; name: string }[]> {
  const res = await client.get<{ courses?: { id: number; name: string }[] }>(
    "/v1/plataforma/academic/courses/me?state=all&page=1&limit=50&sort=asc&sortBy=name&type=courses",
  );
  return res.data.courses ?? [];
}

interface ContentTreeNode {
  id: number;
  title: string;
  topicTypeId?: number;
  categoryTypeId?: number | null;
  children?: ContentTreeNode[];
  progressTypeId?: number;
  progressId?: number | null;
  viewed?: boolean;
  grade?: { value?: unknown };
  isRecordProgress?: boolean;
  expired?: boolean;
  hasCompletedAllAttempts?: boolean | null;
  hasDeadline?: boolean;
  deadlineAt?: string | null;
}

/** Walk the content tree and collect every leaf item across all courses. */
export async function collectContent(
  client: ApiClient,
  courseIds: number[] = [],
): Promise<ContentCourse[]> {
  const courses = await fetchCourses(client);
  const wanted = new Set(courseIds);
  const result: ContentCourse[] = [];

  for (const course of courses) {
    if (wanted.size > 0 && !wanted.has(course.id)) continue;

    const tree = await client.get<{ topics?: ContentTreeNode[] }>(
      `/v2/plataforma/content/academics-main/${course.id}/contents`,
    );
    const leaves: RawLeaf[] = [];
    const sectionIds: number[] = [];

    const walk = (
      node: ContentTreeNode,
      moduleId: number,
      moduleTitle: string,
      sectionId: number | null,
      sectionTitle: string | null,
    ): void => {
      const t = node.topicTypeId ?? 0;
      const children = node.children ?? [];
      if (t === 1) {
        for (const child of children) walk(child, node.id, node.title, null, null);
        return;
      }
      if (t === 2) {
        sectionIds.push(node.id);
        for (const child of children) walk(child, moduleId, moduleTitle, node.id, node.title);
        return;
      }
      leaves.push({
        courseId: course.id,
        courseName: course.name,
        moduleId,
        moduleTitle,
        sectionId,
        sectionTitle,
        itemId: node.id,
        itemTitle: node.title,
        topicTypeId: t,
        categoryTypeId: node.categoryTypeId ?? null,
        progressTypeId: node.progressTypeId ?? 1,
        progressId: node.progressId ?? null,
        viewed: node.viewed === true,
        grade: node.grade?.value ?? null,
        isRecordProgress: node.isRecordProgress === true,
        expired: node.expired === true,
        hasCompletedAllAttempts: node.hasCompletedAllAttempts ?? null,
        hasDeadline: node.hasDeadline === true,
        deadlineAt: node.deadlineAt ?? null,
      });
    };

    for (const module of tree.data.topics ?? []) {
      walk(module, module.id, module.title, null, null);
    }

    const htmlByItemId = new Map<string, string>();
    for (const sid of sectionIds) {
      try {
        const detail = await client.get<{ topics?: { id: number; content?: { html?: string } }[] }>(
          `/v2/plataforma/content/academics-main/${course.id}/topics/${sid}`,
        );
        for (const child of detail.data.topics ?? []) {
          const html = child.content?.html;
          if (html) htmlByItemId.set(String(child.id), html);
        }
      } catch (err) {
        logger.warn({ courseId: course.id, sectionId: sid, err }, "failed to fetch section detail");
      }
    }

    // The *topic* detail (`/topics/{itemId}`) is the richest source: it carries
    // `topics.content` (html / questions / links / upload metadata), plus `context`
    // (full academic context) and `topics.studentGrade`. Fetch it for EVERY leaf so
    // nothing is left behind. Done with limited concurrency to finish within the
    // token's lifetime.
    interface TopicDetail {
      context?: Record<string, unknown>;
      topics?: { id?: number; content?: Record<string, unknown>; studentGrade?: unknown };
    }
    const topicDetailByItemId = new Map<string, TopicDetail>();

    const CONCURRENCY = 5;
    let next = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, leaves.length) }, async () => {
      while (next < leaves.length) {
        const idx = next++;
        const leaf = leaves[idx];
        try {
          const detail = await client.get<TopicDetail>(
            `/v2/plataforma/content/academics-main/${course.id}/topics/${leaf.itemId}`,
          );
          topicDetailByItemId.set(String(leaf.itemId), detail.data);
        } catch (err) {
          logger.warn({ itemId: leaf.itemId, err }, "failed to fetch topic detail");
        }
      }
    });
    await Promise.all(workers);

    const items: ContentItem[] = leaves.map((leaf) => {
      const detail = topicDetailByItemId.get(String(leaf.itemId)) ?? null;
      const content = detail?.topics?.content ?? null;
      const context = detail?.context ?? null;
      const studentGrade = detail?.topics?.studentGrade ?? null;
      const html = content?.html ? String(content.html) : htmlByItemId.get(String(leaf.itemId)) ?? null;
      const attachments = parsePdfAttachments(html);
      const links = parseLinks(content);
      const hasPdf = attachments.some((a) => a.url.toLowerCase().endsWith(".pdf"));
      const kind = classify(leaf.topicTypeId, leaf.progressTypeId, hasPdf);
      const done = isDone(leaf);
      return { ...leaf, kind, done, attachments, html, content, context, links, studentGrade };
    });

    // Forum threads: the topic detail carries counts but the posts live at an
    // enrollment-scoped endpoint (GET .../enrollment/{eid}/topic/{tid}/post —
    // confirmed live, works with the bearer token alone, paginated).
    for (const forum of items.filter((it) => it.kind === "forum")) {
      const enrollmentId = forum.context?.enrollmentId;
      if (enrollmentId == null) continue;
      try {
        const expected = Number(forum.content?.countPosts ?? 0);
        const all: ForumPost[] = [];
        for (let pageIdx = 1; pageIdx <= 10; pageIdx++) {
          const res = await client.get<unknown>(
            `/v1/plataforma/content/enrollment/${Number(enrollmentId)}/topic/${forum.itemId}/post?page=${pageIdx}&perPage=50`,
          );
          const batch = parseForumPosts(res.data);
          all.push(...batch);
          if (batch.length === 0 || (expected > 0 && all.length >= expected)) break;
        }
        const mine = countMyPosts(all, Number(enrollmentId));
        forum.content = {
          ...(forum.content ?? {}),
          posts: all as unknown as Record<string, unknown>[],
        };
        // Posting is the forum's completion signal.
        if (mine > 0 || Number(forum.content?.countOfMyPosts ?? 0) > 0) {
          forum.done = true;
        }
      } catch (err) {
        logger.warn({ itemId: forum.itemId, err }, "failed to fetch forum posts");
      }
    }

    result.push({ courseId: course.id, courseName: course.name, items });
    logger.info({ course: course.name, items: items.length }, "course content collected");
  }

  return result;
}
