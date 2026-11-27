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
import { listAssessments } from "./assessments.js";
import { actionKindFor } from "./build.js";
import { query } from "./db.js";
import {
  claimNotificationEvent,
  finishNotificationEvent,
  getNotificationConfig,
  getNotificationItem,
  listNotificationItems,
} from "./store.js";
import type {
  Assessment,
  ContentKind,
  NotificationChannel,
  NotificationChannelResult,
  NotificationConfig,
  NotificationEventKind,
  NotificationItem,
} from "./types.js";

/** How early a "due soon" reminder starts. Defaults to 72h (not 24h). */
function dueSoonMs(): number {
  const raw = process.env.NOTIFY_DUE_SOON_HOURS?.trim();
  const hours = raw ? Number(raw) : 72;
  return (Number.isFinite(hours) && hours > 0 ? hours : 72) * 60 * 60 * 1000;
}
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

/**
 * Bark art per event. Files live in `apps/web/public/notifications` and are
 * rendered by `npm run notif:icons`. The small `icon` is masked to a circle by
 * iOS; the `-banner` file is the `image` attachment shown when expanded.
 */
const BARK_ASSET: Record<NotificationEventKind, string> = {
  new: "new",
  due_soon: "due-soon",
  done: "done",
  expired: "expired",
  test: "test",
};

/** Notification Center stack per event (keeps urgent and done work apart). */
const BARK_GROUP: Record<NotificationEventKind, string> = {
  new: "LXP Toolkit · Novas",
  due_soon: "LXP Toolkit · Prazos",
  done: "LXP Toolkit · Concluídas",
  expired: "LXP Toolkit · Prazos",
  test: "LXP Toolkit",
};

/** Built-in Bark/iOS sound per event (no import needed in the app). */
const BARK_SOUND: Record<NotificationEventKind, string> = {
  new: "newsflash",
  due_soon: "minuet",
  done: "paymentsuccess",
  expired: "alarm",
  test: "minuet",
};

/** Public directory Bark fetches the art from (the phone downloads it). */
const DEFAULT_BARK_ASSET_BASE_URL =
  "https://raw.githubusercontent.com/GustavoHeringerCurcio/lxp-toolkit/master/apps/web/public/notifications";
/** Bump when the art changes: Bark caches downloaded images by URL. */
const BARK_ASSET_VERSION = "1";

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
  /** Host pushes are sent to (public api.day.app unless BARK_BASE_URL is set). */
  barkServer: string;
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
    barkServer: barkHost(),
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
  return barkDeviceKeyProblem(raw) === null;
}

/**
 * Canonical Bark device keys are the 22-char shortuuid bark-server generates on
 * registration (alphabet excludes 0/O/I/l). Rejecting anything else up front
 * catches the most common mistake: pasting an APNs device token (64 hex) or an
 * encryption key instead of the Device Key shown in the app.
 */
const BARK_DEVICE_KEY_PATTERN =
  /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{22}$/;
const APNS_DEVICE_TOKEN_PATTERN = /^[0-9a-fA-F]{64}$/;

/** Human-readable reason a value cannot be a Bark Device Key, or null when valid. */
export function barkDeviceKeyProblem(raw: string): string | null {
  const value = raw.trim();
  if (!value) return "informe a Device Key.";
  if (/\s/.test(value)) return "a Device Key não pode conter espaços.";
  if (APNS_DEVICE_TOKEN_PATTERN.test(value)) {
    return "esse valor tem 64 caracteres hexadecimais, que é o formato do token de APNs (não da Device Key). Copie a Device Key de 22 caracteres no app Bark.";
  }
  if (value.length !== 22) {
    return `a Device Key do Bark tem 22 caracteres (recebido ${value.length}). Copie a Device Key no app Bark.`;
  }
  if (!BARK_DEVICE_KEY_PATTERN.test(value)) {
    return "a Device Key contém caracteres inválidos. Copie a Device Key no app Bark.";
  }
  return null;
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

/** Host shown to the user so a wrong/missing BARK_BASE_URL is obvious. */
export function barkHost(): string {
  try {
    return new URL(barkBaseUrl()).host;
  } catch {
    return "api.day.app";
  }
}

/**
 * Base URL of the public notification art (Bark fetches `icon`/`image` from
 * the phone, so it must be reachable without auth). Override with
 * `BARK_ASSET_BASE_URL` (e.g. `https://<app>/notifications` on Vercel); the
 * default is this public repository's raw path so local Docker works too.
 */
export function barkAssetBaseUrl(): string {
  const raw = process.env.BARK_ASSET_BASE_URL?.trim();
  if (raw) {
    try {
      const url = new URL(raw);
      if (url.protocol === "https:" || url.protocol === "http:") {
        return url.toString().replace(/\/+$/, "");
      }
    } catch {
      // fall through to the default
    }
  }
  return DEFAULT_BARK_ASSET_BASE_URL;
}

/** Versioned URL for one Bark asset (`icon` or `image`). */
function barkAssetUrl(stem: string, suffix: "" | "-banner"): string {
  return `${barkAssetBaseUrl()}/${stem}${suffix}.png?v=${BARK_ASSET_VERSION}`;
}

export type BarkKeyCheck =
  | { status: "ok" }
  | { status: "unknown"; message: string }
  | { status: "unreachable"; message: string };

/**
 * Ask the Bark server whether it knows this device key (`GET /register/:key`,
 * a read-only check). Only an explicit 400 blocks saving; an unreachable server
 * is reported as a warning so offline/self-hosted setups can still save.
 */
export async function verifyBarkDeviceKey(deviceKey: string): Promise<BarkKeyCheck> {
  const host = barkHost();
  const hint =
    "Copie a Device Key (22 caracteres) no app Bark" +
    (host === "api.day.app" ? "." : `; se a key for de outro servidor, ajuste BARK_BASE_URL.`);
  try {
    const res = await fetch(`${barkBaseUrl()}/register/${encodeURIComponent(deviceKey)}`, {
      method: "GET",
      signal: AbortSignal.timeout(5_000),
    });
    const data = (await res.json().catch(() => null)) as { code?: number } | null;
    if (res.ok && (data?.code === 200 || data?.code == null)) return { status: "ok" };
    if (res.status === 400) {
      return { status: "unknown", message: `Device Key não reconhecida por ${host}. ${hint}` };
    }
    return {
      status: "unreachable",
      message: `Não foi possível verificar a Device Key em ${host} (HTTP ${res.status}).`,
    };
  } catch (err) {
    return {
      status: "unreachable",
      message: `Não foi possível verificar a Device Key em ${host}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
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
    case "due_soon": {
      const deadline = item?.deadlineAt ? new Date(item.deadlineAt).getTime() : NaN;
      const hours = Number.isFinite(deadline)
        ? Math.max(1, Math.ceil((deadline - Date.now()) / 3_600_000))
        : null;
      const heading =
        hours == null
          ? "Prazo próximo"
          : hours <= 24
            ? "Faltam menos de 24h"
            : `Vence em ${Math.ceil(hours / 24)} dias`;
      return {
        title: heading,
        body: `${title}${course ? ` — ${course}` : ""} · vence ${deadlineLabel(item?.deadlineAt ?? null)}`,
      };
    }
    case "done":
      return {
        title: "Atividade concluída",
        body: `${title}${course ? ` — ${course}` : ""}`,
      };
    case "expired":
      return {
        title: "Prazo perdido",
        body: `${title}${course ? ` — ${course}` : ""}${
          item?.deadlineAt ? ` · venceu ${deadlineLabel(item.deadlineAt)}` : ""
        }`,
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
  const stem = BARK_ASSET[kind];
  return {
    title: truncate(title, 120),
    body: truncate(body, 800),
    group: BARK_GROUP[kind],
    sound: BARK_SOUND[kind],
    level: kind === "due_soon" || kind === "expired" ? "timeSensitive" : "active",
    icon: barkAssetUrl(stem, ""),
    image: barkAssetUrl(stem, "-banner"),
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
  const message = typeof data?.message === "string" ? data.message : "";
  if (!res.ok || data?.code !== 200) {
    // The server's "failed to get … device token from database" is just an
    // unknown device key: explain the fix instead of echoing the raw lookup.
    if (res.status === 400 && /device token/i.test(message)) {
      const host = barkHost();
      throw new Error(
        `Bark: device key não reconhecida por ${host}. Copie a Device Key (22 caracteres) no app Bark` +
          (host === "api.day.app" ? "." : "; se a key for de outro servidor, ajuste BARK_BASE_URL."),
      );
    }
    throw new Error(
      `Bark HTTP ${res.status}${message ? `: ${message}` : ""}${
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
 * One-time digest of items that were already expired when notifications were
 * configured (deadline before `baseline_at`). Without it, a missed activity
 * like the AER Simulado was never notified — the per-item `expired` rule
 * intentionally ignores deadlines before the baseline.
 */
async function notifyOverdueBacklog(
  config: NotificationConfig,
  items: NotificationItem[],
): Promise<"sent" | "skipped" | "failed"> {
  if (items.length === 0) return "skipped";
  const baselineIso = new Date(config.baselineAt).toISOString();
  const ledgerId = await claimNotificationEvent("expired", `backlog:${baselineIso}`, null);
  if (ledgerId == null) return "skipped";
  if (!config.notifyExpired || !hasAnyChannel(config)) {
    await finishNotificationEvent(
      ledgerId,
      "skipped",
      !config.notifyExpired ? "evento desligado" : "sem canal configurado",
    );
    return "skipped";
  }

  const first = items[0];
  const titles = items.slice(0, 6).map((item) => item.title).join(" · ");
  const label = `${items.length} atividade${items.length === 1 ? "" : "s"} atrasada${
    items.length === 1 ? "" : "s"
  }`;
  const synthetic: NotificationItem = {
    ...first,
    title: `${label}: ${titles}`,
    courseName: "",
    moduleName: "",
    deadlineAt: null,
  };
  const results = await deliverNotification(config, "expired", synthetic);
  const failures = results.filter((result) => !result.ok);
  if (results.length === 0) {
    await finishNotificationEvent(ledgerId, "skipped", "sem canal configurado");
    return "skipped";
  }
  if (failures.length === 0) {
    await finishNotificationEvent(ledgerId, "sent", null);
    return "sent";
  }
  await finishNotificationEvent(
    ledgerId,
    "failed",
    failures.map((f) => `${f.channel}: ${f.error ?? "falhou"}`).join(" | "),
  );
  return "failed";
}

/** Send a custom title/body digest through every enabled channel. */
async function deliverDigest(
  config: NotificationConfig,
  title: string,
  body: string,
  url?: string,
): Promise<NotificationChannelResult[]> {
  const jobs: Promise<NotificationChannelResult>[] = [];

  if (config.discordEnabled && config.discordWebhookUrl) {
    jobs.push(
      (async () => {
        try {
          const target = new URL(config.discordWebhookUrl!);
          target.searchParams.set("wait", "true");
          const res = await fetch(target, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              username: "LXP Toolkit",
              allowed_mentions: { parse: [] },
              embeds: [
                {
                  title: truncate(title, 256),
                  description: truncate(body, 2000),
                  color: DISCORD_COLOR.due_soon,
                  url,
                  timestamp: new Date().toISOString(),
                },
              ],
            }),
            signal: AbortSignal.timeout(10_000),
          });
          if (!res.ok) throw new Error(`Discord ${await readError(res)}`);
          return { channel: "discord" as NotificationChannel, ok: true };
        } catch (err) {
          return {
            channel: "discord" as NotificationChannel,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      })(),
    );
  }

  if (config.barkEnabled && config.barkDeviceKey) {
    jobs.push(
      (async () => {
        try {
          const stem = BARK_ASSET.due_soon;
          const res = await fetch(`${barkBaseUrl()}/push`, {
            method: "POST",
            headers: { "content-type": "application/json; charset=utf-8" },
            body: JSON.stringify({
              device_key: config.barkDeviceKey!,
              title: truncate(title, 120),
              body: truncate(body, 800),
              group: BARK_GROUP.due_soon,
              sound: BARK_SOUND.due_soon,
              level: "timeSensitive",
              icon: barkAssetUrl(stem, ""),
              image: barkAssetUrl(stem, "-banner"),
              url,
            }),
            signal: AbortSignal.timeout(10_000),
          });
          const data = (await res.json().catch(() => null)) as
            | { code?: number; message?: string }
            | null;
          if (!res.ok || data?.code !== 200) {
            throw new Error(
              `Bark HTTP ${res.status}${data?.message ? `: ${data.message}` : ""}`,
            );
          }
          return { channel: "bark" as NotificationChannel, ok: true };
        } catch (err) {
          return {
            channel: "bark" as NotificationChannel,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      })(),
    );
  }

  return Promise.all(jobs);
}

function appCalendarUrl(): string | undefined {
  const base = appBaseUrl();
  return base ? `${base}/calendario` : undefined;
}

function shortDate(iso: string | null): string {
  if (!iso) return "sem prazo";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "sem prazo";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Daily digest for gradebook assessments that are not covered by a normal
 * content task (exams like AVD1 SOMATIVA, stale/old links, gradebook-only
 * activities). One message per day, with the next 7 days.
 */
async function notifyAssessmentDigest(
  config: NotificationConfig,
): Promise<"sent" | "skipped" | "failed"> {
  let assessments: Assessment[];
  try {
    assessments = await listAssessments();
  } catch {
    return "skipped";
  }
  const now = Date.now();
  const horizon = now + 7 * 86_400_000;
  const due = assessments
    .filter((assessment) => {
      if (assessment.done || !assessment.deadlineAt) return false;
      const ts = new Date(assessment.deadlineAt).getTime();
      if (!Number.isFinite(ts) || ts < now - 3_600_000 || ts > horizon) return false;
      // Linked actionable tasks already get the per-item due_soon reminder.
      const actionable =
        assessment.linkStatus === "linked" &&
        ["file_upload", "quiz", "forum"].includes(assessment.matchedKind ?? "");
      return !actionable;
    })
    .sort(
      (a, b) =>
        new Date(a.deadlineAt!).getTime() - new Date(b.deadlineAt!).getTime(),
    );
  if (due.length === 0) return "skipped";

  const ledgerId = await claimNotificationEvent(
    "due_soon",
    `assessment-digest:${todayKey()}`,
    null,
  );
  if (ledgerId == null) return "skipped";
  if (!config.notifyDueSoon || !hasAnyChannel(config)) {
    await finishNotificationEvent(
      ledgerId,
      "skipped",
      !config.notifyDueSoon ? "evento desligado" : "sem canal configurado",
    );
    return "skipped";
  }

  const lines = due
    .slice(0, 8)
    .map(
      (assessment) =>
        `${shortDate(assessment.deadlineAt)} — ${assessment.title} (${assessment.categoryName})`,
    );
  const more = due.length > lines.length ? `\n+${due.length - lines.length}…` : "";
  const results = await deliverDigest(
    config,
    "Avaliações do boletim",
    `${lines.join("\n")}${more}`,
    appCalendarUrl(),
  );
  const failures = results.filter((result) => !result.ok);
  if (results.length === 0) {
    await finishNotificationEvent(ledgerId, "skipped", "sem canal configurado");
    return "skipped";
  }
  if (failures.length === 0) {
    await finishNotificationEvent(ledgerId, "sent", null);
    return "sent";
  }
  await finishNotificationEvent(
    ledgerId,
    "failed",
    failures.map((f) => `${f.channel}: ${f.error ?? "falhou"}`).join(" | "),
  );
  return "failed";
}

/** Notify deadlines that changed since the previous import. */
async function notifyDeadlineChanges(
  config: NotificationConfig,
): Promise<"sent" | "skipped" | "failed"> {
  const rows = await query<{
    id: string;
    title: string;
    old_deadline: Date | null;
    new_deadline: Date | null;
  }>(
    `SELECT id, title, old_deadline, new_deadline
       FROM deadline_change
      WHERE notified_at IS NULL
      ORDER BY detected_at
      LIMIT 20`,
  );
  if (rows.length === 0) return "skipped";

  const key = `deadline-change:${rows.map((row) => row.id).join("-")}`;
  const ledgerId = await claimNotificationEvent("due_soon", key, null);
  if (ledgerId == null) return "skipped";
  if (!config.notifyDueSoon || !hasAnyChannel(config)) {
    await query(`UPDATE deadline_change SET notified_at = now() WHERE notified_at IS NULL`);
    await finishNotificationEvent(ledgerId, "skipped", "sem canal/evento");
    return "skipped";
  }

  const lines = rows.map(
    (row) => `${row.title}: ${shortDate(row.old_deadline?.toISOString() ?? null)} → ${shortDate(row.new_deadline?.toISOString() ?? null)}`,
  );
  const results = await deliverDigest(
    config,
    "Prazos alterados",
    lines.join("\n"),
    appCalendarUrl(),
  );
  const failures = results.filter((result) => !result.ok);
  if (results.length === 0) {
    await finishNotificationEvent(ledgerId, "skipped", "sem canal configurado");
    return "skipped";
  }
  if (failures.length === 0) {
    await query(`UPDATE deadline_change SET notified_at = now() WHERE notified_at IS NULL`);
    await finishNotificationEvent(ledgerId, "sent", null);
    return "sent";
  }
  await finishNotificationEvent(
    ledgerId,
    "failed",
    failures.map((f) => `${f.channel}: ${f.error ?? "falhou"}`).join(" | "),
  );
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

  // Items that expired before notifications existed: one summarized alert.
  // Only real deliverables (upload/quiz/forum), most recent first, so the
  // digest surfaces meaningful misses instead of years-old readings.
  const backlog = actionable
    .filter((item) => {
      if (!isActionable(item) || item.done) return false;
      if (!["file_upload", "quiz", "forum"].includes(item.rawKind ?? "")) return false;
      const deadline = item.deadlineAt ? new Date(item.deadlineAt).getTime() : NaN;
      return Number.isFinite(deadline) && deadline < baseline && deadline < now;
    })
    .sort((a, b) => {
      const da = a.deadlineAt ? new Date(a.deadlineAt).getTime() : 0;
      const db = b.deadlineAt ? new Date(b.deadlineAt).getTime() : 0;
      return db - da;
    });
  if (backlog.length > 0) {
    try {
      result[await notifyOverdueBacklog(config, backlog)] += 1;
    } catch (err) {
      result.failed += 1;
      console.warn(
        `[notifications] backlog: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Gradebook-only exams (e.g. AVD1 SOMATIVA) have no content task to trigger
  // the per-item due_soon rule; a daily 7-day digest covers them.
  try {
    result[await notifyAssessmentDigest(config)] += 1;
  } catch (err) {
    result.failed += 1;
    console.warn(
      `[notifications] assessment digest: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Deadline shifts (portal extended/shortened a task or exam).
  try {
    result[await notifyDeadlineChanges(config)] += 1;
  } catch (err) {
    result.failed += 1;
    console.warn(
      `[notifications] deadline changes: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

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
      if (deadline > now && deadline <= now + dueSoonMs()) {
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
