/**
 * Reusable UML diagram tool.
 *
 * Wraps `diagram.ts` (spec inference + SVG/PNG rendering) behind a single
 * entry point that any activity can call, independent of the template-fill /
 * docx path. Used by the `uml_diagram` ability and by the `/api/diagram`
 * endpoint, and (indirectly) by the docx export.
 */
import { generateDiagramSpec, renderDiagramPng, renderUseCaseSvg, type DiagramSpec } from "./diagram.js";
import { parseUseCases, type UseCase } from "./usecase.js";
import type { AiConfig, Exercise } from "./types.js";

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

/**
 * Build a diagram artifact from a draft. Parses use cases when present,
 * otherwise falls back to a single synthetic case so any activity can produce
 * a diagram. Never throws for a rendering failure (PNG is best-effort).
 */
export async function buildDiagram(
  cfg: AiConfig,
  e: Exercise,
  draft: string,
  opts: { systemName?: string; png?: boolean } = {},
): Promise<DiagramArtifact | null> {
  const text = (draft ?? "").trim();
  if (!text) return null;
  const parsed = parseUseCases(text);
  const cases = parsed.length ? parsed : syntheticCases(e, text);
  const system = (opts.systemName ?? "").trim() || e.courseName;
  const spec = await generateDiagramSpec(cfg, cases, system);
  const svg = renderUseCaseSvg(spec);
  const png = opts.png ? await renderDiagramPng(spec).catch(() => null) : null;
  return { spec, svg, png };
}
