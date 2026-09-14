import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { cheapJsonCompletion } from "./ai.js";
import { assist } from "./paths.js";
import { useCaseName, type UseCase } from "./usecase.js";
import type { AiConfig } from "./types.js";

/**
 * UML use-case diagram: a JSON model inferred from the filled use cases, a
 * deterministic SVG renderer, and a PNG rasterizer (Playwright). The diagram is
 * embedded into the generated `.docx`.
 */

export interface DiagramUseCase {
  name: string;
  actors: string[];
  includes: string[];
  extends: string[];
}

export interface DiagramSpec {
  /** System boundary label. */
  system: string;
  actors: string[];
  useCases: DiagramUseCase[];
}

/**
 * Look up a field by its normalized label, tolerating longer template variants
 * (e.g. "Fluxo Principal (Cenário de Sucesso)" for "fluxo principal").
 */
function fieldByPrefix(fields: Record<string, string>, prefix: string): string {
  const exact = fields[prefix];
  if (exact != null) return exact;
  const key = Object.keys(fields).find((k) => k.startsWith(prefix));
  return key ? fields[key] : "";
}

function splitList(value: string): string[] {
  return value
    .split(/[,;\n]/)
    .map((s) => s.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.toLowerCase();
    if (v && !seen.has(key)) {
      seen.add(key);
      out.push(v);
    }
  }
  return out;
}

/**
 * Deterministic spec from the parsed cases: use case name + its "Atores" field.
 * Always available, so a diagram can be produced even without the model.
 */
export function specFromUseCases(cases: UseCase[], system: string): DiagramSpec {
  const useCases: DiagramUseCase[] = cases.map((c) => ({
    name: useCaseName(c),
    actors: splitList(fieldByPrefix(c.fields, "atores")),
    includes: [],
    extends: [],
  }));
  return {
    system,
    actors: unique(useCases.flatMap((u) => u.actors)),
    useCases,
  };
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.map((i) => String(i).trim()).filter(Boolean) : [];
}

function coerceSpec(raw: unknown): DiagramSpec | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const useCases = (Array.isArray(o.useCases) ? o.useCases : [])
    .map((u) => {
      const r = (u ?? {}) as Record<string, unknown>;
      return {
        name: typeof r.name === "string" ? r.name.trim() : "",
        actors: strArr(r.actors),
        includes: strArr(r.includes),
        extends: strArr(r.extends),
      };
    })
    .filter((u) => u.name);
  if (!useCases.length) return null;
  return {
    system: typeof o.system === "string" ? o.system.trim() : "",
    actors: unique([...strArr(o.actors), ...useCases.flatMap((u) => u.actors)]),
    useCases,
  };
}

/** Merge the model's spec over the deterministic fallback (union of actors/cases). */
function mergeSpec(primary: DiagramSpec, fallback: DiagramSpec): DiagramSpec {
  const byName = new Map(primary.useCases.map((u) => [u.name.toLowerCase(), u]));
  for (const u of fallback.useCases) {
    const key = u.name.toLowerCase();
    if (!byName.has(key)) byName.set(key, u);
    else {
      const existing = byName.get(key)!;
      existing.actors = unique([...existing.actors, ...u.actors]);
    }
  }
  return {
    system: primary.system || fallback.system,
    actors: unique([...primary.actors, ...fallback.actors]),
    useCases: [...byName.values()],
  };
}

// ── Deterministic include/extend derivation ─────────────────────────────────

/** Verb conjugations that mark a mandatory, reusable system action (include). */
const INCLUDE_VERBS: [RegExp, string][] = [
  [/valid\w*/i, "Validar"],
  [/verific\w*/i, "Verificar"],
  [/confirm\w*/i, "Confirmar"],
  [/autentic\w*/i, "Autenticar"],
  [/calcul\w*/i, "Calcular"],
  [/consult\w*/i, "Consultar"],
  [/chec\w*/i, "Checar"],
  [/registr\w*/i, "Registrar"],
  [/selecion\w*/i, "Selecionar"],
  [/busc\w*/i, "Buscar"],
];

/** Verb conjugations that mark an optional/conditional action (extend). */
const EXTEND_VERBS: [RegExp, string][] = [
  [/exib\w*/i, "Exibir"],
  [/envi\w*/i, "Enviar"],
  [/notific\w*/i, "Notificar"],
  [/avis\w*/i, "Avisar"],
  [/mostr\w*/i, "Mostrar"],
  [/redirecion\w*/i, "Redirecionar"],
];

const LEADING_ARTICLE = /^(o|a|os|as|um|uma|uns|umas)\s+/i;

/** "O sistema valida as credenciais" + "Validar" → "Validar Credenciais". */
function relationName(prefix: string, rest: string): string {
  let obj = rest
    .replace(/^[\s,;:.\-]+/, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(LEADING_ARTICLE, "")
    .replace(/[.;:].*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!obj) return "";
  obj = obj.split(" ").slice(0, 4).join(" ");
  return `${prefix} ${obj.charAt(0).toUpperCase()}${obj.slice(1)}`;
}

export interface DerivedRelation {
  from: string;
  to: string;
  type: "include" | "extend";
}

/**
 * Derive include/extend relations from the flows themselves: mandatory
 * validation/consultation steps become `<<include>>`, conditional/optional
 * steps (usually in the exception flows) become `<<extend>>`. Grounded in the
 * text — never invents actors, only names use cases from the described actions.
 */
export function deriveRelations(cases: UseCase[]): DerivedRelation[] {
  const known = new Set(cases.map((c) => useCaseName(c).toLowerCase()));
  const relations: DerivedRelation[] = [];
  const add = (from: string, to: string, type: DerivedRelation["type"]): void => {
    if (!to || from.toLowerCase() === to.toLowerCase()) return;
    const key = `${from.toLowerCase()}|${to.toLowerCase()}|${type}`;
    if (relations.some((r) => `${r.from.toLowerCase()}|${r.to.toLowerCase()}|${r.type}` === key)) return;
    known.add(to.toLowerCase());
    relations.push({ from, to, type });
  };

  for (const c of cases) {
    const from = useCaseName(c);
    for (const step of fieldByPrefix(c.fields, "fluxo principal").split("\n")) {
      const body = step.replace(/^\s*\d+[.)]\s*/, "").trim();
      if (!body) continue;
      const hit = INCLUDE_VERBS.find(([re]) => re.test(body));
      if (!hit) continue;
      const m = body.match(hit[0]);
      if (!m || m.index == null) continue;
      const name = relationName(hit[1], body.slice(m.index + m[0].length));
      if (name) add(from, name, "include");
    }
    for (const step of fieldByPrefix(c.fields, "fluxos alternativos").split("\n")) {
      const body = step.replace(/^\s*\d+[a-z]?[.)]\s*/i, "").trim();
      if (!body) continue;
      const hit = EXTEND_VERBS.find(([re]) => re.test(body));
      if (!hit) continue;
      const m = body.match(hit[0]);
      if (!m || m.index == null) continue;
      const name = relationName(hit[1], body.slice(m.index + m[0].length));
      if (name) add(from, name, "extend");
    }
  }
  return relations;
}

/** Merge derived relations into the spec, creating the target use cases. */
function applyRelations(spec: DiagramSpec, relations: DerivedRelation[]): DiagramSpec {
  if (!relations.length) return spec;
  const byName = new Map(spec.useCases.map((u) => [u.name.toLowerCase(), u]));
  for (const rel of relations) {
    const source = byName.get(rel.from.toLowerCase());
    if (!source) continue;
    let target = byName.get(rel.to.toLowerCase());
    if (!target) {
      target = { name: rel.to, actors: [], includes: [], extends: [] };
      byName.set(rel.to.toLowerCase(), target);
    }
    const list = rel.type === "include" ? source.includes : source.extends;
    if (!list.some((n) => n.toLowerCase() === rel.to.toLowerCase())) list.push(rel.to);
  }
  return { ...spec, useCases: [...byName.values()] };
}

/** Infer a diagram spec from the filled cases (cheap model + fallback). */
export async function generateDiagramSpec(
  cfg: AiConfig,
  cases: UseCase[],
  system: string,
): Promise<DiagramSpec> {
  const fallback = specFromUseCases(cases, system);
  const sys =
    "Você monta o modelo de um DIAGRAMA DE CASO DE USO (UML) a partir das descrições. " +
    "Responda SOMENTE com um objeto JSON, sem texto ao redor, no formato " +
    '{"system": string, "actors": string[], "useCases": [{"name": string, "actors": string[], "includes": string[], "extends": string[]}]}. ' +
    "`actors` são os atores (pessoas ou sistemas externos); `useCases[].actors` são os atores ligados àquele caso; " +
    "`includes`/`extends` são NOMES de outros casos de uso ligados por <<include>>/<<extend>>. " +
    "Use os nomes exatamente como aparecem nas descrições e nunca invente atores que não apareçam nelas. " +
    "RELAÇÕES: quando um passo do fluxo for uma ação OBRIGATÓRIA e reutilizável (validar credenciais/dados, " +
    "verificar disponibilidade, calcular total, confirmar), crie um caso de uso separado e ligue com <<include>>. " +
    "Quando um passo for OPCIONAL ou CONDICIONAL (enviar notificação/lembrete, exibir aviso, ação extra), " +
    "crie um caso de uso separado e ligue com <<extend>>. " +
    "Se houver ao menos uma relação plausível, NÃO deixe includes/extends vazios.";
  const user = cases
    .map((c) => {
      const parts = [`Caso de uso: ${useCaseName(c)}`];
      const atores = fieldByPrefix(c.fields, "atores");
      const fluxo = fieldByPrefix(c.fields, "fluxo principal");
      const alt = fieldByPrefix(c.fields, "fluxos alternativos");
      if (atores) parts.push(`Atores: ${atores}`);
      if (fluxo) parts.push(`Fluxo principal:\n${fluxo}`);
      if (alt) parts.push(`Fluxos alternativos/exceções:\n${alt}`);
      return parts.join("\n");
    })
    .join("\n\n");

  const withRelations = (s: DiagramSpec): DiagramSpec => applyRelations(s, deriveRelations(cases));
  try {
    const { text } = await cheapJsonCompletion(cfg, sys, user, 900, cfg.models.diagram);
    const parsed = JSON.parse(text) as unknown;
    const spec = coerceSpec(parsed);
    if (spec) {
      const merged = mergeSpec(spec, fallback);
      // The caller-provided system name (the student's real project) always
      // wins over whatever the model guessed.
      const named = system.trim() ? { ...merged, system: system.trim() } : merged;
      return withRelations(named);
    }
  } catch {
    /* fall through to the deterministic spec */
  }
  return withRelations(fallback);
}

// ── SVG rendering ───────────────────────────────────────────────────────────

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function wrap(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if (`${cur} ${w}`.length <= maxChars) cur += ` ${w}`;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

function textBlock(cx: number, cy: number, lines: string[], size = 12): string {
  const tspans = lines
    .map(
      (l, i) =>
        `<tspan x="${cx}" dy="${i === 0 ? -((lines.length - 1) * (size + 2)) / 2 : size + 2}">${escapeXml(l)}</tspan>`,
    )
    .join("");
  return `<text x="${cx}" y="${cy}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${size}" fill="#111">${tspans}</text>`;
}

function actorGlyph(x: number, y: number, name: string): string {
  return (
    `<circle cx="${x}" cy="${y - 26}" r="8" fill="none" stroke="#333" stroke-width="1.5"/>` +
    `<line x1="${x}" y1="${y - 18}" x2="${x}" y2="${y + 2}" stroke="#333" stroke-width="1.5"/>` +
    `<line x1="${x - 12}" y1="${y - 12}" x2="${x + 12}" y2="${y - 12}" stroke="#333" stroke-width="1.5"/>` +
    `<line x1="${x}" y1="${y + 2}" x2="${x - 10}" y2="${y + 18}" stroke="#333" stroke-width="1.5"/>` +
    `<line x1="${x}" y1="${y + 2}" x2="${x + 10}" y2="${y + 18}" stroke="#333" stroke-width="1.5"/>` +
    `<text x="${x}" y="${y + 34}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="12" fill="#111">${escapeXml(name)}</text>`
  );
}

/**
 * Render the spec to a standalone SVG string. Layout: actors in a left column,
 * the system boundary with the use cases on the right, associations as solid
 * lines and include/extend as dashed labelled arrows.
 */
export function renderUseCaseSvg(spec: DiagramSpec): string {
  const useCases = spec.useCases.length ? spec.useCases : [{ name: "Sistema", actors: [], includes: [], extends: [] }];
  const actors = spec.actors.length ? spec.actors : ["Usuário"];

  const top = 50;
  const rowH = 78;
  const actorX = 90;
  const ucWidth = 360;
  const ucHeight = useCases.length * rowH;
  const boundaryX = 240;
  const boundaryW = ucWidth + 80;
  const ucCx = boundaryX + boundaryW / 2;
  const width = boundaryX + boundaryW + 40;
  const contentH = Math.max(ucHeight, actors.length * rowH);
  const height = top + contentH + 60;

  const ucY = (i: number): number => top + i * rowH + rowH / 2;
  const actorY = (i: number): number => top + (i + 0.5) * (contentH / actors.length);

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#555"/></marker></defs>`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`,
  );

  // System boundary.
  parts.push(
    `<rect x="${boundaryX}" y="${top - 24}" width="${boundaryW}" height="${ucHeight + 48}" rx="6" fill="none" stroke="#9aa3ad" stroke-width="1.5"/>`,
    `<text x="${boundaryX + 10}" y="${top - 8}" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="bold" fill="#555">${escapeXml(spec.system || "Sistema")}</text>`,
  );

  // Association lines (drawn under the shapes).
  const indexByName = new Map(useCases.map((u, i) => [u.name.toLowerCase(), i]));
  for (const [i, u] of useCases.entries()) {
    for (const actor of u.actors) {
      const ai = actors.findIndex((a) => a.toLowerCase() === actor.toLowerCase());
      if (ai < 0) continue;
      parts.push(
        `<line x1="${actorX + 14}" y1="${actorY(ai)}" x2="${ucCx - ucWidth / 2}" y2="${ucY(i)}" stroke="#333" stroke-width="1.3"/>`,
      );
    }
  }

  // include / extend dashed arrows between use cases.
  for (const [i, u] of useCases.entries()) {
    for (const [type, list] of [["include", u.includes], ["extend", u.extends]] as const) {
      for (const target of list) {
        const ti = indexByName.get(target.toLowerCase());
        if (ti == null || ti === i) continue;
        const y1 = ucY(i) + (ti > i ? rowH / 2 - 6 : -(rowH / 2 - 6));
        const y2 = ucY(ti) + (ti > i ? -(rowH / 2 - 6) : rowH / 2 - 6);
        parts.push(
          `<line x1="${ucCx}" y1="${y1}" x2="${ucCx}" y2="${y2}" stroke="#555" stroke-width="1.3" stroke-dasharray="5 4" marker-end="url(#arrow)"/>`,
          `<text x="${ucCx + 8}" y="${(y1 + y2) / 2}" font-family="Arial, Helvetica, sans-serif" font-size="11" fill="#555">&lt;&lt;${type}&gt;&gt;</text>`,
        );
      }
    }
  }

  // Actors.
  actors.forEach((a, i) => parts.push(actorGlyph(actorX, actorY(i), a)));

  // Use cases.
  useCases.forEach((u, i) => {
    parts.push(
      `<ellipse cx="${ucCx}" cy="${ucY(i)}" rx="${ucWidth / 2}" ry="${rowH / 2 - 12}" fill="#ffffff" stroke="#333" stroke-width="1.5"/>`,
      textBlock(ucCx, ucY(i), wrap(u.name, 34)),
    );
  });

  parts.push("</svg>");
  return parts.join("");
}

/** PNG dimensions must be known for the docx embedding; read the SVG size. */
function svgSize(svg: string): { width: number; height: number } {
  const w = Number(svg.match(/width="(\d+)"/)?.[1] ?? 900);
  const h = Number(svg.match(/height="(\d+)"/)?.[1] ?? 600);
  return { width: w, height: h };
}

async function svgToPng(svg: string): Promise<Buffer> {
  const { width, height } = svgSize(svg);
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 2,
    });
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">${svg}</body></html>`,
      { waitUntil: "load" },
    );
    const el = await page.$("svg");
    const shot = el ? await el.screenshot({ type: "png" }) : await page.screenshot({ type: "png" });
    return Buffer.from(shot);
  } finally {
    await browser.close();
  }
}

/**
 * Render the diagram to a cached PNG. Returns null when the browser isn't
 * available (the docx is still generated, just without the diagram).
 */
export async function renderDiagramPng(spec: DiagramSpec): Promise<Buffer | null> {
  const svg = renderUseCaseSvg(spec);
  const key = createHash("sha256").update(svg).digest("hex");
  const dir = assist("data", "diagrams");
  const out = path.join(dir, `${key}.png`);
  if (existsSync(out)) return readFileSync(out);
  try {
    const png = await svgToPng(svg);
    mkdirSync(dir, { recursive: true });
    writeFileSync(out, png);
    return png;
  } catch {
    return null;
  }
}
