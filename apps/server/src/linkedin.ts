/**
 * Pure LinkedIn helpers.
 *
 * Photos are loaded by the **browser** directly from `unavatar.io/linkedin/<slug>`
 * (see `SubjectAvatar`); the server never downloads or caches images. These
 * helpers only normalize a pasted URL and build the avatar URL.
 */

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

/** Convenience: a pasted LinkedIn URL → unavatar avatar URL (or null). */
export function linkedinAvatarUrl(raw: string | null | undefined): string | null {
  const parsed = parseLinkedinUrl(raw);
  return parsed ? unavatarUrl(parsed.slug) : null;
}
