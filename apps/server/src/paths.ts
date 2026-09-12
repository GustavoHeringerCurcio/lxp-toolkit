import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

// This file is apps/server/src/paths.ts
export const ASSISTANT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const shellOpenAiKey = process.env.OPENAI_API_KEY;

// `.env` is the source of truth: override any pre-existing shell variable so a
// stale session/machine key cannot silently shadow the one in the file
// (dotenv does not override by default). See setup/doctor.mjs.
loadEnv({ path: path.join(ASSISTANT_DIR, ".env"), override: true });

const effectiveOpenAiKey = process.env.OPENAI_API_KEY;

export type OpenAiKeySource = "shell" | ".env" | "none";

export function openaiKeySource(): OpenAiKeySource {
  if (!effectiveOpenAiKey) return "none";
  // With `override: true`, a value equal to the shell's means `.env` didn't
  // provide one (or provided the identical key).
  if (shellOpenAiKey && effectiveOpenAiKey === shellOpenAiKey) return "shell";
  return ".env";
}

export function openaiKeyLast4(): string {
  const k = process.env.OPENAI_API_KEY ?? "";
  return k.length >= 4 ? k.slice(-4) : "----";
}

/** Directory that holds the scraped LXP data (the repo-root scraped/). */
export function dataDir(): string {
  const d = process.env.DATA_DIR;
  return d ? path.resolve(ASSISTANT_DIR, d) : path.join(ASSISTANT_DIR, "..", "..", "scraped");
}

export const assist = (...p: string[]): string => path.join(ASSISTANT_DIR, ...p);
export const inData = (...p: string[]): string => path.join(dataDir(), ...p);
export const raw = (...p: string[]): string => path.join(dataDir(), "raw", ...p);
