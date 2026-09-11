import { config as loadEnv } from "dotenv";
import { z } from "zod";
import pino from "pino";

loadEnv({ override: true });

const boolFromString = z.preprocess((value) => {
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (["true", "1", "yes"].includes(lower)) return true;
    if (["false", "0", "no"].includes(lower)) return false;
  }
  return value;
}, z.boolean());

const EnvSchema = z.object({
  LXP_LOGIN_URL: z.string().url().default("https://unifoa.lyceum.com.br/aluno/#/login"),
  LXP_USERNAME: z.string().optional().default(""),
  LXP_PASSWORD: z.string().optional().default(""),
  LXP_URL: z.string().url().default("https://unifoa2.grupoa.education/plataforma/"),
  API_BASE: z.string().url().default("https://api.plataforma.grupoa.education"),
  TZ: z.string().default("America/Sao_Paulo"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  PLAYWRIGHT_NO_SANDBOX: boolFromString.default(false),
  HEADFUL: boolFromString.default(false),
  OUT_DIR: z.string().default("scraped"),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "env"}: ${issue.message}`)
    .join("\n");
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

export interface AppConfig {
  lxpLoginUrl: string;
  lxpUsername: string;
  lxpPassword: string;
  lxpUrl: string;
  apiBase: string;
  tz: string;
  logLevel: string;
  playwrightNoSandbox: boolean;
  headful: boolean;
  outDir: string;
}

export const config: AppConfig = {
  lxpLoginUrl: parsed.data.LXP_LOGIN_URL,
  lxpUsername: parsed.data.LXP_USERNAME,
  lxpPassword: parsed.data.LXP_PASSWORD,
  lxpUrl: parsed.data.LXP_URL,
  apiBase: parsed.data.API_BASE,
  tz: parsed.data.TZ,
  logLevel: parsed.data.LOG_LEVEL,
  playwrightNoSandbox: parsed.data.PLAYWRIGHT_NO_SANDBOX,
  headful: parsed.data.HEADFUL,
  outDir: parsed.data.OUT_DIR,
};

export const logger = pino({
  level: config.logLevel,
  redact: {
    paths: [
      "LXP_PASSWORD",
      "*.password",
      "*.token",
      "authorization",
      "*.authorization",
    ],
    censor: "[REDACTED]",
  },
  transport:
    process.env.NODE_ENV === "production"
      ? undefined
      : { target: "pino-pretty", options: { singleLine: true } },
});

export function hasCredentials(): boolean {
  return Boolean(config.lxpUsername && config.lxpPassword);
}
