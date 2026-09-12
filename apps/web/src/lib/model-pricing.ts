/**
 * Curated OpenAI model catalog used by the settings dropdown.
 *
 * Prices are the Standard-tier list prices in **USD per 1M tokens** (source:
 * https://platform.openai.com/docs/pricing). They change over time — this is the
 * single place to update them. Model names are proper nouns and stay untranslated.
 */
export interface OpenAiModel {
  id: string;
  label: string;
  /** Language-neutral family label used as an `<optgroup>` heading. */
  group: string;
  /** USD per 1M input tokens. */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
  /** Sensible default for the Pauta answer workflow. */
  recommended?: boolean;
}

export const OPENAI_MODELS: OpenAiModel[] = [
  { id: "gpt-5.6-sol", label: "GPT-5.6 Sol", group: "GPT-5.6", input: 4.0, output: 20.0 },
  {
    id: "gpt-5.6-terra",
    label: "GPT-5.6 Terra",
    group: "GPT-5.6",
    input: 2.0,
    output: 12.0,
    recommended: true,
  },
  { id: "gpt-5.6-luna", label: "GPT-5.6 Luna", group: "GPT-5.6", input: 0.2, output: 1.2 },
  { id: "gpt-5.1", label: "GPT-5.1", group: "GPT-5", input: 1.25, output: 10.0 },
  { id: "gpt-5-mini", label: "GPT-5 mini", group: "GPT-5", input: 0.25, output: 2.0 },
  { id: "gpt-5-nano", label: "GPT-5 nano", group: "GPT-5", input: 0.05, output: 0.4 },
  { id: "gpt-4.1", label: "GPT-4.1", group: "GPT-4.1", input: 2.0, output: 8.0 },
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini", group: "GPT-4.1", input: 0.4, output: 1.6 },
  { id: "gpt-4.1-nano", label: "GPT-4.1 nano", group: "GPT-4.1", input: 0.1, output: 0.4 },
  { id: "gpt-4o", label: "GPT-4o", group: "GPT-4o", input: 2.5, output: 10.0 },
  { id: "gpt-4o-mini", label: "GPT-4o mini", group: "GPT-4o", input: 0.15, output: 0.6 },
  { id: "o3", label: "o3", group: "o-series", input: 2.0, output: 8.0 },
  { id: "o4-mini", label: "o4-mini", group: "o-series", input: 1.1, output: 4.4 },
];

/**
 * Average token usage of one "solve this activity" generation in Pauta: the
 * system style rules + the activity brief, attachments and questions on input,
 * and a typical draft on output. Real usage varies with the activity size.
 */
export const ESTIMATED_GENERATION_TOKENS = { input: 4500, output: 1000 } as const;

export function findModel(id: string): OpenAiModel | undefined {
  return OPENAI_MODELS.find((m) => m.id === id);
}

/** Estimated USD cost of one generation for `id`, or `null` for unknown models. */
export function estimateGenerationCostUsd(
  id: string,
  tokens: { input: number; output: number } = ESTIMATED_GENERATION_TOKENS,
): number | null {
  const m = findModel(id);
  if (!m) return null;
  return (tokens.input / 1_000_000) * m.input + (tokens.output / 1_000_000) * m.output;
}

/** Model catalog grouped by family, preserving declaration order. */
export function groupModels(
  models: OpenAiModel[] = OPENAI_MODELS,
): { group: string; models: OpenAiModel[] }[] {
  const groups: { group: string; models: OpenAiModel[] }[] = [];
  for (const m of models) {
    const existing = groups.find((g) => g.group === m.group);
    if (existing) existing.models.push(m);
    else groups.push({ group: m.group, models: [m] });
  }
  return groups;
}

/**
 * Format a USD amount with just enough decimals to stay meaningful: token list
 * prices show cents, while sub-cent estimates keep up to 5 decimals.
 */
export function formatUsd(value: number, locale = "en-US"): string {
  const abs = Math.abs(value);
  const maximumFractionDigits = abs === 0 ? 2 : abs < 0.01 ? 5 : abs < 1 ? 4 : 2;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits,
  }).format(value);
}
