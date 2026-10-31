/**
 * In-process daily scheduler for the content refresh.
 *
 * The desktop is usually off overnight, so a fixed hour alone is not enough.
 * The scheduler therefore:
 *   - runs on the first opportunity of the day (boot catch-up) when there is
 *     no successful refresh yet, including shortly after the containers start;
 *   - runs at each configured slot (`REFRESH_AT`, e.g. "11:00" or
 *     "11:00,18:00") when the machine stays on;
 *   - never overlaps a manual "Atualizar" run (the refresh controller refuses
 *     concurrent runs);
 *   - retries failures with a backoff, capped per day;
 *   - stays quiet during `REFRESH_QUIET_START`..`REFRESH_QUIET_END` for
 *     automatic runs (the manual button always works).
 *
 * State is persisted by the server (`refresh_run`), so restarting the
 * containers does not re-scrape content that was already refreshed today.
 */
import type { RefreshController, RefreshSource } from "./refresh.js";

/** The subset of a persisted run the scheduler needs (structural, test-friendly). */
export interface RefreshRunLike {
  status: string;
  finishedAt: string;
}

export interface RefreshStateLike {
  recent: RefreshRunLike[];
}

export interface RefreshScheduleConfig {
  enabled: boolean;
  /** Slot start times, in minutes since local midnight, sorted. */
  slots: number[];
  slotLabels: string[];
  timezone: string;
  bootDelayMs: number;
  /** Quiet window in minutes; both null when disabled. */
  quietStart: number | null;
  quietEnd: number | null;
  quietStartLabel: string | null;
  quietEndLabel: string | null;
  retryMs: number;
  maxAttemptsPerDay: number;
  tickMs: number;
}

export interface RefreshSchedulerStatus {
  enabled: boolean;
  slots: string[];
  timezone: string;
  quietHours: { start: string; end: string } | null;
  bootDelaySeconds: number;
  lastCheckAt: string | null;
  lastSuccessAt: string | null;
  nextSlot: string | null;
  lastDecision: string | null;
}

export interface RefreshScheduler {
  start(): void;
  stop(): void;
  status(): RefreshSchedulerStatus;
  /** One evaluation pass. Exposed for deterministic tests. */
  tick(): Promise<void>;
}

export interface RefreshSchedulerOptions {
  controller: Pick<RefreshController, "start" | "status">;
  /** Reads the persisted run history (newest first). */
  loadState: () => Promise<RefreshStateLike>;
  config: RefreshScheduleConfig;
  now?: () => Date;
  log?: (message: string) => void;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
}

interface LocalParts {
  dateKey: string;
  minutes: number;
}

const DEFAULT_SLOT = 11 * 60;
const DEFAULT_TZ = "America/Sao_Paulo";

/** Parse "HH:MM" into minutes since midnight, or null when invalid. */
export function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

/** Format minutes since midnight as "HH:MM". */
export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Local date/time in a given IANA timezone (no dependence on OS tzdata). */
export function localParts(date: Date, timezone: string): LocalParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string): number => {
    const value = parts.find((p) => p.type === type)?.value;
    return value == null ? 0 : Number(value);
  };
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = get("hour");
  const minute = get("minute");
  return {
    dateKey: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    minutes: hour * 60 + minute,
  };
}

/** Whether `parts` falls inside a quiet window (supports crossing midnight). */
export function isQuiet(
  parts: LocalParts,
  start: number | null,
  end: number | null,
): boolean {
  if (start == null || end == null || start === end) return false;
  if (start < end) return parts.minutes >= start && parts.minutes < end;
  return parts.minutes >= start || parts.minutes < end;
}

/**
 * Which configured slots a day's successful runs already satisfy.
 *
 * A success after N slots satisfies all of them (the content is newer than
 * each of those slots). A success before the first slot (the boot catch-up)
 * satisfies only the first slot, so a second configured slot later in the day
 * still runs.
 */
export function satisfiedSlots(
  slots: number[],
  successes: string[],
  timezone: string,
  dateKey: string,
): Set<number> {
  const satisfied = new Set<number>();
  if (slots.length === 0) return satisfied;
  for (const iso of successes) {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) continue;
    const p = localParts(at, timezone);
    if (p.dateKey !== dateKey) continue;
    if (p.minutes < slots[0]) {
      satisfied.add(0);
      continue;
    }
    for (let i = 0; i < slots.length; i++) {
      if (slots[i] <= p.minutes) satisfied.add(i);
    }
  }
  return satisfied;
}

function isTruthy(value: string | undefined): boolean {
  return value === "1" || /^(true|yes|on)$/i.test(value?.trim() ?? "");
}

function envNumber(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  min: number,
  max: number,
  warn: (message: string) => void,
): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    warn(`[refresh-scheduler] ${key}=${raw} inválido; usando ${fallback}.`);
    return fallback;
  }
  return value;
}

function resolveTimezone(raw: string | undefined, warn: (message: string) => void): string {
  const candidate = raw?.trim() || DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    warn(`[refresh-scheduler] REFRESH_TZ=${candidate} inválido; usando ${DEFAULT_TZ}.`);
    return DEFAULT_TZ;
  }
}

/**
 * Read the scheduler configuration from the environment, falling back to safe
 * defaults instead of crashing the server on a typo.
 */
export function loadRefreshSchedulerConfig(
  env: NodeJS.ProcessEnv = process.env,
  warn: (message: string) => void = (message) => console.warn(message),
): RefreshScheduleConfig {
  const rawSlots = env.REFRESH_AT?.trim() || "11:00";
  const parsedSlots = rawSlots
    .split(",")
    .map((part) => parseClock(part))
    .filter((value): value is number => value != null);
  const slots =
    parsedSlots.length > 0
      ? [...new Set(parsedSlots)].sort((a, b) => a - b)
      : (warn(`[refresh-scheduler] REFRESH_AT=${rawSlots} inválido; usando 11:00.`), [
          DEFAULT_SLOT,
        ]);

  const readQuiet = (key: string, fallback: string): number | null => {
    const raw = env[key] === undefined ? fallback : (env[key] ?? "").trim();
    if (!raw) return null;
    const value = parseClock(raw);
    if (value == null) {
      warn(`[refresh-scheduler] ${key}=${raw} inválido; ignorando.`);
      return null;
    }
    return value;
  };
  const quietStart = readQuiet("REFRESH_QUIET_START", "22:00");
  const quietEnd = readQuiet("REFRESH_QUIET_END", "10:30");

  return {
    enabled: isTruthy(env.AUTO_REFRESH),
    slots,
    slotLabels: slots.map(formatClock),
    timezone: resolveTimezone(env.REFRESH_TZ, warn),
    bootDelayMs: envNumber(env, "REFRESH_BOOT_DELAY_SECONDS", 120, 0, 86_400, warn) * 1000,
    quietStart,
    quietEnd,
    quietStartLabel: quietStart == null ? null : formatClock(quietStart),
    quietEndLabel: quietEnd == null ? null : formatClock(quietEnd),
    retryMs: envNumber(env, "REFRESH_RETRY_MINUTES", 60, 1, 1_440, warn) * 60_000,
    maxAttemptsPerDay: envNumber(env, "REFRESH_MAX_ATTEMPTS", 3, 1, 20, warn),
    tickMs: 60_000,
  };
}

/** Build a scheduler. `start()` honors the boot delay; tests call `tick()` directly. */
export function createRefreshScheduler(options: RefreshSchedulerOptions): RefreshScheduler {
  const {
    controller,
    loadState,
    config,
    now = () => new Date(),
    log = (message: string) => console.log(message),
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
  } = options;

  let started = false;
  let bootTimer: ReturnType<typeof setTimeout> | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;
  let ticking = false;
  let firstAttempt = true;

  let lastCheckAt: string | null = null;
  let lastSuccessAt: string | null = null;
  let nextSlot: string | null = config.slotLabels[0] ?? null;
  let lastDecision: string | null = null;

  function decide(message: string): void {
    // Log only transitions: a skipped tick repeats the same decision every
    // minute, which would otherwise flood the container logs all day.
    if (message === lastDecision) return;
    lastDecision = message;
    log(`[refresh-scheduler] ${message}`);
  }

  async function tick(): Promise<void> {
    if (!config.enabled || ticking) return;
    ticking = true;
    try {
      const at = now();
      lastCheckAt = at.toISOString();
      const local = localParts(at, config.timezone);

      if (controller.status().running) {
        decide("uma atualização já está em andamento");
        return;
      }

      if (isQuiet(local, config.quietStart, config.quietEnd)) {
        decide(
          `horário de silêncio (${config.quietStartLabel}–${config.quietEndLabel}); aguardando`,
        );
        return;
      }

      let state: RefreshStateLike;
      try {
        state = await loadState();
      } catch (err) {
        decide(
          `não foi possível ler o histórico (${err instanceof Error ? err.message : String(err)})`,
        );
        return;
      }

      const today = state.recent.filter((run) => {
        const finished = new Date(run.finishedAt);
        return (
          !Number.isNaN(finished.getTime()) &&
          localParts(finished, config.timezone).dateKey === local.dateKey
        );
      });
      const successes = today.filter((run) => run.status === "ok").map((run) => run.finishedAt);
      const failures = today.filter((run) => run.status !== "ok");
      lastSuccessAt = state.recent.find((run) => run.status === "ok")?.finishedAt ?? null;

      const satisfied = satisfiedSlots(
        config.slots,
        successes,
        config.timezone,
        local.dateKey,
      );
      const due = config.slots.some(
        (slot, index) => local.minutes >= slot && !satisfied.has(index),
      );
      // No success yet today: this is the boot/first opportunity of the day.
      // It satisfies the first slot automatically (see `satisfiedSlots`).
      const catchUp = successes.length === 0;
      const remaining = config.slots
        .map((slot, index) => ({ slot, index }))
        .filter(({ index }) => !satisfied.has(index));
      nextSlot = remaining.length
        ? formatClock(remaining.find(({ slot }) => slot > local.minutes)?.slot ?? remaining[0].slot)
        : null;

      if (!due && !catchUp) {
        decide("conteúdo já atualizado hoje");
        return;
      }

      if (failures.length >= config.maxAttemptsPerDay) {
        decide(
          `${failures.length} falha(s) hoje; limite de ${config.maxAttemptsPerDay} atingido, tentando amanhã`,
        );
        return;
      }

      const lastFailure = failures
        .map((run) => new Date(run.finishedAt).getTime())
        .filter((time) => Number.isFinite(time))
        .sort((a, b) => b - a)[0];
      if (lastFailure != null && at.getTime() - lastFailure < config.retryMs) {
        decide("aguardando o intervalo antes de tentar de novo");
        return;
      }

      const source: RefreshSource = firstAttempt ? "boot" : "scheduled";
      const startedNow = controller.start(source);
      if (!startedNow) {
        decide("outra atualização começou primeiro");
        return;
      }
      firstAttempt = false;
      decide(
        `${source === "boot" ? "atualização de início do dia" : "atualização agendada"} iniciada`,
      );
    } finally {
      ticking = false;
    }
  }

  function start(): void {
    if (started) return;
    started = true;
    if (!config.enabled) {
      log("[refresh-scheduler] AUTO_REFRESH desligado; atualização automática inativa.");
      return;
    }
    log(
      `[refresh-scheduler] ativo: ${config.slotLabels.join(", ")} (${config.timezone})` +
        (config.quietStartLabel && config.quietEndLabel
          ? `, silêncio ${config.quietStartLabel}–${config.quietEndLabel}`
          : ""),
    );
    const begin = (): void => {
      void tick();
      interval = setIntervalFn(() => void tick(), config.tickMs);
    };
    bootTimer =
      config.bootDelayMs > 0
        ? setTimeoutFn(begin, config.bootDelayMs)
        : (begin(), null);
  }

  function stop(): void {
    if (bootTimer) clearTimeoutFn(bootTimer);
    if (interval) clearIntervalFn(interval);
    bootTimer = null;
    interval = null;
    started = false;
  }

  return {
    start,
    stop,
    tick,
    status(): RefreshSchedulerStatus {
      return {
        enabled: config.enabled,
        slots: config.slotLabels,
        timezone: config.timezone,
        quietHours:
          config.quietStartLabel && config.quietEndLabel
            ? { start: config.quietStartLabel, end: config.quietEndLabel }
            : null,
        bootDelaySeconds: Math.round(config.bootDelayMs / 1000),
        lastCheckAt,
        lastSuccessAt,
        nextSlot,
        lastDecision,
      };
    },
  };
}
