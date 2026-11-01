/**
 * Reusable UML diagram tool.
 *
 * Wraps `diagram.ts` (spec inference + SVG/PNG rendering) behind a single
 * entry point that any activity can call, independent of the template-fill /
 * docx path. Used by the `uml_diagram` ability and by the `/api/diagram`
 * endpoint, and (indirectly) by the docx export.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  generateDiagramSpec,
  generateDiagramSpecFromText,
  renderDiagramPng,
  renderUseCaseSvg,
  type DiagramSpec,
} from "./diagram.js";
import { assist } from "./paths.js";
import { parseUseCases, type UseCase } from "./usecase.js";
import type { AiConfig, Exercise } from "./types.js";

const DIAGRAM_VERSION = "2";

export interface DiagramArtifact {
  spec: DiagramSpec;
  svg: string;
  /** Rasterized PNG, only when explicitly requested (Playwright is slow). */
  png: Buffer | null;
}

/** True when the activity text mentions a diagram/UML/use-case diagram. */
export function diagramRequested(text: string): boolean {
  return /\bdiagrama\b|\buml\b|\bdiagrama de caso/i.test(text ?? "");
}

/** A single synthetic case so a diagram can be inferred from free-form text. */
function syntheticCases(e: Exercise, draft: string): UseCase[] {
  return [
    {
      id: "UC-01",
      name: e.title || "Sistema",
      fields: { "fluxo principal": draft },
    },
  ];
}

function specCacheDir(): string {
  return assist("data", "diagrams", "specs");
}

function specCacheKey(
  cfg: AiConfig,
  e: Exercise,
  text: string,
  system: string,
  strategy: "structured" | "forced" | "synthetic",
): string {
  return createHash("sha256")
    .update(
      [
        DIAGRAM_VERSION,
        cfg.models.diagram,
        String(e.id),
        system,
        strategy,
        text,
      ].join("\n"),
    )
    .digest("hex");
}

function readCachedSpec(key: string): DiagramSpec | null {
  const file = path.join(specCacheDir(), `${key}.json`);
  if (!existsSync(file)) return null;
  try {
    const data = JSON.parse(readFileSync(file, "utf-8")) as DiagramSpec;
    return Array.isArray(data.useCases) && data.useCases.length ? data : null;
  } catch {
    return null;
  }
}

function writeCachedSpec(key: string, spec: DiagramSpec): void {
  try {
    mkdirSync(specCacheDir(), { recursive: true });
    writeFileSync(path.join(specCacheDir(), `${key}.json`), JSON.stringify(spec), "utf-8");
  } catch {
    /* cache is best-effort */
  }
}

/**
 * Build a diagram artifact from a draft.
 *
 * - Parsed use cases (template fills) use the structured spec path.
 * - `force` (ability enabled) builds a spec from the activity + draft even when
 *   no UC blocks exist.
 * - Without `force`, only activities that actually ask for a diagram fall back
 *   to a synthetic case, so we never invent one on a hunch.
 *
 * The spec is cached by content, so previewing and sending reuse the same
 * diagram. Never throws for a rendering failure (PNG is best-effort).
 */
export async function buildDiagram(
  cfg: AiConfig,
  e: Exercise,
  draft: string,
  opts: { systemName?: string; png?: boolean; force?: boolean } = {},
): Promise<DiagramArtifact | null> {
  const text = (draft ?? "").trim();
  if (!text) return null;
  const parsed = parseUseCases(text);
  const force = opts.force === true;
  const activityText = `${e.title}\n${e.instructionsText}`;
  if (!parsed.length && !force && !diagramRequested(activityText)) return null;

  const system = (opts.systemName ?? "").trim() || e.courseName;
  const strategy = parsed.length ? "structured" : force ? "forced" : "synthetic";
  const cacheKey = specCacheKey(cfg, e, `${activityText}\n---\n${text}`, system, strategy);
  let spec = readCachedSpec(cacheKey);

  if (!spec) {
    if (parsed.length) {
      spec = await generateDiagramSpec(cfg, parsed, system);
    } else if (force) {
      spec = await generateDiagramSpecFromText(cfg, activityText, text, system);
    } else {
      spec = await generateDiagramSpec(cfg, syntheticCases(e, text), system);
    }
    if (!spec) return null;
    writeCachedSpec(cacheKey, spec);
  }

  const svg = renderUseCaseSvg(spec);
  const png = opts.png ? await renderDiagramPng(spec).catch(() => null) : null;
  return { spec, svg, png };
}
