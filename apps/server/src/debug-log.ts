/**
 * Full-context diagnostics for drafts the quality gate is not confident about.
 *
 * When a generated draft is not ready to send (completeness <= 90, a failed
 * rubric check, or a non-"ready" verdict), the whole generation context is
 * captured — activity, detected project, prompt, completion, gate result — as
 * both a Postgres row (queryable) and a markdown file (readable by a human or
 * an agent). The goal is that "why did this happen?" is reproducible later.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assist } from "./paths.js";
import { insertDebugLog } from "./store.js";
import type { GateResult } from "./types.js";

export interface DebugActivity {
  title: string;
  kind: string;
  courseName: string;
  moduleTitle: string;
  instructionsText: string;
  files: string[];
}

export interface DebugProject {
  theme: string;
  atores: string[];
  requisitos: string[];
  /** Where the injected profile came from: "main" | "activity". */
  origin: string | null;
  confidence: number | null;
  source: string | null;
  model: string | null;
  intent: string | null;
  reason: string | null;
  needsProject: boolean;
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

/** Why a draft should be logged, or null when it is ready to send. */
export function gateLogReason(gate: GateResult): string | null {
  const failed = (gate.checks ?? []).filter((c) => !c.ok).map((c) => c.code);
  const parts: string[] = [];
  if (gate.completenessScore <= 90) parts.push(`completude ${gate.completenessScore}% <= 90`);
  if (gate.verdict !== "ready") parts.push(`veredito "${gate.verdict}"`);
  if (failed.length) parts.push(`verificações falhas: ${failed.join(", ")}`);
  return parts.length ? parts.join("; ") : null;
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
  lines.push(
    `- **Gate:** score ${b.gate.score} · veredito ${b.gate.verdict} · completude ${b.gate.completenessScore}% · aderência ${b.gate.relevanceScore}% · humanidade ${b.gate.humanScore}%`,
  );
  lines.push(`- **Modelo:** ${b.generation.model} · temperatura ${b.generation.temperature}`);
  if (b.project) {
    lines.push("");
    lines.push("## Projeto detectado");
    lines.push(`- Tema: ${b.project.theme || "(vazio)"}`);
    lines.push(`- Origem: ${b.project.origin ?? "—"} · fonte: ${b.project.source ?? "—"} · confiança: ${b.project.confidence ?? "—"} · modelo: ${b.project.model ?? "—"}`);
    lines.push(`- Atores: ${b.project.atores.join(", ") || "(vazio)"}`);
    lines.push(`- Requisitos: ${b.project.requisitos.join("; ") || "(vazio)"}`);
    if (b.project.intent) lines.push(`- Intenção detectada: ${b.project.intent}`);
    if (b.project.reason) lines.push(`- Justificativa: ${b.project.reason}`);
  } else {
    lines.push("");
    lines.push("## Projeto detectado");
    lines.push("(nenhum contexto de projeto foi injetado)");
  }
  lines.push("");
  lines.push("## Verificações do modelo");
  if (b.gate.checks.length) {
    for (const c of b.gate.checks) lines.push(`- ${c.ok ? "OK" : "FALHOU"} — ${c.label}${c.ok ? "" : `: ${c.detail}`}`);
  } else {
    lines.push("(nenhuma verificação aplicável)");
  }
  if (b.gate.issues.length) {
    lines.push("");
    lines.push("## Pontos de atenção");
    for (const i of b.gate.issues) lines.push(`- ${i}`);
  }
  if (b.gate.suggestions.length) {
    lines.push("");
    lines.push("## Sugestões");
    for (const s of b.gate.suggestions) lines.push(`- ${s}`);
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
  return { id, file };
}
