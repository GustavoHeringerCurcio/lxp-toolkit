import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// This file is packages/portal/src/util.ts
export const PORTAL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_ROOT = path.resolve(PORTAL_DIR, "..", "..");

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function sanitizeFilename(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .trim();
  return cleaned.length > 0 ? cleaned : "untitled";
}

export function ensureDir(dir: string): string {
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function resolveOut(...segments: string[]): string {
  return path.resolve(REPO_ROOT, ...segments);
}

export function storageStatePath(): string {
  return path.join(PORTAL_DIR, "data", "storageState.json");
}

export function hasStorageState(): boolean {
  return existsSync(storageStatePath());
}

export function slugify(text: string): string {
  return sanitizeFilename(
    text
      .toLowerCase()
      .replace(/[áàâãä]/g, "a")
      .replace(/[éèêë]/g, "e")
      .replace(/[íìîï]/g, "i")
      .replace(/[óòôõö]/g, "o")
      .replace(/[úùûü]/g, "u")
      .replace(/ç/g, "c")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, ""),
  );
}

export function json(data: unknown): string {
  return JSON.stringify(data, null, 2);
}
