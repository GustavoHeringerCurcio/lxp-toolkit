import { describe, expect, it, vi } from "vitest";
import type { RefreshController, RefreshSource, RefreshState } from "../src/refresh.js";
import {
  createRefreshScheduler,
  formatClock,
  isQuiet,
  loadRefreshSchedulerConfig,
  localParts,
  parseClock,
  satisfiedSlots,
  type RefreshScheduleConfig,
  type RefreshStateLike,
} from "../src/refresh-scheduler.js";

const HOUR = 60;
const DAY = 24 * HOUR;

function makeConfig(overrides: Partial<RefreshScheduleConfig> = {}): RefreshScheduleConfig {
  return {
    enabled: true,
    slots: [11 * HOUR],
    slotLabels: ["11:00"],
    timezone: "UTC",
    bootDelayMs: 0,
    quietStart: 22 * HOUR,
    quietEnd: 10 * HOUR + 30,
    quietStartLabel: "22:00",
    quietEndLabel: "10:30",
    retryMs: HOUR * 60_000,
    maxAttemptsPerDay: 3,
    tickMs: 60_000,
    ...overrides,
  };
}

function makeController(running = false) {
  const calls: RefreshSource[] = [];
  const controller = {
    status: () => ({ running }) as RefreshState,
    start: (source: RefreshSource = "manual") => {
      calls.push(source);
      return true;
    },
  };
  return { controller: controller as Pick<RefreshController, "start" | "status">, calls };
}

function makeScheduler(options: {
  now: string;
  recent?: { status: string; finishedAt: string }[];
  config?: Partial<RefreshScheduleConfig>;
  running?: boolean;
}) {
  const { controller, calls } = makeController(options.running ?? false);
  const state: RefreshStateLike = { recent: options.recent ?? [] };
  const scheduler = createRefreshScheduler({
    controller,
    loadState: async () => state,
    config: makeConfig(options.config),
    now: () => new Date(options.now),
    log: () => {},
  });
  return { scheduler, calls };
}

describe("refresh scheduler helpers", () => {
  it("parseia e formata horários", () => {
    expect(parseClock("11:00")).toBe(11 * HOUR);
    expect(parseClock("23:59")).toBe(23 * HOUR + 59);
    expect(parseClock("24:00")).toBeNull();
    expect(parseClock("11:60")).toBeNull();
    expect(parseClock("onze")).toBeNull();
    expect(formatClock(11 * HOUR)).toBe("11:00");
  });

  it("lê data/hora no fuso configurado sem depender do TZ do SO", () => {
    const parts = localParts(new Date("2026-10-30T14:00:00Z"), "America/Sao_Paulo");
    expect(parts.dateKey).toBe("2026-10-30");
    expect(parts.minutes).toBe(11 * HOUR);
  });

  it("detecta a janela de silêncio mesmo cruzando a meia-noite", () => {
    const at = (iso: string) => localParts(new Date(iso), "UTC");
    const start = 22 * HOUR;
    const end = 10 * HOUR + 30;
    expect(isQuiet(at("2026-10-30T23:00:00Z"), start, end)).toBe(true);
    expect(isQuiet(at("2026-10-30T02:00:00Z"), start, end)).toBe(true);
    expect(isQuiet(at("2026-10-30T10:30:00Z"), start, end)).toBe(false);
    expect(isQuiet(at("2026-10-30T12:00:00Z"), start, end)).toBe(false);
    expect(isQuiet(at("2026-10-30T12:00:00Z"), null, null)).toBe(false);
  });

  it("um sucesso antes do primeiro horário satisfaz o primeiro slot", () => {
    const satisfied = satisfiedSlots(
      [11 * HOUR, 18 * HOUR],
      ["2026-10-30T10:32:00Z"],
      "UTC",
      "2026-10-30",
    );
    expect([...satisfied]).toEqual([0]);
  });

  it("um sucesso depois de um slot satisfaz todos os slots anteriores", () => {
    const satisfied = satisfiedSlots(
      [11 * HOUR, 18 * HOUR],
      ["2026-10-30T19:00:00Z"],
      "UTC",
      "2026-10-30",
    );
    expect([...satisfied].sort()).toEqual([0, 1]);
  });

  it("ignora sucessos de outro dia", () => {
    const satisfied = satisfiedSlots(
      [11 * HOUR],
      ["2026-10-29T11:05:00Z"],
      "UTC",
      "2026-10-30",
    );
    expect([...satisfied]).toEqual([]);
  });

  it("lê a configuração com defaults seguros e aceita dois horários", () => {
    const cfg = loadRefreshSchedulerConfig(
      { AUTO_REFRESH: "1", REFRESH_AT: "11:00,18:00" },
      () => {},
    );
    expect(cfg.enabled).toBe(true);
    expect(cfg.slotLabels).toEqual(["11:00", "18:00"]);
    expect(cfg.timezone).toBe("America/Sao_Paulo");
    expect(cfg.quietStart).toBe(22 * HOUR);
    expect(cfg.quietEnd).toBe(10 * HOUR + 30);

    const off = loadRefreshSchedulerConfig({}, () => {});
    expect(off.enabled).toBe(false);

    const noQuiet = loadRefreshSchedulerConfig(
      { REFRESH_QUIET_START: "", REFRESH_QUIET_END: "" },
      () => {},
    );
    expect(noQuiet.quietStart).toBeNull();
    expect(noQuiet.quietEnd).toBeNull();
  });

  it("normaliza e ordena a lista de horários", () => {
    const cfg = loadRefreshSchedulerConfig(
      { REFRESH_AT: "18:00, 11:00,11:00" },
      () => {},
    );
    expect(cfg.slotLabels).toEqual(["11:00", "18:00"]);
  });

  it("cai para São Paulo quando o fuso é inválido", () => {
    const warnings: string[] = [];
    const cfg = loadRefreshSchedulerConfig({ REFRESH_TZ: "Not/AZone" }, (message) =>
      warnings.push(message),
    );
    expect(cfg.timezone).toBe("America/Sao_Paulo");
    expect(warnings.some((message) => /REFRESH_TZ/.test(message))).toBe(true);
  });
});

describe("createRefreshScheduler", () => {
  it("faz o catch-up antes do primeiro horário quando ainda não houve sucesso hoje", async () => {
    const { scheduler, calls } = makeScheduler({ now: "2026-10-30T10:32:00Z" });

    await scheduler.tick();

    expect(calls).toEqual(["boot"]);
    expect(scheduler.status().lastDecision).toMatch(/início do dia/);
  });

  it("não repete quando o conteúdo já foi atualizado hoje", async () => {
    const { scheduler, calls } = makeScheduler({
      now: "2026-10-30T11:00:00Z",
      recent: [{ status: "ok", finishedAt: "2026-10-30T10:32:00Z" }],
    });

    await scheduler.tick();

    expect(calls).toEqual([]);
    expect(scheduler.status().lastDecision).toMatch(/já atualizado hoje/);
  });

  it("roda no horário agendado quando o último sucesso foi ontem", async () => {
    const { scheduler, calls } = makeScheduler({
      now: "2026-10-30T11:00:00Z",
      recent: [{ status: "ok", finishedAt: "2026-10-29T11:05:00Z" }],
    });

    await scheduler.tick();

    expect(calls).toEqual(["boot"]);
  });

  it("fica em silêncio no horário configurado", async () => {
    const { scheduler, calls } = makeScheduler({ now: "2026-10-30T07:30:00Z" });

    await scheduler.tick();

    expect(calls).toEqual([]);
    expect(scheduler.status().lastDecision).toMatch(/silêncio/);
  });

  it("espera o backoff depois de uma falha e tenta de novo", async () => {
    const recent = [{ status: "failed", finishedAt: "2026-10-30T10:32:00Z" }];

    const tooSoon = makeScheduler({ now: "2026-10-30T10:40:00Z", recent });
    await tooSoon.scheduler.tick();
    expect(tooSoon.calls).toEqual([]);

    const retry = makeScheduler({ now: "2026-10-30T11:35:00Z", recent });
    await retry.scheduler.tick();
    expect(retry.calls).toEqual(["boot"]);
  });

  it("respeita o máximo de tentativas por dia", async () => {
    const recent = [
      { status: "failed", finishedAt: "2026-10-30T10:32:00Z" },
      { status: "failed", finishedAt: "2026-10-30T11:32:00Z" },
      { status: "failed", finishedAt: "2026-10-30T12:32:00Z" },
    ];
    const { scheduler, calls } = makeScheduler({ now: "2026-10-30T15:00:00Z", recent });

    await scheduler.tick();

    expect(calls).toEqual([]);
    expect(scheduler.status().lastDecision).toMatch(/limite de 3/);
  });

  it("não inicia quando outra atualização já está em andamento", async () => {
    const { scheduler, calls } = makeScheduler({
      now: "2026-10-30T11:00:00Z",
      running: true,
    });

    await scheduler.tick();

    expect(calls).toEqual([]);
  });

  it("com dois horários, o catch-up cobre o primeiro e o segundo ainda roda", async () => {
    const { scheduler, calls } = makeScheduler({
      now: "2026-10-30T18:00:00Z",
      recent: [{ status: "ok", finishedAt: "2026-10-30T10:32:00Z" }],
      config: { slots: [11 * HOUR, 18 * HOUR], slotLabels: ["11:00", "18:00"] },
    });

    await scheduler.tick();

    expect(calls).toEqual(["boot"]);
  });

  it("com dois horários, não roda de novo depois do segundo já ter sido feito", async () => {
    const { scheduler, calls } = makeScheduler({
      now: "2026-10-30T19:00:00Z",
      recent: [{ status: "ok", finishedAt: "2026-10-30T18:30:00Z" }],
      config: { slots: [11 * HOUR, 18 * HOUR], slotLabels: ["11:00", "18:00"] },
    });

    await scheduler.tick();

    expect(calls).toEqual([]);
  });

  it("o catch-up de início do dia não bloqueia o segundo horário", async () => {
    const { scheduler, calls } = makeScheduler({
      now: "2026-10-30T15:00:00Z",
      recent: [{ status: "ok", finishedAt: "2026-10-30T14:00:00Z" }],
      config: { slots: [11 * HOUR, 18 * HOUR], slotLabels: ["11:00", "18:00"] },
    });

    await scheduler.tick();

    expect(calls).toEqual([]);
    expect(scheduler.status().nextSlot).toBe("18:00");
  });

  it("respeita o atraso de boot e agenda o intervalo", async () => {
    const { controller, calls } = makeController();
    const timeouts: Array<() => void> = [];
    const intervals: Array<() => void> = [];
    const cleared: unknown[] = [];
    const scheduler = createRefreshScheduler({
      controller,
      loadState: async () => ({ recent: [] }),
      config: makeConfig({ bootDelayMs: 120_000 }),
      now: () => new Date("2026-10-30T10:32:00Z"),
      log: () => {},
      setTimeoutFn: ((fn: () => void) => {
        timeouts.push(fn);
        return 1;
      }) as unknown as typeof setTimeout,
      clearTimeoutFn: ((id: unknown) => cleared.push(id)) as unknown as typeof clearTimeout,
      setIntervalFn: ((fn: () => void) => {
        intervals.push(fn);
        return 2;
      }) as unknown as typeof setInterval,
      clearIntervalFn: ((id: unknown) => cleared.push(id)) as unknown as typeof clearInterval,
    });

    scheduler.start();
    expect(calls).toEqual([]);
    expect(timeouts).toHaveLength(1);

    timeouts[0]();
    await vi.waitFor(() => expect(calls).toEqual(["boot"]));
    expect(intervals).toHaveLength(1);
    expect(scheduler.status().bootDelaySeconds).toBe(120);

    scheduler.stop();
    expect(cleared).toHaveLength(2);
  });

  it("não agenda nada quando desabilitado", () => {
    const { controller, calls } = makeController();
    const scheduler = createRefreshScheduler({
      controller,
      loadState: async () => ({ recent: [] }),
      config: makeConfig({ enabled: false }),
      now: () => new Date("2026-10-30T10:32:00Z"),
      log: () => {},
    });

    scheduler.start();

    expect(calls).toEqual([]);
    scheduler.stop();
  });

  it("não aplica o silêncio quando a janela está desligada", async () => {
    const { scheduler, calls } = makeScheduler({
      now: "2026-10-30T07:30:00Z",
      config: { quietStart: null, quietEnd: null, quietStartLabel: null, quietEndLabel: null },
    });

    await scheduler.tick();

    expect(calls).toEqual(["boot"]);
  });

  it("não loga limite de tentativas quando o dia já foi atualizado", async () => {
    const recent = [
      { status: "failed", finishedAt: "2026-10-30T10:32:00Z" },
      { status: "failed", finishedAt: "2026-10-30T11:32:00Z" },
      { status: "failed", finishedAt: "2026-10-30T12:32:00Z" },
      { status: "ok", finishedAt: "2026-10-30T13:00:00Z" },
    ];
    const { scheduler, calls } = makeScheduler({ now: "2026-10-30T14:00:00Z", recent });

    await scheduler.tick();

    expect(calls).toEqual([]);
    expect(scheduler.status().lastDecision).toMatch(/já atualizado hoje/);
  });

  it("um sucesso antes do primeiro horário já cobre o dia", async () => {
    const { scheduler, calls } = makeScheduler({
      now: "2026-10-30T10:45:00Z",
      recent: [{ status: "ok", finishedAt: "2026-10-30T10:00:00Z" }],
    });

    await scheduler.tick();

    expect(calls).toEqual([]);
  });

  it("zera o próximo horário quando todos os slots do dia foram cumpridos", async () => {
    const { scheduler } = makeScheduler({
      now: "2026-10-30T19:00:00Z",
      recent: [{ status: "ok", finishedAt: "2026-10-30T18:30:00Z" }],
      config: { slots: [11 * HOUR, 18 * HOUR], slotLabels: ["11:00", "18:00"] },
    });

    await scheduler.tick();

    expect(scheduler.status().nextSlot).toBeNull();
  });

  it("start() é idempotente", () => {
    const { controller } = makeController();
    const timeouts: Array<() => void> = [];
    const scheduler = createRefreshScheduler({
      controller,
      loadState: async () => ({ recent: [] }),
      config: makeConfig({ bootDelayMs: 120_000 }),
      now: () => new Date("2026-10-30T10:32:00Z"),
      log: () => {},
      setTimeoutFn: ((fn: () => void) => {
        timeouts.push(fn);
        return 1;
      }) as unknown as typeof setTimeout,
      clearTimeoutFn: (() => {}) as unknown as typeof clearTimeout,
      setIntervalFn: (() => 2) as unknown as typeof setInterval,
      clearIntervalFn: (() => {}) as unknown as typeof clearInterval,
    });

    scheduler.start();
    scheduler.start();

    expect(timeouts).toHaveLength(1);
    scheduler.stop();
  });

  it("mantém a próxima janela visível no status", async () => {
    const { scheduler } = makeScheduler({
      now: "2026-10-30T11:00:00Z",
      recent: [{ status: "ok", finishedAt: "2026-10-30T10:32:00Z" }],
      config: { slots: [11 * HOUR, 18 * HOUR], slotLabels: ["11:00", "18:00"] },
    });

    await scheduler.tick();

    expect(scheduler.status().nextSlot).toBe("18:00");
    expect(scheduler.status().slots).toEqual(["11:00", "18:00"]);
    expect(scheduler.status().quietHours).toEqual({ start: "22:00", end: "10:30" });
  });
});
