/**
 * Stable professor identity.
 *
 * The portal gives us two things: a course-wide `context.teachers[]` list with
 * stable ids, and a per-module display string in the module title
 * ("Banco de Dados I - Profa. Débora Amorim"). We resolve the display string
 * against the authoritative teacher list so the app can key off `safeaUserId`
 * instead of a mutable, localized name.
 */

export interface Teacher {
  safeaUserId: number;
  userId: number | null;
  externalUserId: string | null;
  /** Raw portal name (may be padded / all-caps). */
  name: string;
}

export interface ProfessorMatch {
  professorId: number | null;
  confidence: number;
}

/** Normalize a name for matching: strip titles/accents/case and collapse spaces. */
export function normalizeName(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(prof|profa|professor|professora|dr|dra|me|ma)\b\.?/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Human display name from a raw portal full name ("DEBORA AMORIM DE CARVALHO"). */
export function toDisplayName(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** The `- Prof. Name` suffix of a module title, or null when absent. */
export function professorFromModuleTitle(moduleTitle: string): string | null {
  const m = moduleTitle.match(/^(.*?)\s+-\s+(Profa?\.\s*.*)$/i);
  return m ? m[2].trim() : null;
}

/**
 * Match a module title suffix ("Profa. Débora Amorim") against the course's
 * teachers ("DEBORA AMORIM DE CARVALHO"). Score is the fraction of meaningful
 * suffix tokens present in the teacher's normalized full name; we require at
 * least half to avoid false positives.
 */
export function matchProfessor(titleSuffix: string | null, teachers: Teacher[]): ProfessorMatch {
  if (!titleSuffix || teachers.length === 0) return { professorId: null, confidence: 0 };
  const tokens = normalizeName(titleSuffix)
    .split(" ")
    .filter((t) => t.length > 1);
  if (tokens.length === 0) return { professorId: null, confidence: 0 };

  let best: ProfessorMatch = { professorId: null, confidence: 0 };
  for (const teacher of teachers) {
    const hay = normalizeName(teacher.name);
    const hits = tokens.filter((tok) => hay.includes(tok)).length;
    const confidence = hits / tokens.length;
    if (confidence > best.confidence) {
      best = { professorId: teacher.safeaUserId, confidence };
    }
  }
  return best.confidence >= 0.5 ? best : { professorId: null, confidence: best.confidence };
}

/** Extract teachers from a topic `context` object (course-wide list). */
export function teachersFromContext(context: Record<string, unknown> | null | undefined): Teacher[] {
  const raw = context?.teachers;
  if (!Array.isArray(raw)) return [];
  const out: Teacher[] = [];
  for (const t of raw) {
    if (!t || typeof t !== "object") continue;
    const r = t as Record<string, unknown>;
    const id = Number(r.safeaUserId);
    if (!Number.isFinite(id)) continue;
    out.push({
      safeaUserId: id,
      userId: r.userId != null ? Number(r.userId) : null,
      externalUserId: r.externalUserId != null ? String(r.externalUserId) : null,
      name: String(r.name ?? "").trim(),
    });
  }
  return out;
}
