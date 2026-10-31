import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  initRefreshLog,
  listRefreshRuns,
  listSchedulerDays,
  pruneRefreshLogs,
  readRefreshRun,
  readRefreshStatus,
  readSchedulerLog,
  recordRunFinish,
  recordRunStart,
  recordSchedulerDecision,
  redactLog,
  refreshLogDir,
  refreshRunFileName,
  type RefreshLogConfig,
} from "../src/refresh-log.js";

const config: RefreshLogConfig = {
  enabled: true,
  slots: ["11:00"],
  timezone: "America/Sao_Paulo",
  quietHours: { start: "22:00", end: "10:30" },
};

let dir = "";
const previous = process.env.REFRESH_LOG_DIR;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "lxp-refresh-log-"));
  process.env.REFRESH_LOG_DIR = dir;
});

afterEach(() => {
  if (previous === undefined) delete process.env.REFRESH_LOG_DIR;
  else process.env.REFRESH_LOG_DIR = previous;
  rmSync(dir, { recursive: true, force: true });
});

describe("refresh JSON logs", () => {
  it("inicializa status.json e o log diário do agendador", async () => {
    await initRefreshLog({
      config,
      lastSuccessAt: "2026-10-30T23:37:00.865Z",
      at: "2026-10-31T00:00:00.000Z",
    });

    expect(refreshLogDir()).toBe(dir);
    const status = readRefreshStatus();
    expect(status?.timezone).toBe("America/Sao_Paulo");
    expect(status?.autoRefresh).toBe(true);
    expect(status?.slots).toEqual(["11:00"]);
    expect(status?.lastSuccessAt).toBe("2026-10-30T23:37:00.865Z");

    const day = readSchedulerLog("2026-10-30");
    expect(day?.events).toHaveLength(1);
    expect(day?.events[0].type).toBe("app-start");
  });

  it("grava um arquivo por execução com início e fim", async () => {
    await initRefreshLog({ config, lastSuccessAt: null, at: "2026-10-31T00:00:00.000Z" });
    const startedAt = "2026-10-31T00:37:39.091Z";
    const file = refreshRunFileName("manual", startedAt, config.timezone);
    expect(file).toBe("2026-10-30_21-37-39-091_manual.json");

    await recordRunStart({ source: "manual", startedAt, config });
    expect(readRefreshRun(file)?.status).toBe("running");
    expect(readRefreshStatus()?.lastRun?.status).toBe("running");

    await recordRunFinish({
      source: "manual",
      startedAt,
      finishedAt: "2026-10-31T00:42:45.728Z",
      status: "ok",
      step: "Concluído",
      error: null,
      warning: null,
      log: "dump concluído",
      config,
    });

    const log = readRefreshRun(file);
    expect(log?.status).toBe("ok");
    expect(log?.durationMs).toBe(306637);
    expect(log?.localStartedAt).toBe("2026-10-30 21:37:39");
    expect(log?.logExcerpt).toBe("dump concluído");
    expect(readRefreshStatus()?.lastSuccessAt).toBe("2026-10-31T00:42:45.728Z");
    expect(listRefreshRuns()).toHaveLength(1);
  });

  it("redige segredos antes de gravar o trecho do log", async () => {
    await initRefreshLog({ config, lastSuccessAt: null, at: "2026-10-31T00:00:00.000Z" });
    const startedAt = "2026-10-31T00:37:39.091Z";
    await recordRunStart({ source: "boot", startedAt, config });
    await recordRunFinish({
      source: "boot",
      startedAt,
      finishedAt: "2026-10-31T00:38:00.000Z",
      status: "failed",
      step: "Falhou",
      error: null,
      warning: null,
      log: [
        "Cookie: session=abc",
        "Authorization: Bearer xyz",
        "OPENAI_API_KEY=sk-test1234567890",
        '{"token":"plain-secret"}',
      ].join("\n"),
      config,
    });

    const file = refreshRunFileName("boot", startedAt, config.timezone);
    const log = readRefreshRun(file);
    expect(log?.logExcerpt).not.toContain("abc");
    expect(log?.logExcerpt).not.toContain("xyz");
    expect(log?.logExcerpt).not.toContain("sk-test");
    expect(log?.logExcerpt).not.toContain("plain-secret");
    expect(log?.logExcerpt).toContain("[redacted]");
  });

  it("registra decisões do agendador no arquivo do dia", async () => {
    await initRefreshLog({ config, lastSuccessAt: null, at: "2026-10-31T00:00:00.000Z" });
    await recordSchedulerDecision({
      at: "2026-10-31T00:43:00.000Z",
      decision: "conteúdo já atualizado hoje",
      config,
    });

    const day = readSchedulerLog("2026-10-30");
    expect(day?.events.map((e) => e.type)).toEqual(["app-start", "scheduler"]);
    expect(day?.events[1].decision).toBe("conteúdo já atualizado hoje");
    expect(readRefreshStatus()?.lastDecision).toBe("conteúdo já atualizado hoje");
    expect(listSchedulerDays()).toContain("2026-10-30");
  });

  it("rejeita caminhos e datas inválidas", async () => {
    expect(readRefreshRun("../status.json")).toBeNull();
    expect(readRefreshRun("foo.json")).toBeNull();
    expect(readSchedulerLog("../../etc/passwd")).toBeNull();
    expect(readSchedulerLog("2026-13-99")).toBeNull();
  });

  it("remove logs mais antigos que a retenção", async () => {
    await initRefreshLog({ config, lastSuccessAt: null, at: "2026-10-31T00:00:00.000Z" });
    const startedAt = "2026-10-31T00:37:39.091Z";
    await recordRunStart({ source: "manual", startedAt, config });
    const file = refreshRunFileName("manual", startedAt, config.timezone);
    const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    utimesSync(path.join(dir, "runs", file), old, old);

    expect(pruneRefreshLogs(90)).toBe(1);
    expect(readRefreshRun(file)).toBeNull();
    expect(readdirSync(path.join(dir, "runs"))).toHaveLength(0);
    // status.json is never pruned.
    expect(readFileSync(path.join(dir, "status.json"), "utf-8")).toContain("lastRun");
  });

  it("redige padrões de segredo isoladamente", () => {
    const text = redactLog(
      "LXP_PASSWORD=secret1\nAuthorization: Bearer secret2\nCookie: a=secret3\nsk-abcdefghijklmno",
    );
    expect(text).not.toContain("secret1");
    expect(text).not.toContain("secret2");
    expect(text).not.toContain("secret3");
    expect(text).not.toContain("sk-abcdefghijklmno");
  });
});
