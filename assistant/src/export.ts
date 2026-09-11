import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { assist } from "./paths.js";
import { kindLabel } from "./kind.js";
import type { Exercise } from "./types.js";

/** Write the AI answer for an exercise to assistant/out/{id}-{slug}.{ext}. */
export function exportAnswer(
  e: Exercise,
  answer: string,
): { md: string; txt: string } {
  const slug = e.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "exercise";
  const base = `${e.id}-${slug}`;

  const meta = [
    `# ${e.title}`,
    ``,
    `- Tipo: ${kindLabel(e.kind)}`,
    `- Módulo: ${e.moduleTitle}${e.sectionTitle ? ` — ${e.sectionTitle}` : ""}`,
    e.deadlineAt ? `- Prazo: ${e.deadlineAt}` : "",
    ``,
  ]
    .filter((l) => l !== undefined)
    .join("\n");

  const md = `${meta}\n${answer.trim()}\n`;
  mkdirSync(assist("out"), { recursive: true });

  const mdPath = path.join(assist("out"), `${base}.md`);
  writeFileSync(mdPath, md, "utf-8");

  const plain = `${e.title}\n${"=".repeat(e.title.length)}\n\n${answer.trim()}\n`;
  const txtPath = path.join(assist("out"), `${base}.txt`);
  writeFileSync(txtPath, plain, "utf-8");

  return { md: mdPath, txt: txtPath };
}
