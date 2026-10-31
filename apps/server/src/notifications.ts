/**
 * Notifications: Discord incoming webhook + Bark push.
 *
 * The scanner runs only at two moments (by product decision):
 *   - on server/container boot (`runNotificationScan("boot")`);
 *   - after every refresh run finishes (`runNotificationScan("refresh")`).
 * A successful portal submission also calls `notifyActivityDone()` directly.
 *
 * Delivery is best-effort: a channel failure is recorded in the ledger and
 * never blocks a refresh or a submission. The `notification_event` table is
 * an idempotency ledger, so boot + refresh cannot double-notify.
 */
import { actionKindFor } from "./build.js";
import {
  claimNotificationEvent,
  finishNotificationEvent,
  getNotificationConfig,
  getNotificationItem,
  listNotificationItems,
} from "./store.js";
import type {
  ContentKind,
  NotificationChannel,
  NotificationChannelResult,
  NotificationConfig,
  NotificationEventKind,
  NotificationItem,
} from "./types.js";

const DUE_SOON_MS = 24 * 60 * 60 * 1000;
const DEFAULT_BARK_BASE_URL = "https://api.day.app";

type EventToggleKey = "notifyNew" | "notifyDueSoon" | "notifyDone" | "notifyExpired";

/** Event toggles read from the config, keyed by ledger kind. */
const EVENT_TOGGLE: Record<Exclude<NotificationEventKind, "test">, EventToggleKey> = {
  new: "notifyNew",
  due_soon: "notifyDueSoon",
  done: "notifyDone",
  expired: "notifyExpired",
};

/** Discord embed accent per event. Status is the only intentional hue. */
const DISCORD_COLOR: Record<NotificationEventKind, number> = {
  new: 0x8a8a8a,
  due_soon: 0xb08a3e,
  done: 0x3f8a5b,
  expired: 0xb04a42,
  test: 0x8a8a8a,
};

export interface NotificationScanResult {
  sent: number;
  skipped: number;
  failed: number;
}

/** A notification occurrence ready to format and deliver. */
interface PendingEvent {
  kind: Exclude<NotificationEventKind, "test">;
  key: string;
  item: NotificationItem;
}

/** The public (browser-safe) shape returned by `GET /api/notifications`. */
export interface PublicNotificationConfig {
  discordEnabled: boolean;
  discordConfigured: boolean;
  discordHint: string | null;
  barkEnabled: boolean;
  barkConfigured: boolean;
  barkHint: string | null;
  notifyNew: boolean;
  notifyDueSoon: boolean;
  notifyDone: boolean;
  notifyExpired: boolean;
  baselineAt: string | null;
  updatedAt: string | null;
  lastEventAt: string | null;
  lastError: string | null;
}

/** Mask a secret, keeping only the last 4 characters. */
export function maskSecret(value: string | null): string | null {
  if (!value) return null;
  const tail = value.slice(-4);
  return `…${tail}`;
}

/** Default config used before the student saves the notification settings. */
export function defaultNotificationConfig(now = new Date()): NotificationConfig {
  return {
    discordEnabled: false,
    discordWebhookUrl: null,
    barkEnabled: false,
    barkDeviceKey: null,
    notifyNew: true,
    notifyDueSoon: true,
    notifyDone: true,
    notifyExpired: true,
    baselineAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export function publicNotificationConfig(
  config: NotificationConfig | null,
  summary: { lastEventAt: string | null; lastError: string | null },
): PublicNotificationConfig {
  return {
    discordEnabled: config?.discordEnabled ?? false,
    discordConfigured: Boolean(config?.discordWebhookUrl),
    discordHint: maskSecret(config?.discordWebhookUrl ?? null),
    barkEnabled: config?.barkEnabled ?? false,
    barkConfigured: Boolean(config?.barkDeviceKey),
    barkHint: maskSecret(config?.barkDeviceKey ?? null),
    notifyNew: config?.notifyNew ?? true,
    notifyDueSoon: config?.notifyDueSoon ?? true,
    notifyDone: config?.notifyDone ?? true,
    notifyExpired: config?.notifyExpired ?? true,
    baselineAt: config?.baselineAt ?? null,
    updatedAt: config?.updatedAt ?? null,
    lastEventAt: summary.lastEventAt,
    lastError: summary.lastError,
  };
}

/**
 * Discord webhook URLs are user-supplied and fetched by the server, so only
 * the official hosts/path shape are accepted (prevents SSRF).
 */
export function normalizeDiscordWebhookUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (!/(^|\.)discord(app)?\.com$/i.test(url.hostname)) return null;
  if (!/^\/api\/webhooks\/\d+\/[A-Za-z0-9._-]+$/.test(url.pathname)) return null;
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function isBarkDeviceKey(raw: string): boolean {
  const value = raw.trim();
  return value.length >= 6 && value.length <= 256 && !/\s/.test(value);
}

/** Bark server base URL (self-host via BARK_BASE_URL; defaults to the public one). */
export function barkBaseUrl(): string {
  const raw = process.env.BARK_BASE_URL?.trim() || DEFAULT_BARK_BASE_URL;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return DEFAULT_BARK_BASE_URL;
    return url.toString().replace(/\/+$/, "");
  } catch {
    return DEFAULT_BARK_BASE_URL;
  }
}

/** Optional app URL used to deep-link the notification to the activity. */
function appBaseUrl(): string | null {
  const raw = process.env.APP_PUBLIC_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function itemUrl(item: NotificationItem): string | undefined {
  const base = appBaseUrl();
  return base ? `${base}/tarefa/${item.id}` : undefined;
}

function deadlineLabel(iso: string | null): string {
  if (!iso) return "sem prazo";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "sem prazo";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, Math.max(0, max - 1))}…` : value;
}

/** Title + body shown in Bark and used as the Discord embed fallback text. */
export function formatNotification(kind: NotificationEventKind, item?: NotificationItem): {
  title: string;
  body: string;
} {
  if (kind === "test") {
    return {
      title: "LXP Toolkit",
      body: "Notificações configuradas com sucesso. Você receberá os avisos escolhidos.",
    };
  }
  const title = item?.title ?? "Atividade";
  const course = item?.courseName ?? "";
  switch (kind) {
    case "new":
      return {
        title: "Nova atividade",
        body: `${title}${course ? ` — ${course}` : ""}${
          item?.deadlineAt ? ` · vence ${deadlineLabel(item.deadlineAt)}` : ""
        }`,
      };
    case "due_soon":
      return {
        title: "Faltam menos de 24h",
        body: `${title}${course ? ` — ${course}` : ""} · vence ${deadlineLabel(item?.deadlineAt ?? null)}`,
      };
    case "done":
      return {
        title: "Atividade concluída",
        body: `${title}${course ? ` — ${course}` : ""}`,
      };
    case "expired":
      return {
        title: "Prazo perdido",
        body: `${title}${course ? ` — ${course}` : ""} · venceu ${deadlineLabel(item?.deadlineAt ?? null)}`,
      };
    default:
      return { title: "LXP Toolkit", body: "Atualização de atividades." };
  }
}

/** Discord incoming-webhook payload (embed + no mentions). */
export function buildDiscordPayload(
  kind: NotificationEventKind,
  item?: NotificationItem,
): Record<string, unknown> {
  const { title, body } = formatNotification(kind, item);
  const fields: { name: string; value: string; inline?: boolean }[] = [];
  if (item?.courseName) fields.push({ name: "Curso", value: item.courseName, inline: true });
  if (item?.moduleName) fields.push({ name: "Módulo", value: item.moduleName, inline: true });
  if (item?.deadlineAt) fields.push({ name: "Prazo", value: deadlineLabel(item.deadlineAt), inline: true });
  return {
    username: "LXP Toolkit",
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: truncate(title, 256),
        description: truncate(body, 2000),
        color: DISCORD_COLOR[kind],
        url: item ? itemUrl(item) : undefined,
        fields,
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

/** Bark `/push` payload. */
export function buildBarkPayload(
  kind: NotificationEventKind,
  item?: NotificationItem,
): Record<string, unknown> {
  const { title, body } = formatNotification(kind, item);
  return {
    title: truncate(title, 120),
    body: truncate(body, 800),
    group: "LXP Toolkit",
    level: kind === "due_soon" || kind === "expired" ? "timeSensitive" : "active",
    url: item ? itemUrl(item) : undefined,
  };
}

async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  return `HTTP ${res.status}${text ? `: ${truncate(text, 300)}` : ""}`;
}

/** Send one Discord webhook message. Throws on any non-2xx response. */
export async function sendDiscord(
  webhookUrl: string,
  kind: NotificationEventKind,
  item?: NotificationItem,
): Promise<void> {
  const target = new URL(webhookUrl);
  target.searchParams.set("wait", "true");
  const res = await fetch(target, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildDiscordPayload(kind, item)),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Discord ${await readError(res)}`);
}

/** Send one Bark push. Success requires HTTP 2xx and body `code === 200`. */
export async function sendBark(
  deviceKey: string,
  kind: NotificationEventKind,
  item?: NotificationItem,
): Promise<void> {
  const res = await fetch(`${barkBaseUrl()}/push`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ device_key: deviceKey, ...buildBarkPayload(kind, item) }),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json().catch(() => null)) as { code?: number; message?: string } | null;
  if (!res.ok || data?.code !== 200) {
    throw new Error(
      `Bark HTTP ${res.status}${data?.message ? `: ${data.message}` : ""}${
        data?.code != null ? ` (code ${data.code})` : ""
      }`,
    );
  }
}

/** Deliver one event to every enabled channel, collecting per-channel results. */
export async function deliverNotification(
  config: NotificationConfig,
  kind: NotificationEventKind,
  item?: NotificationItem,
): Promise<NotificationChannelResult[]> {
  const jobs: Promise<NotificationChannelResult>[] = [];

  if (config.discordEnabled && config.discordWebhookUrl) {
    jobs.push(
      sendDiscord(config.discordWebhookUrl, kind, item)
        .then(() => ({ channel: "discord" as NotificationChannel, ok: true }))
        .catch((err) => ({
          channel: "discord" as NotificationChannel,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        })),
    );
  }
  if (config.barkEnabled && config.barkDeviceKey) {
    jobs.push(
      sendBark(config.barkDeviceKey, kind, item)
        .then(() => ({ channel: "bark" as NotificationChannel, ok: true }))
        .catch((err) => ({
          channel: "bark" as NotificationChannel,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        })),
    );
  }

  return Promise.all(jobs);
}

function hasAnyChannel(config: NotificationConfig): boolean {
  return (
    (config.discordEnabled && Boolean(config.discordWebhookUrl)) ||
    (config.barkEnabled && Boolean(config.barkDeviceKey))
  );
}

/** Whether a raw item is an actionable task in the normal tree. */
function isActionable(item: NotificationItem): boolean {
  if (!item.rawKind) return false;
  return actionKindFor({
    kind: item.rawKind as ContentKind,
    isRecordProgress: item.isRecordProgress === true,
  }) != null;
}

function eventKey(kind: Exclude<NotificationEventKind, "test">, item: NotificationItem): string {
  if (kind === "done") return `${item.id}`;
  if (kind === "new") return `${item.id}`;
  const deadline = item.deadlineAt ? new Date(item.deadlineAt).getTime() : 0;
  return `${item.id}:${Number.isFinite(deadline) ? deadline : 0}`;
}

/**
 * Claim and deliver one event. Events are always claimed, even when the
 * matching toggle is off or no channel is configured, so re-enabling never
 * replays old notifications.
 */
async function processEvent(
  config: NotificationConfig,
  kind: Exclude<NotificationEventKind, "test">,
  item: NotificationItem,
): Promise<"sent" | "skipped" | "failed"> {
  const key = eventKey(kind, item);
  const ledgerId = await claimNotificationEvent(kind, key, item.id);
  if (ledgerId == null) return "skipped";

  const toggle = config[EVENT_TOGGLE[kind]];
  if (!toggle || !hasAnyChannel(config)) {
    await finishNotificationEvent(ledgerId, "skipped", !toggle ? "evento desligado" : "sem canal configurado");
    return "skipped";
  }

  const results = await deliverNotification(config, kind, item);
  const failures = results.filter((r) => !r.ok);
  if (results.length === 0) {
    await finishNotificationEvent(ledgerId, "skipped", "sem canal configurado");
    return "skipped";
  }
  if (failures.length === 0) {
    await finishNotificationEvent(ledgerId, "sent", null);
    return "sent";
  }
  const detail = failures.map((f) => `${f.channel}: ${f.error ?? "falhou"}`).join(" | ");
  await finishNotificationEvent(ledgerId, "failed", detail);
  console.warn(`[notifications] ${kind} ${item.id}: ${detail}`);
  return "failed";
}

/**
 * Scan the current catalog for new/due-soon/done/expired events.
 *
 * `reason` is only used for the (quiet) log line; the detection rules are the
 * same at boot and after a refresh.
 */
export async function runNotificationScan(
  reason: "boot" | "refresh" = "refresh",
): Promise<NotificationScanResult> {
  const result: NotificationScanResult = { sent: 0, skipped: 0, failed: 0 };
  let config: NotificationConfig | null = null;
  try {
    config = await getNotificationConfig();
  } catch (err) {
    console.warn(
      `[notifications] não foi possível ler a configuração: ${err instanceof Error ? err.message : String(err)}`,
    );
    return result;
  }
  if (!config) return result;

  const baseline = new Date(config.baselineAt).getTime();
  if (!Number.isFinite(baseline)) return result;

  let items: NotificationItem[];
  try {
    items = await listNotificationItems();
  } catch (err) {
    console.warn(
      `[notifications] não foi possível listar as atividades: ${err instanceof Error ? err.message : String(err)}`,
    );
    return result;
  }

  const now = Date.now();
  const actionable = items;
  const newIds = new Set<number>();
  const pending: PendingEvent[] = [];

  for (const item of actionable) {
    if (!isActionable(item)) continue;
    const created = new Date(item.createdAt).getTime();
    if (Number.isFinite(created) && created > baseline) {
      // Only suppress the "done" alert when the "new" alert is actually wanted;
      // with `notifyNew` off, a brand-new item that is already done should still
      // notify its completion.
      if (config.notifyNew) newIds.add(item.id);
      pending.push({ kind: "new", key: `${item.id}`, item });
    }
  }

  for (const item of actionable) {
    if (!isActionable(item)) continue;

    const deadline = item.deadlineAt ? new Date(item.deadlineAt).getTime() : NaN;
    if (!item.done && Number.isFinite(deadline)) {
      if (deadline > now && deadline <= now + DUE_SOON_MS) {
        pending.push({ kind: "due_soon", key: `${item.id}:${deadline}`, item });
      } else if (deadline > baseline && deadline < now) {
        pending.push({ kind: "expired", key: `${item.id}:${deadline}`, item });
      }
    }

    // A brand-new item that is already done should only produce the "new" alert.
    const doneCaptured = item.doneCapturedAt ? new Date(item.doneCapturedAt).getTime() : NaN;
    if (
      item.done &&
      !newIds.has(item.id) &&
      item.prevDone !== true &&
      Number.isFinite(doneCaptured) &&
      doneCaptured > baseline
    ) {
      pending.push({ kind: "done", key: `${item.id}`, item });
    }
  }

  // Deduplicate within this scan (the DB claim still protects across scans).
  const seen = new Set<string>();
  for (const event of pending) {
    const dedupe = `${event.kind}:${event.key}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    try {
      const status = await processEvent(config, event.kind, event.item);
      result[status] += 1;
    } catch (err) {
      result.failed += 1;
      console.warn(
        `[notifications] falha ao processar ${event.kind} ${event.item.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  if (result.sent || result.failed) {
    console.log(
      `[notifications] ${reason}: ${result.sent} enviada(s), ${result.failed} falha(s), ${result.skipped} ignorada(s).`,
    );
  }
  return result;
}

/**
 * Immediate "activity done" notification after a successful portal submission.
 * The refresh scan also catches completions made outside the toolkit; the
 * ledger makes the two paths idempotent.
 */
export async function notifyActivityDone(itemId: number): Promise<boolean> {
  const config = await getNotificationConfig().catch(() => null);
  if (!config) return false;
  const item = await getNotificationItem(itemId);
  if (!item || !isActionable(item)) return false;
  return (await processEvent(config, "done", item)) === "sent";
}

/** Send a test message to every enabled channel (does not touch the ledger). */
export async function sendNotificationTest(
  config: NotificationConfig,
): Promise<NotificationChannelResult[]> {
  return deliverNotification(config, "test");
}
