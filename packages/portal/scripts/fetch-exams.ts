/**
 * Fetch the full content of the exam topics discovered by `discover-exams.ts`
 * (the hidden topics bridged from gradebook-only activities). Reads
 * `scraped/raw/exam-scan.json`, re-fetches each matched topic through the
 * browser context (so the AWS WAF cookie rides along), and writes a raw dump
 * plus a readable markdown file.
 *
 * Read-only: GETs only.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createSession, closeSession, type Session } from "../src/session.js";
import { ApiClient } from "../src/client.js";
import { config, logger } from "../src/config.js";
import { htmlToMarkdown } from "../src/markdown.js";
import { ensureDir, json, resolveOut, sleep } from "../src/util.js";

interface ExamScan {
  courseId: number;
  courseName: string;
  examMatches: { id: number; topicTypeId: number | null; title: string | null; gradeBookId: number | null }[];
}

interface QuizOptionRaw {
  id: number;
  text?: string;
  feedback?: string;
  isCorrect?: boolean;
}
interface QuizQuestionRaw {
  id: number;
  questionTypeId?: number;
  enunciated?: string;
  feedback?: string;
  grade?: unknown;
  hasFileUpload?: boolean;
  options?: QuizOptionRaw[];
}

async function fetchTopic(session: Session, courseId: number, id: number): Promise<unknown> {
  const headers: Record<string, string> = {
    ...ApiClient.headersFor(session.auth.token, session.auth.notice),
  };
  const url = `https://api.plataforma.grupoa.education/v2/plataforma/content/academics-main/${courseId}/topics/${id}`;
  const res = await session.context.request.get(url, { headers, timeout: 20_000 });
  if (res.status() !== 200) throw new Error(`GET topic ${id} -> ${res.status()}`);
  return res.json();
}

function renderQuiz(q: QuizQuestionRaw): string[] {
  const lines: string[] = [];
  lines.push(`### Questão ${q.id} (type=${q.questionTypeId ?? "?"}, nota=${q.grade ?? "—"})`);
  lines.push("");
  lines.push(htmlToMarkdown(String(q.enunciated ?? "")));
  lines.push("");
  for (const opt of q.options ?? []) {
    const mark = opt.isCorrect ? " ✅" : "";
    lines.push(`- ${htmlToMarkdown(String(opt.text ?? "")).replace(/\n+/g, " ")}${mark}`);
  }
  if (q.feedback) {
    lines.push("");
    lines.push(`> Feedback: ${htmlToMarkdown(String(q.feedback)).replace(/\n+/g, " ")}`);
  }
  lines.push("");
  return lines;
}

function renderMarkdown(scan: ExamScan, topics: { id: number; gradeBookId: number | null; title: string | null; topicTypeId: number | null; content: any }[]): string {
  const lines: string[] = [];
  lines.push(`# Exames recuperáveis — ${scan.courseName}`);
  lines.push("");
  lines.push(
    "> Somente os itens que o portal expõe como **tópico oculto** (bridge `context.gradeBookId`).",
  );
  lines.push("");
  for (const t of topics) {
    lines.push(`## ${t.title} (topic ${t.id}, gradebook ${t.gradeBookId ?? "—"})`);
    lines.push("");
    const questions: QuizQuestionRaw[] = t.content?.questions ?? [];
    if (questions.length === 0) {
      lines.push("_Sem questões neste tópico._");
      lines.push("");
      continue;
    }
    if (t.content?.instructions) {
      lines.push(htmlToMarkdown(String(t.content.instructions)));
      lines.push("");
    }
    for (const q of questions) lines.push(...renderQuiz(q));
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const scanPath = resolveOut(config.outDir, "raw", "exam-scan.json");
  if (!existsSync(scanPath)) throw new Error(`missing ${scanPath}; run discover-exams.ts first`);
  const scan = JSON.parse(readFileSync(scanPath, "utf-8")) as ExamScan;
  const ids = scan.examMatches.map((m) => m.id);
  if (ids.length === 0) throw new Error("no exam topics to fetch");

  const session = await createSession();
  try {
    const out: { id: number; gradeBookId: number | null; title: string | null; topicTypeId: number | null; content: any }[] = [];
    for (const id of ids) {
      const match = scan.examMatches.find((m) => m.id === id);
      try {
        const data = (await fetchTopic(session, scan.courseId, id)) as any;
        const t = Array.isArray(data?.topics) ? data.topics[0] : data?.topics;
        out.push({
          id,
          gradeBookId: match?.gradeBookId ?? null,
          title: t?.title ?? match?.title ?? null,
          topicTypeId: t?.topicTypeId ?? match?.topicTypeId ?? null,
          content: t?.content ?? null,
        });
        logger.info({ id, questions: t?.content?.questions?.length ?? 0 }, "fetched exam topic");
      } catch (err) {
        logger.warn({ id, err }, "failed to fetch exam topic");
      }
      await sleep(200);
    }

    const rawDir = resolveOut(config.outDir, "raw");
    ensureDir(rawDir);
    writeFileSync(path.join(rawDir, "exams.json"), json({ generatedAt: new Date().toISOString(), courseId: scan.courseId, topics: out }), "utf-8");
    const mdPath = path.join(resolveOut(config.outDir), `exams-${scan.courseId}.md`);
    writeFileSync(mdPath, renderMarkdown(scan, out), "utf-8");
    console.log(`\nFetched ${out.length} exam topic(s) → ${mdPath}`);
  } finally {
    await closeSession(session);
  }
}

main().catch((err) => {
  logger.error({ err }, "fetch-exams failed");
  console.error(err);
  process.exit(1);
});
