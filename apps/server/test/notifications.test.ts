import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationConfig, NotificationItem } from "../src/types.js";

vi.mock("../src/store.js", () => ({
  getNotificationConfig: vi.fn(),
  listNotificationItems: vi.fn(),
  claimNotificationEvent: vi.fn(),
  finishNotificationEvent: vi.fn(),
  getNotificationItem: vi.fn(),
}));
import {
  buildBarkPayload,
  buildDiscordPayload,
  defaultNotificationConfig,
  deliverNotification,
  formatNotification,
  isBarkDeviceKey,
  maskSecret,
  normalizeDiscordWebhookUrl,
  notifyActivityDone,
  runNotificationScan,
  sendBark,
  sendDiscord,
} from "../src/notifications.js";
import * as store from "../src/store.js";

function makeConfig(overrides: Partial<NotificationConfig> = {}): NotificationConfig {
  return {
    ...defaultNotificationConfig(new Date("2026-01-01T00:00:00Z")),
    ...overrides,
  };
}

function makeItem(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: 1,
    title: "Atividade Teste",
    courseName: "Curso Teste",
    moduleName: "Modulo 1",
    deadlineAt: null,
    done: false,
    origin: "tree",
    createdAt: "2026-01-01T00:00:00Z",
    doneCapturedAt: null,
    prevDone: null,
    rawKind: "file_upload",
    isRecordProgress: false,
    ...overrides,
  };
}

function response(init: { ok?: boolean; status?: number; body?: unknown; text?: string }) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => init.body ?? { code: 200 },
    text: async () => init.text ?? "",
  };
}

beforeEach(() => {
  vi.mocked(store.getNotificationConfig).mockResolvedValue(makeConfig());
  vi.mocked(store.listNotificationItems).mockResolvedValue([]);
  vi.mocked(store.claimNotificationEvent).mockResolvedValue(1);
  vi.mocked(store.finishNotificationEvent).mockResolvedValue(undefined);
  vi.mocked(store.getNotificationItem).mockResolvedValue(makeItem({ done: true }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("notification helpers", () => {
  it("mascara segredos mantendo so o final", () => {
    expect(maskSecret(null)).toBeNull();
    expect(maskSecret("abcdef")).toBe("…cdef");
  });

  it("valida webhook do Discord (host e formato)", () => {
    const valid =
      "https://discord.com/api/webhooks/123456789012345678/abcDEF0123456789-_xyz";
    expect(normalizeDiscordWebhookUrl(valid)).toBe(valid);
    expect(normalizeDiscordWebhookUrl("http://discord.com/api/webhooks/1/token")).toBeNull();
    expect(normalizeDiscordWebhookUrl("https://evil.com/api/webhooks/1/token")).toBeNull();
    expect(normalizeDiscordWebhookUrl("https://discord.com/not-a-webhook")).toBeNull();
  });

  it("valida a Device Key do Bark", () => {
    expect(isBarkDeviceKey("abcdefgh1234")).toBe(true);
    expect(isBarkDeviceKey("has space")).toBe(false);
    expect(isBarkDeviceKey("short")).toBe(false);
  });

  it("formata os quatro eventos em pt-BR", () => {
    const item = makeItem({ deadlineAt: "2026-12-01T23:59:00Z" });
    expect(formatNotification("new", item).title).toBe("Nova atividade");
    expect(formatNotification("due_soon", item).title).toBe("Faltam menos de 24h");
    expect(formatNotification("done", item).title).toBe("Atividade concluída");
    expect(formatNotification("expired", item).title).toBe("Prazo perdido");
    expect(formatNotification("test").body).toContain("sucesso");
  });

  it("monta o embed do Discord sem permitir menções", () => {
    const payload = buildDiscordPayload("done", makeItem());
    expect(payload.allowed_mentions).toEqual({ parse: [] });
    const embed = (payload.embeds as Record<string, unknown>[])[0];
    expect(embed.title).toBe("Atividade concluída");
    expect(embed.color).toBe(0x3f8a5b);
  });

  it("monta o payload do Bark com grupo e nivel", () => {
    const payload = buildBarkPayload("expired", makeItem());
    expect(payload.group).toBe("LXP Toolkit");
    expect(payload.level).toBe("timeSensitive");
  });
});

describe("delivery", () => {
  it("envia o Discord com wait=true", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendDiscord(
      "https://discord.com/api/webhooks/123456789012345678/abcDEF0123456789-_xyz",
      "new",
      makeItem(),
    );

    const [target, init] = fetchMock.mock.calls[0];
    expect(String(target)).toContain("?wait=true");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.username).toBe("LXP Toolkit");
  });

  it("envia o Bark para /push e exige code 200", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ body: { code: 200 } }));
    vi.stubGlobal("fetch", fetchMock);

    await sendBark("abcdefgh1234", "done", makeItem());

    const [target, init] = fetchMock.mock.calls[0];
    expect(String(target)).toContain("/push");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.device_key).toBe("abcdefgh1234");
    expect(body.group).toBe("LXP Toolkit");
  });

  it("rejeita uma resposta do Bark sem code 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ ok: false, status: 500, body: { code: 500 } })),
    );
    await expect(sendBark("abcdefgh1234", "done")).rejects.toThrow("Bark");
  });

  it("entrega nos dois canais e preserva falhas parciais", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ status: 204 }))
      .mockResolvedValueOnce(response({ ok: false, status: 500, body: { code: 500, message: "no" } }));
    vi.stubGlobal("fetch", fetchMock);

    const results = await deliverNotification(
      makeConfig({
        discordEnabled: true,
        discordWebhookUrl:
          "https://discord.com/api/webhooks/123456789012345678/abcDEF0123456789-_xyz",
        barkEnabled: true,
        barkDeviceKey: "abcdefgh1234",
      }),
      "new",
      makeItem(),
    );

    expect(results).toHaveLength(2);
    expect(results.find((r) => r.channel === "discord")?.ok).toBe(true);
    expect(results.find((r) => r.channel === "bark")?.ok).toBe(false);
  });
});

describe("scan", () => {
  it("detecta atividade nova e registra no ledger", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T12:00:00Z"));
    vi.mocked(store.listNotificationItems).mockResolvedValue([
      makeItem({ id: 10, createdAt: "2026-02-01T11:00:00Z" }),
    ]);

    await runNotificationScan("refresh");

    expect(store.claimNotificationEvent).toHaveBeenCalledWith("new", "10", 10);
  });

  it("detecta alerta de 24h e prazo vencido", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T12:00:00Z"));
    const due = new Date("2026-02-02T06:00:00Z").toISOString();
    const expired = new Date("2026-02-01T08:00:00Z").toISOString();
    vi.mocked(store.listNotificationItems).mockResolvedValue([
      makeItem({ id: 20, deadlineAt: due, createdAt: "2026-01-01T00:00:00Z" }),
      makeItem({ id: 21, deadlineAt: expired, createdAt: "2026-01-01T00:00:00Z" }),
    ]);

    await runNotificationScan("refresh");

    expect(store.claimNotificationEvent).toHaveBeenCalledWith(
      "due_soon",
      `20:${new Date(due).getTime()}`,
      20,
    );
    expect(store.claimNotificationEvent).toHaveBeenCalledWith(
      "expired",
      `21:${new Date(expired).getTime()}`,
      21,
    );
  });

  it("nao notifica prazo vencido antes do baseline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T12:00:00Z"));
    vi.mocked(store.listNotificationItems).mockResolvedValue([
      makeItem({ id: 22, deadlineAt: "2025-12-01T08:00:00Z" }),
    ]);
    await runNotificationScan("refresh");
    expect(store.claimNotificationEvent).not.toHaveBeenCalled();
  });

  it("detecta conclusao externa e suprime done quando o item tambem e novo", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T12:00:00Z"));
    vi.mocked(store.listNotificationItems).mockImplementation(async () => [
      makeItem({
        id: 30,
        done: true,
        doneCapturedAt: "2026-02-01T11:30:00Z",
        prevDone: false,
        createdAt: "2026-01-01T00:00:00Z",
      }),
      makeItem({
        id: 31,
        done: true,
        doneCapturedAt: "2026-02-01T11:30:00Z",
        prevDone: false,
        createdAt: "2026-02-01T11:00:00Z",
      }),
    ]);

    await runNotificationScan("refresh");

    expect(store.claimNotificationEvent).toHaveBeenCalledWith("done", "30", 30);
    expect(store.claimNotificationEvent).toHaveBeenCalledWith("new", "31", 31);
    expect(store.claimNotificationEvent).not.toHaveBeenCalledWith("done", "31", 31);
  });

  it("com 'nova' desligada, a conclusao de um item novo ainda notifica", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T12:00:00Z"));
    vi.mocked(store.getNotificationConfig).mockResolvedValue(makeConfig({ notifyNew: false }));
    vi.mocked(store.listNotificationItems).mockResolvedValue([
      makeItem({
        id: 32,
        done: true,
        doneCapturedAt: "2026-02-01T11:30:00Z",
        prevDone: false,
        createdAt: "2026-02-01T11:00:00Z",
      }),
    ]);

    await runNotificationScan("refresh");

    expect(store.claimNotificationEvent).toHaveBeenCalledWith("done", "32", 32);
  });

  it("registra como ignorado quando o evento esta desligado", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T12:00:00Z"));
    vi.mocked(store.getNotificationConfig).mockResolvedValue(makeConfig({ notifyNew: false }));
    vi.mocked(store.listNotificationItems).mockResolvedValue([
      makeItem({ id: 40, createdAt: "2026-02-01T11:00:00Z" }),
    ]);

    await runNotificationScan("refresh");

    expect(store.finishNotificationEvent).toHaveBeenCalledWith(1, "skipped", "evento desligado");
  });

  it("notificacao imediata de conclusao usa o mesmo ledger", async () => {
    vi.mocked(store.getNotificationItem).mockResolvedValue(makeItem({ id: 50, done: true }));
    await notifyActivityDone(50);
    expect(store.claimNotificationEvent).toHaveBeenCalledWith("done", "50", 50);
  });
});
