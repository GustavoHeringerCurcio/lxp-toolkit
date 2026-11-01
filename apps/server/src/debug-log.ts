/**
 * Full-context diagnostics for drafts the quality gate considers bad or worse.
 *
 * When the four-level judgment is "bad" or "terrible", the whole generation
 * context is captured — activity, project, prompt, completion, verdict — as
 * both a Postgres row (queryable) and a markdown file (readable by a human or
 * an agent). The goal is that "why did this happen?" is reproducible later.
 */
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assist } from "./paths.js";
import { insertDebugLog, pruneDebugLogs } from "./store.js";
import type { GateResult } from "./types.js";

/** How many recent diagnostics to keep (rows and markdown files). */
export const DEBUG_LOG_KEEP = 100;

export interface DebugActivity {
  title: string;
  kind: string;
  courseName: string;
  moduleTitle: string;
  instructionsText: string;
  files: string[];
}

export interface DebugProject {
  /** The student's project title (project_source). */
  title: string;
  enabled: boolean;
  /** Where the switch came from: "activity" | "module" | "off". */
  origin: string;
  /** False when the switch is on but project_source has no content. */
  configured: boolean;
}

export interface DebugGeneration {
  model: string;
  temperature: number;
  prompt: string;
  completion: string;
  promptHash: string;
  tokensIn: number | null;
  tokensOut: number | null;
}

export interface DebugLogBundle {
  contentItemId: number;
  answerAttemptId: number | null;
  reason: string;
  activity: DebugActivity;
  project: DebugProject | null;
  templateFields: string[];
  abilities: Record<string, boolean>;
  generation: DebugGeneration;
  gate: GateResult;
  createdAt: string;
}

/**
 * Why a draft should be logged: only the actionable levels. `ok` and `good`
 * never create a diagnostic file.
 */
export function gateLogReason(gate: GateResult): string | null {
  if (gate.verdict !== "bad" && gate.verdict !== "terrible") return null;
  return `julgamento ${gate.verdict}${gate.reason ? `: ${gate.reason}` : ""}`;
}

export function shouldLog(gate: GateResult): boolean {
  return gateLogReason(gate) !== null;
}

/** Human/agent-readable markdown for one bundle. */
export function renderDebugMarkdown(b: DebugLogBundle): string {
  const lines: string[] = [];
  lines.push(`# Diagnóstico — ${b.activity.title}`);
  lines.push("");
  lines.push(`- **Motivo:** ${b.reason}`);
  lines.push(`- **Item:** ${b.contentItemId}${b.answerAttemptId ? ` · tentativa ${b.answerAttemptId}` : ""}`);
  lines.push(`- **Quando:** ${b.createdAt}`);
  lines.push(`- **Atividade:** ${b.activity.kind} · ${b.activity.courseName} — ${b.activity.moduleTitle}`);
  lines.push(`- **Julgamento:** ${b.gate.verdict} · ${b.gate.reason || "(sem motivo)"}`);
  lines.push(`- **Modelo:** ${b.generation.model} · temperatura ${b.generation.temperature}`);
  if (b.project) {
    lines.push("");
    lines.push("## Projeto");
    lines.push(`- Projeto: ${b.project.title || "(sem titulo)"}`);
    lines.push(`- Origem: ${b.project.origin} · configurado: ${b.project.configured ? "sim" : "não"}`);
  } else {
    lines.push("");
    lines.push("## Projeto");
    lines.push("(nenhum contexto de projeto foi injetado)");
  }
  if (b.templateFields.length) {
    lines.push("");
    lines.push("## Campos do modelo");
    lines.push(b.templateFields.map((f) => `- ${f}`).join("\n"));
  }
  lines.push("");
  lines.push("## Habilidades ativas");
  lines.push(
    Object.entries(b.abilities)
      .map(([k, v]) => `- ${k}: ${v ? "ligada" : "desligada"}`)
      .join("\n") || "(nenhuma)",
  );
  lines.push("");
  lines.push("## Enunciado");
  lines.push(b.activity.instructionsText || "(vazio)");
  lines.push("");
  lines.push("## Prompt enviado");
  lines.push("```");
  lines.push(b.generation.prompt);
  lines.push("```");
  lines.push("");
  lines.push("## Resposta gerada");
  lines.push("```");
  lines.push(b.generation.completion);
  lines.push("```");
  lines.push("");
  return lines.join("\n");
}

/**
 * Persist a debug bundle (markdown file + Postgres row). Best-effort: a file or
 * DB failure never throws, so generation is never broken by diagnostics.
 */
export async function writeDebugLog(
  bundle: DebugLogBundle,
): Promise<{ id: number | null; file: string | null }> {
  const dir = assist("data", "debug");
  let file: string | null = null;
  try {
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    file = path.join(dir, `${stamp}-item-${bundle.contentItemId}.md`);
    writeFileSync(file, renderDebugMarkdown(bundle), "utf-8");
  } catch {
    file = null;
  }
  const id = await insertDebugLog({
    contentItemId: bundle.contentItemId,
    answerAttemptId: bundle.answerAttemptId,
    reason: bundle.reason,
    filePath: file,
    payload: bundle,
  }).catch(() => null);

  // Retention: keep only the newest DEBUG_LOG_KEEP rows, deleting the markdown
  // files that fall out of the window. Best-effort.
  try {
    const stale = await pruneDebugLogs(DEBUG_LOG_KEEP);
    for (const stalePath of stale) {
      if (stalePath) unlinkSync(stalePath);
    }
  } catch {
    /* retention is best-effort */
  }
  return { id, file };
}
