import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

// This file is apps/server/src/paths.ts
export const ASSISTANT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

loadEnv({ override: true, path: path.join(ASSISTANT_DIR, ".env") });

/** Directory that holds the scraped LXP data (the repo-root scraped/). */
export function dataDir(): string {
  const d = process.env.DATA_DIR;
  return d ? path.resolve(ASSISTANT_DIR, d) : path.join(ASSISTANT_DIR, "..", "..", "scraped");
}

export const assist = (...p: string[]): string => path.join(ASSISTANT_DIR, ...p);
export const inData = (...p: string[]): string => path.join(dataDir(), ...p);
export const raw = (...p: string[]): string => path.join(dataDir(), "raw", ...p);
