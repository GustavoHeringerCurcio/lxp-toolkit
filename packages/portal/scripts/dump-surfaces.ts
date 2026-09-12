import { writeFileSync } from "node:fs";
import path from "node:path";
import { createSession, closeSession } from "../src/session.js";
import { fetchCourses } from "../src/content.js";
import { config, logger } from "../src/config.js";
import { codeBlock, tableCell } from "../src/markdown.js";
import { ensureDir, json, resolveOut, slugify } from "../src/util.js";

interface GradeLeaf {
  id: number;
  name: string;
  maxValue: number | null;
  value: number | null;
  isSubmited: boolean;
  submitedAt: string | null;
  deadlineAt: string | null;
  isRevised: boolean;
  topicTypeId: number | null;
  categoryTypeId: number | null;
  isDeadlineExpired?: boolean;
}

interface GradeNode {
  name: string;
  sequence: number;
  value: number | null;
  children?: GradeLeaf[];
}

function renderGrades(courseName: string, data: { finalGrade?: unknown; structure?: GradeNode[] }): string {
  const lines: string[] = [];
  lines.push(`# Grades — ${courseName}`);
  lines.push("");
  lines.push(`- **Final grade:** ${tableCell((data.finalGrade as { value?: unknown })?.value ?? "—")}`);
  lines.push("");

  for (const cat of data.structure ?? []) {
    lines.push(`## ${cat.name}`);
    lines.push("");
    if (!cat.children || cat.children.length === 0) {
      lines.push("(no evaluations)");
      lines.push("");
      continue;
    }
    lines.push("| Evaluation | Grade | Max | Submitted | Deadline | Revised |");
    lines.push("|---|---|---|---|---|---|");
    for (const leaf of cat.children) {
      lines.push(
        `| ${tableCell(leaf.name)} | ${tableCell(leaf.value ?? "—")} | ${tableCell(leaf.maxValue ?? "—")} | ${leaf.isSubmited ? (leaf.submitedAt ?? "yes") : "no"} | ${tableCell(leaf.deadlineAt ?? "—")} | ${leaf.isRevised ? "yes" : "no"} |`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

function renderAppointments(data: unknown): string {
  const items = Array.isArray(data) ? data : [];
  const lines: string[] = [];
  lines.push("# Calendar appointments");
  lines.push("");
  lines.push(`- **Count:** ${items.length}`);
  lines.push("");
  lines.push("| Title | Start | End | Course | Type | Completed |");
  lines.push("|---|---|---|---|---|---|");
  for (const a of items as Record<string, unknown>[]) {
    const am = Array.isArray(a.academicMain) ? (a.academicMain[0] as Record<string, unknown>) : null;
    lines.push(
      `| ${tableCell(a.title)} | ${tableCell(a.startAt)} | ${tableCell(a.endAt)} | ${tableCell(am?.academicMainTitle ?? "—")} | ${tableCell(a.entityType)} | ${a.isCompleted ? "yes" : "no"} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

function renderKeyValue(title: string, data: unknown): string {
  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(codeBlock(json(data)));
  lines.push("");
  return lines.join("\n");
}

async function main(): Promise<void> {
  const session = await createSession();
  try {
    const client = session.client;
    const outDir = resolveOut(config.outDir);
    ensureDir(outDir);

    const courses = await fetchCourses(client);

    // Grades per course
    for (const c of courses) {
      try {
        const g = await client.get<{ finalGrade?: unknown; structure?: GradeNode[] }>(
          `/v1/plataforma/grades/me/course/${c.id}`,
        );
        writeFileSync(
          path.join(outDir, `grades-${c.id}-${slugify(c.name)}.md`),
          renderGrades(c.name, g.data),
          "utf-8",
        );
      } catch (err) {
        logger.warn({ courseId: c.id, err }, "failed to fetch grades");
      }
    }

    const surface: Array<[string, string]> = [
      ["notices", "/v1/plataforma/academic/notices-board?perPage=50&page=1&orderBy=postedAt:desc"],
      ["achievements", "/v1/plataforma/academic/achievements?status=all&page=1&perPage=50&search=&achievementTypeId=2"],
      ["messages", "/v1/message/messages?directory=inbox&perPage=50"],
      ["message-categories", "/v1/plataforma/academic/messages/categories?withoutCategory=true&isToGetOnlyActual=true"],
      ["lti-tools", "/v1/plataforma/content/lti/tool/list-by-alias/student"],
      ["calendar-types", "/v1/plataforma/calendar/appointment/type"],
      ["communities", "/v1/plataforma/academic/courses/me?state=all&page=1&limit=20&sort=asc&sortBy=name&type=communities"],
    ];

    const raw: { grades: Record<string, unknown>; surfaces: Record<string, unknown> } = {
      grades: {},
      surfaces: {},
    };

    for (const [name, endpoint] of surface) {
      try {
        const r = await client.get<unknown>(endpoint);
        raw.surfaces[name] = r.data;
        writeFileSync(path.join(outDir, `${name}.md`), renderKeyValue(name, r.data), "utf-8");
      } catch (err) {
        logger.warn({ endpoint, err }, "failed to fetch surface");
      }
    }

    // Calendar appointments for the current 5-week window
    try {
      const now = new Date();
      const start = new Date(now.getTime() - 7 * 86400_000).toISOString().slice(0, 10);
      const end = new Date(now.getTime() + 35 * 86400_000).toISOString().slice(0, 10);
      const r = await client.get<unknown>(
        `/v1/plataforma/calendar/appointment?appointmentCategory=1,2,3,7,5,6&startDate=${start}&endDate=${end}`,
      );
      raw.surfaces["calendar-appointments"] = r.data;
      writeFileSync(path.join(outDir, "calendar.md"), renderAppointments(r.data), "utf-8");
    } catch (err) {
      logger.warn({ err }, "failed to fetch calendar");
    }

    for (const c of courses) {
      try {
        const g = await client.get<unknown>(`/v1/plataforma/grades/me/course/${c.id}`);
        raw.grades[c.name] = g.data;
      } catch {
        /* already logged */
      }
    }

    ensureDir(path.join(outDir, "raw"));
    writeFileSync(path.join(outDir, "raw", "surfaces.json"), json(raw), "utf-8");

    console.log(`\nSurfaces dumped → ${outDir}`);
  } finally {
    await closeSession(session);
  }
}

main().catch((err) => {
  logger.error({ err }, "surface dump failed");
  console.error(err);
  process.exit(1);
});
