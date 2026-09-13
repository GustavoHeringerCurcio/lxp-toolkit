/**
 * Hardcoded organization registry.
 *
 * `apps/server/config/organizations.json` maps each organization to a
 * manually-maintained professor → LinkedIn list. Nothing is scraped or fetched:
 * entries are matched to the local `professor` rows by name, and the avatar URL
 * is derived for the browser to load from unavatar (see `linkedin.ts`).
 *
 * The file is re-read on every call, so editing it takes effect immediately.
 */
import { existsSync, readFileSync } from "node:fs";
import { query } from "./db.js";
import { assist } from "./paths.js";
import { normalizeName } from "./professor.js";
import { linkedinAvatarUrl, parseLinkedinUrl } from "./linkedin.js";

export interface OrgProfessorEntry {
  name: string;
  linkedin: string;
  /** Optional stable pin (`professor.safea_user_id`). */
  professorId?: number;
}

export interface Organization {
  id: string;
  name: string;
  host: string | null;
  logo: string | null;
  professors: OrgProfessorEntry[];
}

export type OrgMatchConfidence = "exact" | "probable" | "none";

export interface OrgProfessorMatch {
  professorName: string;
  /** Matched `professor.safea_user_id`, or null. */
  professorId: number | null;
  /** Matched `professor.display_name`, or null. */
  displayName: string | null;
  linkedin: string;
  /** unavatar URL, or null when the LinkedIn URL is invalid. */
  photoUrl: string | null;
  confidence: OrgMatchConfidence;
  matched: boolean;
}

interface ProfessorRow {
  safea_user_id: string;
  display_name: string;
  full_name: string;
}

export interface ProfessorLite {
  id: number;
  display: string;
  full: string;
}

export function organizationsFile(): string {
  return assist("config", "organizations.json");
}

export function loadOrganizations(): Organization[] {
  const file = organizationsFile();
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, "utf-8")) as { organizations?: unknown };
    const list = Array.isArray(parsed.organizations) ? parsed.organizations : [];
    const out: Organization[] = [];
    for (const raw of list) {
      if (!raw || typeof raw !== "object") continue;
      const o = raw as Record<string, unknown>;
      if (typeof o.id !== "string" || typeof o.name !== "string") continue;
      const professors = Array.isArray(o.professors)
        ? o.professors.flatMap((p): OrgProfessorEntry[] => {
            if (!p || typeof p !== "object") return [];
            const e = p as Record<string, unknown>;
            if (typeof e.name !== "string" || typeof e.linkedin !== "string") return [];
            const entry: OrgProfessorEntry = { name: e.name, linkedin: e.linkedin };
            if (typeof e.professorId === "number") entry.professorId = e.professorId;
            return [entry];
          })
        : [];
      out.push({
        id: o.id,
        name: o.name,
        host: typeof o.host === "string" ? o.host : null,
        logo: typeof o.logo === "string" ? o.logo : null,
        professors,
      });
    }
    return out;
  } catch {
    return [];
  }
}

async function loadProfessors(): Promise<ProfessorLite[]> {
  const rows = await query<ProfessorRow>(
    "SELECT safea_user_id, display_name, full_name FROM professor",
  );
  return rows.map((r) => ({
    id: Number(r.safea_user_id),
    display: r.display_name,
    full: r.full_name,
  }));
}

function tokens(name: string): string[] {
  return normalizeName(name).split(" ").filter(Boolean);
}

function isTokenSubset(a: string[], b: string[]): boolean {
  if (a.length < 2 || b.length < a.length) return false;
  const set = new Set(b);
  return a.every((t) => set.has(t));
}

/** Exact normalized match first, then a conservative token-subset fallback. */
export function matchProfessorRow(
  entry: OrgProfessorEntry,
  professors: ProfessorLite[],
): { professor: ProfessorLite; confidence: OrgMatchConfidence } | null {
  if (entry.professorId != null) {
    const pinned = professors.find((p) => p.id === entry.professorId);
    if (pinned) return { professor: pinned, confidence: "exact" };
  }
  const key = normalizeName(entry.name);
  for (const p of professors) {
    if (normalizeName(p.display) === key || normalizeName(p.full) === key) {
      return { professor: p, confidence: "exact" };
    }
  }
  const entryTokens = tokens(entry.name);
  for (const p of professors) {
    if (isTokenSubset(entryTokens, tokens(p.display)) || isTokenSubset(tokens(p.display), entryTokens)) {
      return { professor: p, confidence: "probable" };
    }
  }
  return null;
}

/** Resolve every registry entry against the local professor rows. */
export async function matchOrganization(org: Organization): Promise<OrgProfessorMatch[]> {
  const professors = await loadProfessors();
  return org.professors.map((entry) => {
    const match = matchProfessorRow(entry, professors);
    const parsed = parseLinkedinUrl(entry.linkedin);
    return {
      professorName: entry.name,
      professorId: match?.professor.id ?? null,
      displayName: match?.professor.display ?? null,
      linkedin: parsed?.url ?? entry.linkedin,
      photoUrl: linkedinAvatarUrl(entry.linkedin),
      confidence: match?.confidence ?? "none",
      matched: Boolean(match),
    };
  });
}

export interface OrgDirectory {
  byId: Map<number, string>;
  byName: Map<string, string>;
}

/**
 * Flat index of registry avatars for the runtime projection. Personal links
 * (`professor_link`) still take precedence in `view.ts::enrich`.
 */
export async function buildOrgDirectory(): Promise<OrgDirectory> {
  const byId = new Map<number, string>();
  const byName = new Map<string, string>();
  const orgs = loadOrganizations();
  if (orgs.length === 0) return { byId, byName };

  const professors = await loadProfessors();
  for (const org of orgs) {
    for (const entry of org.professors) {
      const photoUrl = linkedinAvatarUrl(entry.linkedin);
      if (!photoUrl) continue;
      const match = matchProfessorRow(entry, professors);
      if (!match) continue;
      byId.set(match.professor.id, photoUrl);
      byName.set(normalizeName(match.professor.display), photoUrl);
      byName.set(normalizeName(match.professor.full), photoUrl);
    }
  }
  return { byId, byName };
}
