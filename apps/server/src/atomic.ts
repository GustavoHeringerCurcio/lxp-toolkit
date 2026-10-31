import { existsSync, renameSync, rmSync, writeFileSync } from "node:fs";

/**
 * Write a file atomically: write a sibling temp file, then rename it over the
 * destination. The server reads `exercises.json` while a separate `index:web`
 * child process rewrites it, so a truncate-then-write would briefly expose a
 * partial JSON document to `/api/exercises`. Rename is atomic on the same
 * filesystem, so readers see either the old or the new complete file.
 */
export function writeFileAtomic(
  file: string,
  data: string,
  encoding: BufferEncoding = "utf-8",
): void {
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(temp, data, encoding);
    renameSync(temp, file);
  } catch (err) {
    try {
      if (existsSync(temp)) rmSync(temp);
    } catch {
      // Best effort: preserve the original error.
    }
    throw err;
  }
}
