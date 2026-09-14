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
      // A numbered step, including an alternative-flow anchor ("3a. ..."),
      // must never be mistaken for a "Campo: valor" line.
      const isStep = /^\s*\d+\s*[a-z]?\s*[.)]/i.test(field[1]);
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

/** Today's date as `dd/mm/aaaa` (local time). */
export function formatDateBr(now: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
}

/**
 * Prompt contract for a generic "fill the professor's template" activity. The
 * field labels are the ones the cheap detection model extracted from the
 * activity content; when empty, the model is told to follow the model it finds
 * in the enunciado. Output stays plain text (no Markdown table) so the draft
 * reads like a normal answer while still being parseable for the .docx fill.
 */
export function buildTemplateFillContract(fields: string[] = [], today?: string): string {
  const list = fields.map((f) => f.trim()).filter(Boolean);
  return (
    "O professor pede para preencher um modelo/tabela. Preencha o modelo para CADA item identificado " +
    '(por exemplo, um caso de uso por bloco). Comece cada bloco com uma linha "UC-01 — <nome do item>" ' +
    "(numere UC-01, UC-02, ...). Em seguida, escreva uma linha por campo no formato \"<Campo>: <valor>\"." +
    (list.length
      ? ` Use exatamente estes campos, nesta ordem: ${list.join("; ")}.`
      : " Use os campos do modelo apresentado no enunciado, na ordem em que aparecem.") +
    (today ? ` No campo "Data", use a data de hoje: ${today}.` : "") +
    " Em campos com vários passos (ex.: fluxos), liste cada passo em uma linha numerada." +
    " Preencha todos os campos e não invente campos novos. Responda em texto simples, sem tabela Markdown." +
    " Regras de qualidade obrigatórias:" +
    " cada item deve ter um ator real, um objetivo concreto e um fluxo principal com pelo menos 2 passos;" +
    ' em fluxos alternativos/exceções, cada exceção deve começar com o número do passo do fluxo principal que falhou (ex.: "3a." para uma falha no passo 3);' +
    " as pós-condições não podem contradizer as observações, regras de negócio ou requisitos;" +
    " use os mesmos atores e a mesma terminologia em todos os itens;" +
    " baseie todo o conteúdo no contexto do projeto fornecido — nunca troque por outro domínio inventado."
  );
}

/**
 * Force the "Data" field of a generated template answer to today's date, so a
 * model guess can never leak a wrong year into the draft. Matches lines like
 * `Data: 05/10/2023`, `Data (dd/mm/aaaa): …` or `- Data: …`.
 */
export function forceTodayDate(text: string, now: Date = new Date()): string {
  const today = formatDateBr(now);
  return text.replace(/^([ \t>*-]*Data(?:\s*\([^)]*\))?\s*:\s*).*$/gim, `$1${today}`);
}

/** A field value that is empty or still a template placeholder, e.g. "(dd/mm/aaaa)". */
function isBlankOrPlaceholder(value: string | undefined): boolean {
  const v = (value ?? "").trim();
  return v === "" || v === "." || /^\(.*\)$/.test(v);
}

/**
 * Fill the template's fixed metadata (Autor/Data/Versão) when the model left it
 * blank or as a placeholder, so the generated document is ready to submit.
 */
export function applyTemplateDefaults(
  cases: UseCase[],
  profile: { nome?: string } = {},
  now: Date = new Date(),
): UseCase[] {
  const date = formatDateBr(now);
  const defaults: Record<string, string> = {
    autor: profile.nome?.trim() ?? "",
    versao: "1.0",
  };
  return cases.map((c) => {
    const fields = { ...c.fields };
    for (const [key, value] of Object.entries(defaults)) {
      if (value && isBlankOrPlaceholder(fields[key])) fields[key] = value;
    }
    // The document date is always today, never a date the model guessed.
    fields["data"] = date;
    return { ...c, fields };
  });
}
