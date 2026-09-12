/**
 * Professor avatar resolution.
 *
 * The student stores a LinkedIn profile URL; we resolve its photo through the
 * public `unavatar.io` service and cache the bytes on disk (gitignored, under
 * `apps/server/data/avatars`). A direct image URL is supported as a fallback.
 *
 * unavatar returns an SVG placeholder when it cannot find a real avatar, so we
 * only accept raster image types and treat everything else as "not found".
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assist } from "./paths.js";

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 12_000;

const TYPE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export interface AvatarImage {
  buffer: Buffer;
  contentType: string;
}

export interface ResolvedAvatar {
  file: string;
  contentType: string;
}

export function avatarCacheDir(): string {
  return assist("data", "avatars");
}

export interface ParsedLinkedin {
  slug: string;
  url: string;
}

/**
 * Accepts a full `linkedin.com/in/<slug>` URL or a bare slug and normalizes it.
 * Returns null when the value is not a plausible LinkedIn profile.
 */
export function parseLinkedinUrl(raw: string | null | undefined): ParsedLinkedin | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  let slug = value;
  const match = value.match(/linkedin\.com\/in\/([^/?#\s]+)/i);
  if (match) slug = match[1];
  slug = slug.split(/[?#]/)[0].replace(/\/+$/, "");
  if (!slug || slug.length > 120) return null;
  if (!/^[\p{L}\p{N}%._-]+$/u.test(slug)) return null;
  return { slug, url: `https://www.linkedin.com/in/${slug}` };
}

/** Percent-encode a raw slug without double-encoding an already-encoded one. */
function encodeSlug(slug: string): string {
  return /%[0-9a-f]{2}/i.test(slug) ? slug : encodeURIComponent(slug);
}

export function unavatarUrl(slug: string): string {
  return `https://unavatar.io/linkedin/${encodeSlug(slug)}`;
}

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".local")) return true;
  if (h === "0.0.0.0" || h === "::1" || h === "[::1]") return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return false;
}

async function fetchImage(url: string, hostAllowed?: (host: string) => boolean): Promise<AvatarImage | null> {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return null;
  }
  if (target.protocol !== "https:") return null;
  if (hostAllowed) {
    if (!hostAllowed(target.hostname)) return null;
  } else if (isPrivateHost(target.hostname)) {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(target.href, { signal: controller.signal, redirect: "follow" });
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!(contentType in TYPE_EXT)) return null;
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > AVATAR_MAX_BYTES) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0 || buffer.length > AVATAR_MAX_BYTES) return null;
    return { buffer, contentType };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve a LinkedIn slug to an avatar via unavatar (rejects its SVG fallback). */
export function resolveLinkedinAvatar(slug: string): Promise<AvatarImage | null> {
  return fetchImage(unavatarUrl(slug), (host) => host === "unavatar.io" || host.endsWith(".unavatar.io"));
}

/** Resolve a user-supplied direct image URL (https + image/* only). */
export function resolveRemoteImage(url: string): Promise<AvatarImage | null> {
  return fetchImage(url);
}

export interface ProfessorLinkSource {
  linkedinUrl: string | null;
  imageUrl: string | null;
  source: "linkedin" | "manual";
}

interface RemoteSource {
  key: string;
  fetch: () => Promise<AvatarImage | null>;
}

/** Pick the remote source for a stored link (manual image wins over LinkedIn). */
function remoteSource(link: ProfessorLinkSource): RemoteSource | null {
  const manual = (link.imageUrl ?? "").trim();
  if (manual) {
    return { key: `url:${manual}`, fetch: () => resolveRemoteImage(manual) };
  }
  const parsed = parseLinkedinUrl(link.linkedinUrl);
  if (!parsed) return null;
  return { key: `li:${parsed.slug}`, fetch: () => resolveLinkedinAvatar(parsed.slug) };
}

function cacheBase(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 20);
}

function readCached(key: string): ResolvedAvatar | null {
  const dir = avatarCacheDir();
  if (!existsSync(dir)) return null;
  const base = cacheBase(key);
  for (const [contentType, ext] of Object.entries(TYPE_EXT)) {
    const file = path.join(dir, `${base}.${ext}`);
    if (!existsSync(file)) continue;
    if (Date.now() - statSync(file).mtimeMs > AVATAR_TTL_MS) return null;
    return { file, contentType };
  }
  return null;
}

function writeCached(key: string, image: AvatarImage): ResolvedAvatar {
  const dir = avatarCacheDir();
  mkdirSync(dir, { recursive: true });
  const ext = TYPE_EXT[image.contentType] ?? "img";
  const file = path.join(dir, `${cacheBase(key)}.${ext}`);
  writeFileSync(file, image.buffer);
  return { file, contentType: image.contentType };
}

/**
 * Return the cached avatar for a link, fetching and caching it on a miss.
 * Returns null when there is no usable source or the remote fetch fails.
 */
export async function loadProfessorAvatar(link: ProfessorLinkSource): Promise<ResolvedAvatar | null> {
  const remote = remoteSource(link);
  if (!remote) return null;
  const cached = readCached(remote.key);
  if (cached) return cached;
  const image = await remote.fetch();
  if (!image) return null;
  return writeCached(remote.key, image);
}
