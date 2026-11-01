import { mkdtempSync, readFileSync, readdirSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pruneAiLogs, writeAiLog, type AiLogRecord } from "../src/ai-log.js";

function record(patch: Partial<AiLogRecord> = {}): AiLogRecord {
  return {
    schema: 1,
    createdAt: "2026-11-01T19:45:23.059Z",
    app: { version: "0.1.0", commit: "abc" },
    contentItemId: 89612062,
    answerAttemptId: 44,
    promptHash: "hash",
    activity: { title: "BDI - Atividade 07", files: [{ name: "a.pdf", attached: true }] },
    config: { readAttachments: true, apiKey: "should-not-leak" },
    project: null,
    template: { wantsTemplate: false, fields: [] },
    attachments: { requested: true, used: true, files: [{ name: "a.pdf", attached: true }] },
    prompt: "[user]\narquivo",
    output: { model: "gpt-4o", completion: "resposta" },
    gate: { verdict: "terrible", reason: "não contém as tabelas", model: "gpt-5-nano" },
    gateDebug: { raw: "{\"verdict\":\"terrible\"}" },
    errors: [],
    ...patch,
  };
}

describe("writeAiLog", () => {
  it("appends JSONL and writes the latest per-item snapshot", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "lxp-ai-log-"));
    const out = writeAiLog(record(), { dir });
    expect(out.file).toBe(path.join(dir, "2026-11-01.jsonl"));
    expect(out.latest).toBe(path.join(dir, "latest", "item-89612062.json"));

    const lines = readFileSync(out.file, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]) as AiLogRecord;
    expect(parsed.gate?.verdict).toBe("terrible");
    expect(parsed.output.completion).toBe("resposta");

    const latest = JSON.parse(readFileSync(out.latest, "utf-8")) as AiLogRecord;
    expect(latest.contentItemId).toBe(89612062);
  });

  it("redacts API keys and base64 payloads", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "lxp-ai-log-"));
    const out = writeAiLog(
      record({
        config: { readAttachments: true, apiKey: "sk-secret" },
        attachments: { requested: true, used: true, file_data: "data:application/pdf;base64,AAAA" },
      }),
      { dir },
    );
    const raw = readFileSync(out.file, "utf-8");
    expect(raw).not.toContain("sk-secret");
    expect(raw).not.toContain("base64,AAAA");
    expect(raw).toContain("[redacted]");
    expect(raw).toContain("[base64 removed]");
  });

  it("prunes daily files older than the retention window", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "lxp-ai-log-"));
    const old = path.join(dir, "2026-01-01.jsonl");
    writeFileSync(old, "{}\n");
    const past = (Date.now() - 60 * 24 * 60 * 60 * 1000) / 1000;
    utimesSync(old, past, past);
    expect(pruneAiLogs(dir, 30)).toContain(old);
    expect(statSync(dir).isDirectory()).toBe(true);
    expect(readdirSync(dir)).not.toContain("2026-01-01.jsonl");
  });
});
