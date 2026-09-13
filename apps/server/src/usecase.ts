/**
 * Parsing for the structured "fill the professor's model" answer contract.
 *
 * The generation prompt asks the model to answer with one block per use case:
 *
 *   ## UC-01 — Realizar Agendamento de Consulta
 *   Identificador: UC-01
 *   Nome do Caso de Uso: Realizar Agendamento de Consulta
 *   ...
 *   Fluxo Principal:
 *   1. Recepcionista acessa o sistema
 *   2. Seleciona paciente
 *
 * `parseUseCases` turns that text into structured cases the DOCX builder can
 * pour into the original template.
 */

export interface UseCase {
  /** Normalized id, e.g. `UC-01`. */
  id: string;
  /** Name from the header (may be empty; fall back to the "Nome" field). */
  name: string;
  /** Field values keyed by `normalizeLabel(label)`. */
  fields: Record<string, string>;
}

/**
 * Normalize a field label for tolerant matching: accents, case, punctuation and
 * spacing are all removed ("Descrição / Objetivo" → "descricao objetivo").
 */
export function normalizeLabel(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const HEADER_RE = /^(UC[\s\-–—]*\d+)\b\s*[—–\-:.)]*\s*(.*)$/i;

function headerOf(line: string): { id: string; name: string } | null {
  const stripped = line.replace(/^[\s#*>]+/, "").replace(/[\s*_]+$/, "");
  const m = stripped.match(HEADER_RE);
  if (!m) return null;
  return { id: m[1].replace(/\s+/g, "").toUpperCase(), name: (m[2] ?? "").trim() };
}

/**
 * Parse a generated template answer into use cases. `templateLabels` are the
 * exact labels from the professor's model; only lines whose label matches one
 * of them are treated as fields (so numbered steps never get mistaken for
 * fields). When no labels are supplied, any non-numeric `Label: value` line is
 * accepted.
 */
export function parseUseCases(text: string, templateLabels: string[] = []): UseCase[] {
  if (!text || !text.trim()) return [];
  const known = new Set(templateLabels.map(normalizeLabel));
  const cases: UseCase[] = [];
  let current: UseCase | null = null;
  let lastField: string | null = null;

  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const header = headerOf(line);
    if (header) {
      current = { id: header.id, name: header.name, fields: {} };
      cases.push(current);
      lastField = null;
      continue;
    }
    if (!current) continue;

    const field = line.match(/^([^:\n]{1,80}?):\s*(.*)$/);
    if (field) {
      const key = normalizeLabel(field[1]);
      const isStep = /^\s*\d+[.)]/.test(field[1]);
      if (!isStep && (known.size === 0 || known.has(key))) {
        current.fields[key] = field[2].trim();
        lastField = key;
        continue;
      }
    }

    const continuation = line.trim();
    if (lastField && continuation) {
      const prev = current.fields[lastField];
      current.fields[lastField] = prev ? `${prev}\n${continuation}` : continuation;
    }
  }

  return cases.filter((c) => c.name || Object.keys(c.fields).length > 0);
}

/** The display name of a case: header name, else the "Nome" field, else the id. */
export function useCaseName(useCase: UseCase, nameLabel = "Nome do Caso de Uso"): string {
  return useCase.name || useCase.fields[normalizeLabel(nameLabel)] || useCase.id;
}
