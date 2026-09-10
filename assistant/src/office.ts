import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { assist } from "./paths.js";

const execFileAsync = promisify(execFile);

/** Extensions LibreOffice can convert to PDF for inline preview. */
export const OFFICE_EXTENSIONS = new Set([
  "ppt",
  "pptx",
  "xls",
  "xlsx",
  "doc",
  "docx",
  "odt",
  "ods",
  "odp",
  "rtf",
  "csv",
]);

export function fileExt(name: string): string {
  const m = name.split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : "";
}

export function isOfficeFile(name: string): boolean {
  return OFFICE_EXTENSIONS.has(fileExt(name));
}

/** Cache directory for generated PDF previews (gitignored, under assistant/data). */
export function previewCacheDir(): string {
  return assist("data", "previews");
}

function sofficeBin(): string {
  return process.env.SOFFICE_BIN || "soffice";
}

/**
 * Serialize LibreOffice runs: a single user profile cannot serve two concurrent
 * headless conversions, and parallel iframes would otherwise trip over each other.
 */
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

function cacheKey(srcPath: string): string {
  let stamp = "";
  try {
    const s = statSync(srcPath);
    stamp = `${s.size}:${s.mtimeMs}`;
  } catch {
    stamp = "missing";
  }
  return createHash("sha256").update(`${srcPath}|${stamp}`).digest("hex");
}

/**
 * Convert an Office/OpenDocument file to PDF via LibreOffice, caching the result.
 * Returns the cached PDF path, or null when conversion fails.
 */
export async function officeToPdf(srcPath: string, cacheDir = previewCacheDir()): Promise<string | null> {
  if (!existsSync(srcPath)) return null;
  const out = path.join(cacheDir, `${cacheKey(srcPath)}.pdf`);
  if (existsSync(out)) return out;

  return enqueue(async () => {
    if (existsSync(out)) return out;
    mkdirSync(cacheDir, { recursive: true });
    const tmp = mkdtempSync(path.join(cacheDir, ".tmp-"));
    const profile = path.join(tmp, "profile");
    try {
      await execFileAsync(
        sofficeBin(),
        [
          `-env:UserInstallation=file://${profile}`,
          "--headless",
          "--norestore",
          "--convert-to",
          "pdf",
          "--outdir",
          tmp,
          srcPath,
        ],
        { timeout: 120_000, maxBuffer: 16 * 1024 * 1024 },
      );
      const produced = path.join(tmp, `${path.basename(srcPath, path.extname(srcPath))}.pdf`);
      if (!existsSync(produced)) return null;
      renameSync(produced, out);
      return out;
    } catch {
      return null;
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
}
