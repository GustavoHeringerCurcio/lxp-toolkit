/**
 * Human-facing text helpers for generated filenames and document titles.
 *
 * Portal activity titles sometimes carry URL/encoded separators (e.g.
 * "ATIVADE_X_Y_Z"), and the upload base name used to join the student name with
 * `_`. Both made a generated PDF look machine-made. These helpers normalize the
 * *display* name only; the canonical activity title in the database is never
 * changed (gradebook/hidden topic matching depends on it).
 */

/** Decode %-escapes without throwing on malformed input. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Human-readable activity title: decode URL escapes and turn `_` separators
 * into spaces, collapsing runs of whitespace.
 */
export function humanizeActivityTitle(title: string | null | undefined): string {
  return safeDecode(title ?? "")
    .replace(/%20/gi, " ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * `<name> - <activity>` base name used for uploaded files and the PDF title.
 * Falls back to whichever part is present (never returns a bare separator).
 */
export function composeUploadBaseName(
  name: string | null | undefined,
  title: string | null | undefined,
): string {
  return [name?.trim() ?? "", humanizeActivityTitle(title)]
    .filter(Boolean)
    .join(" - ");
}
