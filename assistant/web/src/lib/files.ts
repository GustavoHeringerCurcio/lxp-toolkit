import type { RemoteFile } from "@/types";

function basename(url: string): string {
  const clean = url.split(/[?#]/)[0];
  const name = clean.slice(clean.lastIndexOf("/") + 1);
  try {
    return decodeURIComponent(name) || url;
  } catch {
    return name || url;
  }
}

/** Human-readable name: the portal-provided filename, else the URL basename. */
export function remoteFileName(f: RemoteFile): string {
  const name = f.filename?.trim();
  return name ? name : basename(f.url);
}

/** Lowercased extension (no dot) derived from the filename, else the URL path. */
export function remoteFileExt(f: RemoteFile): string {
  const source = f.filename?.trim() || f.url.split(/[?#]/)[0];
  const m = source.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : "";
}

export function isPdf(f: RemoteFile): boolean {
  return remoteFileExt(f) === "pdf";
}

const OFFICE_EXTS = new Set(["ppt", "pptx", "xls", "xlsx", "doc", "docx", "odt", "ods", "odp", "rtf", "csv"]);

/** True for files the server can convert to PDF for inline preview. */
export function isOffice(f: RemoteFile): boolean {
  return OFFICE_EXTS.has(remoteFileExt(f));
}

/** Inline preview URL: PDFs render directly, Office files are converted server-side. */
export function previewUrl(f: RemoteFile): string {
  return isPdf(f) ? f.url : `/api/preview?url=${encodeURIComponent(f.url)}`;
}
