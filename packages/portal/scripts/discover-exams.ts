/**
 * One-off discovery probe: find the hidden topics behind the gradebook-only
 * exam activities (topicTypeId 27 "Avaliação" and the tt=15 formative quizzes).
 *
 * Unlike the God's Eye harvest, this probe:
 *   - sends requests through the browser context (so the AWS WAF cookie rides along),
 *   - is bounded (hard request budget, no infinite re-queue),
 *   - paces itself and logs progress,
 *   - stops early once every exam gradebook id is bridged to a topic.
 *
 * Read-only: GETs only. No writes to the portal.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { createSession, closeSession, type Session } from "../src/session.js";
import { ApiClient } from "../src/client.js";
import {
  collectContent,
  fetchGradebookActivities,
  normalizeTitle,
} from "../src/content.js";
import { config, logger } from "../src/config.js";
import { ensureDir, json, resolveOut, sleep } from "../src/util.js";

const COURSE_ID = Number(process.env.EXAM_COURSE_ID ?? 5254272);
const DELAY_MS = Number(process.env.EXAM_DELAY_MS ?? 150);
const MARGIN = Number(process.env.EXAM_MARGIN ?? 15);
const BUDGET = Number(process.env.EXAM_BUDGET ?? 700);
const WAF_COOLDOWN_MS = Number(process.env.EXAM_WAF_COOLDOWN_MS ?? 8_000);

interface TopicProbe {
  id: number;
  topicTypeId: number | null;
  title: string | null;
  gradeBookId: number | null;
  isVisible: boolean | null;
  contentKeys: string[];
  hasQuestions: boolean;
}

function extractProbe(id: number, data: unknown): TopicProbe | null {
  const d = data as { topics?: unknown; context?: Record<string, unknown> } | null;
  const raw = d?.topics;
  const t = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | undefined;
  if (!t) return null;
  const context = d?.context ?? {};
  const content = (t.content ?? null) as Record<string, unknown> | null;
  return {
    id,
    topicTypeId: Number(t.topicTypeId ?? context.topicTypeId ?? 0) || null,
    title: t.title != null ? String(t.title) : null,
    gradeBookId:
      context.gradeBookId != null && Number(context.gradeBookId) > 0
        ? Number(context.gradeBookId)
        : null,
    isVisible: t.isVisible === true ? true : t.isVisible === false ? false : null,
    contentKeys: content && typeof content === "object" ? Object.keys(content) : [],
    hasQuestions: Array.isArray(content?.questions) && content.questions.length > 0,
  };
}

type ProbeOutcome = TopicProbe | "missing" | "throttled";

async function probe(session: Session, id: number): Promise<ProbeOutcome> {
  const headers: Record<string, string> = {
    ...ApiClient.headersFor(session.auth.token, session.auth.notice),
  };
  const url = `https://api.plataforma.grupoa.education/v2/plataforma/content/academics-main/${COURSE_ID}/topics/${id}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await session.context.request.get(url, { headers, timeout: 20_000 });
    if (res.status() === 200) return extractProbe(id, await res.json()) ?? "missing";
    if (res.status() === 403 || res.status() === 429) {
      if (attempt === 0) {
        await sleep(WAF_COOLDOWN_MS);
        continue;
      }
      return "throttled";
    }
    return "missing";
  }
  return "throttled";
}

async function main(): Promise<void> {
  const session = await createSession();
  try {
    const courses = await collectContent(session.client, [COURSE_ID]);
    const course = courses[0];
    if (!course) throw new Error(`course ${COURSE_ID} not found`);
    const gradebook = await fetchGradebookActivities(session.client, COURSE_ID);

    const examGradebook = gradebook.filter((g) => g.topicTypeId === 27 || g.topicTypeId === 15);
    const pending = new Set(examGradebook.map((g) => g.id));
    logger.info(
      { treeItems: course.items.length, examActivities: examGradebook.length },
      "discovery: loaded tree + gradebook",
    );

    const treeIds = new Set(course.items.map((i) => i.itemId).filter((n) => n > 0));
    const candidateSet = new Set<number>();
    for (const id of treeIds) {
      for (let i = id - MARGIN; i <= id + MARGIN; i++) {
        if (i > 0 && !treeIds.has(i)) candidateSet.add(i);
      }
    }
    for (const id of (process.env.EXAM_IDS ?? "").split(",").map((s) => Number(s.trim()))) {
      if (Number.isFinite(id) && id > 0) candidateSet.add(id);
    }
    let candidates = [...candidateSet].sort((a, b) => a - b);
    if (candidates.length > BUDGET) {
      logger.warn({ candidates: candidates.length, budget: BUDGET }, "discovery: capping candidates");
      candidates = candidates.slice(0, BUDGET);
    }

    const found: TopicProbe[] = [];
    const examMatches: TopicProbe[] = [];
    let readable = 0;
    let throttled = 0;
    let consecutiveThrottle = 0;

    const outDir = resolveOut(config.outDir, "raw");
    ensureDir(outDir);
    const reportPath = path.join(outDir, "exam-scan.json");
    const save = (): void => {
      writeFileSync(
        reportPath,
        json({
          generatedAt: new Date().toISOString(),
          courseId: COURSE_ID,
          courseName: course.courseName,
          counts: { candidates: candidates.length, readable, throttled, pending: [...pending] },
          examGradebook,
          examMatches,
          hiddenTopics: found,
        }),
        "utf-8",
      );
    };

    for (let i = 0; i < candidates.length; i++) {
      const id = candidates[i];
      const result = await probe(session, id);
      if (result === "throttled") {
        throttled++;
        consecutiveThrottle++;
        if (consecutiveThrottle % 3 === 0) await sleep(WAF_COOLDOWN_MS);
      } else if (result === "missing") {
        consecutiveThrottle = 0;
      } else {
        consecutiveThrottle = 0;
        readable++;
        found.push(result);
        const gbMatch = result.gradeBookId != null && pending.has(result.gradeBookId);
        if (result.topicTypeId === 27 || result.topicTypeId === 15 || gbMatch) {
          examMatches.push(result);
          if (result.gradeBookId != null) pending.delete(result.gradeBookId);
          logger.info(
            {
              id: result.id,
              tt: result.topicTypeId,
              gradeBookId: result.gradeBookId,
              title: result.title,
              hasQuestions: result.hasQuestions,
            },
            "discovery: exam candidate",
          );
          save();
        }
      }
      if ((i + 1) % 25 === 0) {
        logger.info(
          { done: i + 1, total: candidates.length, readable, throttled, pending: [...pending] },
          "discovery: progress",
        );
      }
      if (pending.size === 0) {
        logger.info("discovery: all exam gradebook ids bridged — stopping early");
        break;
      }
      await sleep(DELAY_MS);
    }

    save();
    console.log("\n=== discovery summary ===");
    console.log(`candidates=${candidates.length} readable=${readable} throttled=${throttled}`);
    for (const g of examGradebook) {
      const hit = examMatches.find((r) => r.gradeBookId === g.id);
      console.log(`  gb ${g.id} tt=${g.topicTypeId} ${g.name} -> ${hit ? `topic ${hit.id}` : "NO TOPIC"}`);
    }
    console.log(`report -> ${reportPath}`);
  } finally {
    await closeSession(session);
  }
}

main().catch((err) => {
  logger.error({ err }, "discovery failed");
  console.error(err);
  process.exit(1);
});
