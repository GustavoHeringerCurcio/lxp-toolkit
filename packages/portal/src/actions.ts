import { writeFileSync } from "node:fs";
import path from "node:path";
import type { ApiClient } from "./client.js";
import { logger } from "./config.js";
import { ensureDir, sanitizeFilename } from "./util.js";

/** Mark a reading item as read (record progress). This mutates the academic record. */
export async function markRead(
  client: ApiClient,
  courseId: number,
  topicId: number,
): Promise<boolean> {
  const res = await client.post<unknown>(
    `/v2/plataforma/content/academics-main/${courseId}/topics/${topicId}/progress`,
  );
  return res.status === 200 || res.status === 204;
}

/** Download a PDF by absolute URL to a local directory. Returns the saved path or null. */
export async function downloadPdf(url: string, filename: string | null, dir: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { accept: "application/pdf" } });
    if (!res.ok) {
      logger.warn({ url, status: res.status }, "pdf download failed");
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    ensureDir(dir);
    const safe = sanitizeFilename(filename ?? path.basename(new URL(url).pathname));
    const file = path.join(dir, safe);
    writeFileSync(file, buf);
    return file;
  } catch (err) {
    logger.warn({ err, url }, "pdf download error");
    return null;
  }
}
