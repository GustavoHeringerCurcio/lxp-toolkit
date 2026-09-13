import type { AiConfig, UploadFlavor } from "./types.js";
import { cheapJsonCompletion } from "./ai.js";
import { stripHtml } from "./build.js";

/** Result of the lazy AI flavor review. */
export interface FlavorClassification {
  flavor: UploadFlavor;
  reason: string;
  model: string;
}

const FLAVORS: UploadFlavor[] = ["question", "ghost", "print"];

/**
 * Parse the classifier's JSON reply. Returns null for anything that isn't a
 * valid `{ flavor, reason }` payload, so the caller keeps the heuristic value.
 */
export function parseFlavorClassification(
  text: string,
): { flavor: UploadFlavor; reason: string } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const o = parsed as Record<string, unknown>;
  const flavor = typeof o.flavor === "string" ? o.flavor.trim().toLowerCase() : "";
  if (!FLAVORS.includes(flavor as UploadFlavor)) return null;
  const reason = typeof o.reason === "string" ? o.reason.trim().slice(0, 300) : "";
  return { flavor: flavor as UploadFlavor, reason };
}

const SYSTEM =
  'Você classifica uma atividade acadêmica (tarefa com envio de arquivo) em exatamente um tipo:\n' +
  '- "question": há algo concreto a responder, elaborar, preencher ou resolver, mesmo que seja uma tarefa prática.\n' +
  '- "ghost": é apenas informativa (roteiro, agenda, cronograma, aviso, material de apoio) e NÃO pede nenhuma resposta do aluno.\n' +
  '- "print": pede explicitamente print, captura de tela ou foto como entrega.\n' +
  'Responda SOMENTE com JSON no formato {"flavor":"question|ghost|print","reason":"<motivo curto em português>"}.';

/**
 * One cheap JSON completion that decides the task's real flavor. Best-effort:
 * returns null on any failure so the caller keeps the deterministic heuristic.
 */
export async function classifyFlavor(
  cfg: AiConfig,
  input: { title: string; instructionsText: string; attachments: string[] },
): Promise<FlavorClassification | null> {
  const instructions = stripHtml(input.instructionsText).slice(0, 4000);
  const attachments = input.attachments.filter(Boolean).slice(0, 12);
  const user = [
    `Título: ${input.title}`,
    attachments.length ? `Anexos: ${attachments.join(", ")}` : "",
    `Enunciado:\n${instructions || "(vazio)"}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const { text, model } = await cheapJsonCompletion(cfg, SYSTEM, user, 300);
    const parsed = parseFlavorClassification(text);
    return parsed ? { ...parsed, model } : null;
  } catch {
    return null;
  }
}
