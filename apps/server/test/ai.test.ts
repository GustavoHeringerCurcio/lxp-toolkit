import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { generateAnswer } from "../src/ai.js";
import { makeExercise } from "./helpers.js";

const FAKE_KEY = "sk-test-fake-key-0000";

const STYLE = {
  persona: "Você é o aluno.",
  voice: "Simples.",
  includeIdentity: true,
  mcqMode: "letter",
  numbering: true,
  associateInline: true,
  noIntroOutro: true,
  noMetaLabels: true,
  extraRules: "",
} as const;

const SECTIONS = { enunciado: true, arquivos: false, questoes: false, observacoes: false } as const;

const MODELS = {
  generation: "gpt-4o",
  detection: "gpt-5-nano",
  classification: "gpt-5-nano",
  diagram: "gpt-4o",
  gate: "gpt-5-nano",
  training: "gpt-4o",
} as const;

const CFG = {
  provider: "openai",
  model: "gpt-4o",
  models: MODELS,
  temperature: 0.7,
  style: STYLE,
  activitySections: SECTIONS,
  abilities: {},
} as const;

const PROFILE = { nome: "Maria", matricula: "2024001" };

type Handler = (req: IncomingMessage, res: ServerResponse, body: string) => void;

let server: Server;
let baseUrl = "";
let handler: Handler = () => {};
const requests: { auth?: string; path?: string; body?: string }[] = [];

function sseChunks(deltas: string[]): string {
  const events = deltas.map((content) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
  events.push("data: [DONE]\n\n");
  return events.join("");
}

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c: Buffer) => (raw += c.toString()));
    req.on("end", () => {
      requests.push({ auth: req.headers.authorization, path: req.url, body: raw });
      handler(req, res, raw);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (typeof addr !== "object" || !addr) throw new Error("sem porta para o mock");
  baseUrl = `http://127.0.0.1:${addr.port}/v1`;
  process.env.OPENAI_BASE_URL = baseUrl;
  process.env.OPENAI_API_KEY = FAKE_KEY;
});

afterAll(async () => {
  delete process.env.OPENAI_BASE_URL;
  if (process.env.OPENAI_API_KEY === FAKE_KEY) delete process.env.OPENAI_API_KEY;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

afterEach(() => {
  handler = () => {};
  requests.length = 0;
});

function defaultSseHandler(deltas: string[] = ["Olá", " mundo"]): void {
  handler = (_req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(sseChunks(deltas));
  };
}

describe("generateAnswer (mock HTTP da OpenAI)", () => {
  it("envia Authorization com a chave do processo e payload em stream", async () => {
    defaultSseHandler();
    await generateAnswer(CFG, makeExercise(), "", PROFILE);
    const req = requests[0];
    expect(req.auth).toBe(`Bearer ${FAKE_KEY}`);
    expect(req.path).toBe("/v1/chat/completions");
    const payload = JSON.parse(req.body ?? "{}");
    expect(payload.model).toBe("gpt-4o");
    expect(payload.stream).toBe(true);
    expect(payload.stream_options).toEqual({ include_usage: true });
    expect(payload.messages.some((m: { role: string }) => m.role === "system")).toBe(true);
    expect(payload.messages.some((m: { role: string }) => m.role === "user")).toBe(true);
  });

  it("concatena os deltas do stream e devolve o texto + proveniência", async () => {
    defaultSseHandler(["Olá", " mundo"]);
    const deltas: string[] = [];
    const result = await generateAnswer(CFG, makeExercise(), "", PROFILE, { onDelta: (d) => deltas.push(d) });
    expect(deltas).toEqual(["Olá", " mundo"]);
    expect(result.text).toBe("Olá mundo");
    expect(result.model).toBe("gpt-4o");
    expect(result.promptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.prompt).toContain("[system]");
  });

  it("propaga 401 da OpenAI com a mensagem de chave inválida", async () => {
    handler = (_req, res) =>
      json(res, 401, {
        error: { message: "Incorrect API key provided: sk-proj-***xFAA.", type: "invalid_request_error" },
      });
    await expect(generateAnswer(CFG, makeExercise(), "", PROFILE)).rejects.toThrow(
      /Incorrect API key provided/,
    );
  });

  it("propaga erro 500 da OpenAI", async () => {
    handler = (_req, res) => json(res, 500, { error: { message: "The server had an error." } });
    await expect(generateAnswer(CFG, makeExercise(), "", PROFILE)).rejects.toThrow(/500/);
  });
});
