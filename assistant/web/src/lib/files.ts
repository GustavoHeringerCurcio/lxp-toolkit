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
