import { describe, expect, it } from "vitest";
import {
  cmpOpen,
  countInfo,
  countdownParts,
  deadlineInfo,
  fmtDeadline,
  godsEyeDeadlineLabel,
  isUpcoming,
  parseDeadlineTs,
} from "./status";
import { translate, type Lang } from "./i18n";

const t = (key: string, vars?: Record<string, string | number>) => translate("pt", key, vars);

describe("deadlineInfo", () => {
  it("done → ok", () => {
    expect(deadlineInfo({ done: true, status: "open", daysLeft: 2 }, t)).toEqual({
      label: t("status.done"),
      tone: "ok",
    });
  });

  it("expired → late (com dias quando souber)", () => {
    expect(deadlineInfo({ done: false, status: "expired", daysLeft: -3 }, t).tone).toBe("late");
    expect(deadlineInfo({ done: false, status: "expired", daysLeft: -3 }, t).label).toMatch(/3/);
    expect(deadlineInfo({ done: false, status: "expired", daysLeft: null }, t).label).toBe(
      t("status.late"),
    );
  });

  it("sem prazo → none", () => {
    expect(deadlineInfo({ done: false, status: "open", daysLeft: null }, t).tone).toBe("none");
  });

  it("hoje/amanhã → soon", () => {
    expect(deadlineInfo({ done: false, status: "open", daysLeft: 0 }, t).label).toBe(
      t("status.dueToday"),
    );
    expect(deadlineInfo({ done: false, status: "open", daysLeft: 1 }, t).label).toBe(
      t("status.dueTomorrow"),
    );
  });

  it("2–3 dias → soon; mais que isso → coming", () => {
    expect(deadlineInfo({ done: false, status: "open", daysLeft: 3 }, t).tone).toBe("soon");
    expect(deadlineInfo({ done: false, status: "open", daysLeft: 4 }, t).tone).toBe("coming");
  });
});

describe("parseDeadlineTs", () => {
  it("aceita o formato do portal (espaço → T)", () => {
    expect(parseDeadlineTs("2026-09-22 19:00:00")).toBe(new Date(2026, 8, 22, 19, 0, 0).getTime());
  });

  it("null/ inválido → null", () => {
    expect(parseDeadlineTs(null)).toBeNull();
    expect(parseDeadlineTs("")).toBeNull();
    expect(parseDeadlineTs("nope")).toBeNull();
  });
});

describe("isUpcoming", () => {
  const now = new Date(2026, 8, 22, 21, 30, 0).getTime();

  it("prazo no futuro → true", () => {
    expect(isUpcoming("2026-09-23 10:00:00", now)).toBe(true);
  });

  it("prazo já vencido → false", () => {
    expect(isUpcoming("2026-09-22 19:00:00", now)).toBe(false);
  });

  it("sem prazo → false", () => {
    expect(isUpcoming(null, now)).toBe(false);
  });
});

describe("godsEyeDeadlineLabel", () => {
  const now = new Date(2026, 8, 22, 21, 30, 0).getTime();

  it("vencido há poucas horas → 'vencido', nunca 'vence em 0d'", () => {
    const label = godsEyeDeadlineLabel("2026-09-22 19:00:00", now, t, "pt-BR");
    expect(label).toContain(t("godsEye.overdue"));
    expect(label).not.toContain(t("godsEye.dueIn", { days: 0 }));
  });

  it("futuro próximo → vence em Nd", () => {
    expect(godsEyeDeadlineLabel("2026-09-25 19:00:00", now, t, "pt-BR")).toContain(
      t("godsEye.dueIn", { days: 3 }),
    );
  });

  it("futuro distante → só a data", () => {
    const label = godsEyeDeadlineLabel("2026-10-20 19:00:00", now, t, "pt-BR");
    expect(label).not.toContain("vence");
    expect(label).not.toContain("vencido");
  });

  it("sem prazo → rótulo dedicado", () => {
    expect(godsEyeDeadlineLabel(null, now, t, "pt-BR")).toBe(t("godsEye.noDeadline"));
  });
});

describe("countInfo", () => {
  it("conta por status", () => {
    const items = [
      { status: "open" as const },
      { status: "open" as const },
      { status: "expired" as const },
      { status: "done" as const },
    ];
    expect(countInfo(items)).toEqual({ open: 2, expired: 1, done: 1 });
  });
});

describe("cmpOpen", () => {
  const mk = (status: string, daysLeft: number | null, title: string) => ({ status, daysLeft, title });

  it("open antes de expired antes de done", () => {
    const sorted = [mk("done", null, "z"), mk("expired", -2, "y"), mk("open", 5, "x")].sort(cmpOpen);
    expect(sorted.map((s) => s.status)).toEqual(["open", "expired", "done"]);
  });

  it("dentro do mesmo status, menos dias primeiro; null vai para o fim", () => {
    const sorted = [mk("open", null, "b"), mk("open", 1, "a"), mk("open", 3, "c")].sort(cmpOpen);
    expect(sorted.map((s) => s.title)).toEqual(["a", "c", "b"]);
  });

  it("empate de prazo → ordem alfabética", () => {
    const sorted = [mk("open", 2, "banana"), mk("open", 2, "abacaxi")].sort(cmpOpen);
    expect(sorted.map((s) => s.title)).toEqual(["abacaxi", "banana"]);
  });
});

describe("countdownParts", () => {
  it("futuro: dias e horas, past=false", () => {
    const now = Date.parse("2026-09-10T10:00:00Z");
    const { rel, past } = countdownParts("2026-09-13T14:30:00Z", now);
    expect(rel).toBe("3d 04h");
    expect(past).toBe(false);
  });

  it("menos de 1h → minutos", () => {
    const now = Date.parse("2026-09-10T10:00:00Z");
    expect(countdownParts("2026-09-10T10:45:00Z", now).rel).toBe("45min");
  });

  it("passado → past=true com valor absoluto", () => {
    const now = Date.parse("2026-09-10T10:00:00Z");
    const { rel, past } = countdownParts("2026-09-09T10:00:00Z", now);
    expect(past).toBe(true);
    expect(rel).toBe("1d 00h");
  });
});

describe("fmtDeadline", () => {
  it("formata data · hora no locale (roundtrip local)", () => {
    const iso = new Date(2026, 8, 15, 14, 30).toISOString();
    const s = fmtDeadline(iso, "pt-BR");
    expect(s).toMatch(/·/);
    expect(s).toMatch(/14:30/);
  });
});
