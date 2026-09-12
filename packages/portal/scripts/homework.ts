import { readFileSync } from "node:fs";
import path from "node:path";
import { config, logger } from "../src/config.js";
import { resolveOut } from "../src/util.js";

interface HwItem {
  courseId: number;
  courseName: string;
  moduleId: number;
  moduleTitle: string;
  sectionId: number | null;
  sectionTitle: string | null;
  itemId: number;
  itemTitle: string;
  kind: string;
  deadlineAt: string | null;
  daysLeft: number | null;
  expired: boolean;
  files: { name: string; relPath: string }[];
  siblings: { itemId: number; itemTitle: string; kind: string; done: boolean }[];
}

interface Index {
  nextUp: HwItem | null;
  courses: { courseId: number; courseName: string; modules: { moduleId: number; moduleTitle: string; sections: { sectionId: number | null; sectionTitle: string | null; items: { itemId: number; itemTitle: string; kind: string; done: boolean; deadlineAt: string | null; expired: boolean; localFiles: { name: string; relPath: string }[] }[] }[] }[] }[];
  homework: HwItem[];
  stats: { courses: number; items: number; homeworkOpen: number; homeworkExpired: number };
}

const KIND_ICON: Record<string, string> = {
  file_upload: "📤",
  quiz: "❓",
  reading: "📖",
  pdf: "📄",
  link: "🔗",
  forum: "💬",
  other: "📎",
};
const KIND_LABEL: Record<string, string> = {
  file_upload: "Upload",
  quiz: "Quiz",
  reading: "Reading",
  pdf: "PDF",
  link: "Link",
  forum: "Forum",
  other: "Content",
};

const useColor = process.stdout.isTTY === true;

const c = {
  red: (s: string) => (useColor ? `\x1b[31m${s}\x1b[0m` : s),
  green: (s: string) => (useColor ? `\x1b[32m${s}\x1b[0m` : s),
  yellow: (s: string) => (useColor ? `\x1b[33m${s}\x1b[0m` : s),
  cyan: (s: string) => (useColor ? `\x1b[36m${s}\x1b[0m` : s),
  dim: (s: string) => (useColor ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s: string) => (useColor ? `\x1b[1m${s}\x1b[0m` : s),
};

function kindMark(item: { kind: string; done: boolean }): string {
  const icon = item.done ? c.green("✔") : c.dim("◌");
  return `${icon} ${KIND_ICON[item.kind] ?? "·"} `;
}

function badge(h: HwItem): string {
  if (h.kind === "quiz") return c.yellow("OPEN QUIZ");
  if (h.expired) return c.red("EXPIRED");
  if (h.daysLeft == null) return c.dim("no deadline");
  if (h.daysLeft <= 1) return c.red(`DUE IN ${h.daysLeft}d`);
  if (h.daysLeft <= 4) return c.yellow(`DUE IN ${h.daysLeft}d`);
  return c.green(`DUE IN ${h.daysLeft}d`);
}

function deadlineText(h: HwItem): string {
  return h.deadlineAt ? ` (${h.deadlineAt.slice(0, 16)})` : "";
}

function usage(): void {
  console.log(`Homeworks dashboard

Usage:
  npm run homework          Show grouped homework board (reads scraped/raw/homework-index.json)
  npm run homework -- --fresh   Rebuild the index first, then show
  npm run homework -- --json    Output raw homework JSON
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) return usage();

  const fresh = args.includes("--fresh");
  if (fresh) {
    const { spawnSync } = await import("node:child_process");
    const r = spawnSync("npx", ["tsx", "scripts/build-homework-index.ts"], { stdio: "inherit", cwd: process.cwd() });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }

  const idx = JSON.parse(
    readFileSync(path.join(resolveOut(config.outDir, "raw"), "homework-index.json"), "utf-8"),
  ) as Index;

  if (args.includes("--json")) {
    console.log(JSON.stringify(idx.homework, null, 2));
    return;
  }

  // ---- header ----
  console.log("");
  console.log(c.bold(`🎓  ${idx.courses.map((x) => x.courseName).join(" · ")}`));
  console.log(c.dim(`    ${idx.stats.homeworkOpen} open · ${idx.stats.homeworkExpired} expired homework`));
  if (idx.nextUp) {
    console.log(
      `\n${c.bold("🎯 Next up:")} ${idx.nextUp.itemTitle} ${c.dim(`(${idx.nextUp.moduleTitle})`)} — ${badge(idx.nextUp)}${deadlineText(idx.nextUp)}`,
    );
  }
  console.log("");

  // ---- grouped board ----
  for (const course of idx.courses) {
    for (const mod of course.modules) {
      const sectionHasOpen = mod.sections.some((s) => s.items.some((i) => (i.kind === "file_upload" || i.kind === "quiz") && !i.done && !i.expired));
      if (!sectionHasOpen) continue;

      console.log(c.bold(`\n📦 ${mod.moduleTitle}`));
      for (const sec of mod.sections) {
        const openHw = sec.items.filter(
          (i) => (i.kind === "file_upload" || i.kind === "quiz") && !i.done && !i.expired,
        );
        const expiredHere = sec.items.filter((i) => (i.kind === "file_upload" || i.kind === "quiz") && i.expired);
        if (openHw.length === 0) continue;
        console.log(`   ${c.cyan(sec.sectionTitle ?? "(top-level)")}`);

        // supporting content in the same section (readings etc.) shown dimmed
        const supporting = sec.items.filter((i) => !(i.kind === "file_upload" || i.kind === "quiz"));
        const supportingLine = supporting.length
          ? supporting.map((s) => `${s.done ? "✔" : "·"} ${KIND_LABEL[s.kind]}`).join("  ")
          : "";

        for (const item of openHw) {
          const h = idx.homework.find((x) => x.itemId === item.itemId);
          console.log(`     ${kindMark(item)} ${item.itemTitle}`);
          if (h) {
            console.log(`         ${c.dim("status:")} ${badge(h)}${deadlineText(h)}`);
            if (h.files.length) {
              console.log(`         ${c.dim("files:")}`);
              for (const f of h.files) console.log(`           - ${f.relPath}`);
            }
          }
        }
        if (expiredHere.length) {
          console.log(`         ${c.dim(`(+ ${expiredHere.length} expired in this section)`)}`);
        }
        if (supportingLine) console.log(`         ${c.dim("with: " + supportingLine)}`);
      }
    }
  }

  // ---- full open list (one-line summary) ----
  const open = idx.homework.filter((h) => !h.expired);
  console.log(`\n${c.bold("📋 Open homework (" + open.length + ")")}`);
  for (const h of open) {
    console.log(`   ${kindMark({ kind: h.kind, done: false })} ${h.itemTitle}  ${c.dim("· " + (h.moduleTitle ?? ""))}  ${badge(h)}`);
  }

  const expired = idx.homework.filter((h) => h.expired);
  if (expired.length) {
    console.log(`\n${c.bold("🧊 Expired (" + expired.length + ")")} — ${c.dim("not shown in detail; add --json to list")}`);
  }
  console.log("");
}

main().catch((err) => {
  logger.error({ err }, "homework failed");
  console.error(err);
  process.exit(1);
});
