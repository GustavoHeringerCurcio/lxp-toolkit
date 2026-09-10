import OpenAI from "openai";
import type { AiConfig, Exercise } from "./types.js";
import { openaiKey } from "./config.js";
import { extractPdfText } from "./pdf.js";

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: openaiKey() });
  return _client;
}

/**
 * Compose the user message: a "request block" rendered from the exercise's
 * AiRequest (who the student is + how to write + extra context), followed by
 * the activity content itself.
 */
async function buildUserContent(
  cfg: AiConfig,
  e: Exercise,
  requestBlock: string,
  notes: string,
): Promise<string> {
  const parts: string[] = [];

  if (requestBlock.trim()) parts.push(`=== COMO VOCÊ DEVE ESCREVER ===\n${requestBlock}`);

  parts.push(`ATIVIDADE: ${e.title}`);
  parts.push(`TIPO: ${e.kind === "upload" ? "tarefa com envio de arquivo" : "questionário/quiz"}`);
  parts.push(`MÓDULO: ${e.moduleTitle}${e.sectionTitle ? ` — ${e.sectionTitle}` : ""}`);
  if (e.deadlineAt) parts.push(`PRAZO: ${e.deadlineAt}`);

  if (e.instructionsText) {
    parts.push(`\n=== ENUNCIADO / INSTRUÇÕES ===\n${e.instructionsText}`);
  }

  if (e.kind === "upload") {
    if (e.files.length) {
      parts.push(`\n=== ARQUIVOS ANEXADOS (${e.files.length}) ===`);
      for (const f of e.files) {
        parts.push(`\n--- Arquivo: ${f.name} ---`);
        const text = await extractPdfText(f.absPath);
        if (text) {
          const max = 30_000;
          parts.push(text.length > max ? text.slice(0, max) + "\n…[truncado]" : text);
        } else {
          parts.push("(PDF sem texto extraível — provavelmente imagem/escaneado; veja o arquivo).");
        }
      }
    }
    if (e.remoteFiles.length) {
      parts.push(`\nLinks dos arquivos no portal:\n${e.remoteFiles.map((r) => `- ${r.filename ?? r.url} (${r.url})`).join("\n")}`);
    }
  }

  if (e.kind === "quiz" && e.questions.length) {
    parts.push(`\n=== QUESTÕES ===`);
    for (const q of e.questions) {
      parts.push(`\nQ${q.id}: ${q.text}`);
      q.options.forEach((opt, i) => parts.push(`   ${String.fromCharCode(97 + i)}) ${opt}`));
    }
  }

  if (notes) {
    parts.push(`\n=== OBSERVAÇÕES DO ALUNO ===\n${notes}`);
  }

  const quiz = e.kind === "quiz";
  parts.push(
    `\n=== SOLICITAÇÃO ===\nElabore a resposta para essa ${quiz ? "lista de questões, indicando a alternativa correta de cada uma e justificando brevemente" : "atividade, seguindo exatamente o que o enunciado pede"}. Siga o estilo descrito em "COMO VOCÊ DEVE ESCREVER" acima — escreva como o próprio aluno, sem citar que é IA.`,
  );
  return parts.join("\n");
}

export interface GenerateOpts {
  onDelta?: (text: string) => void;
}

/** Generate an answer for an exercise using the configured model + a rendered request block. */
export async function generateAnswer(
  cfg: AiConfig,
  e: Exercise,
  requestBlock: string,
  opts: GenerateOpts = {},
  notes = "",
): Promise<string> {
  const system = cfg.system_prompt.replaceAll("{language}", cfg.language);
  const user = await buildUserContent(cfg, e, requestBlock, notes);

  const stream = await client().chat.completions.create({
    model: cfg.model,
    temperature: cfg.temperature,
    max_tokens: cfg.max_output_tokens ?? 2200,
    stream: true,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  let full = "";
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) {
      full += delta;
      opts.onDelta?.(delta);
    }
  }
  return full;
}
