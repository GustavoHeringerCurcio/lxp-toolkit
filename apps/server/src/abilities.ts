/**
 * AI abilities (tools/skills the model can use on a draft).
 *
 * An ability is a named, opt-in capability. It can be enabled globally in the
 * config and overridden per activity. This module is the single registry: adding
 * a new ability is one entry here plus its execution hook (see `diagram-tool.ts`
 * for `uml_diagram`), with no changes to the storage/UI plumbing.
 */
import type { AbilityId, AbilityMeta, AbilitySettings, AiConfig } from "./types.js";

export const ABILITY_REGISTRY: readonly AbilityMeta[] = [
  {
    id: "uml_diagram",
    label: "Diagrama UML",
    description:
      "Gera um diagrama de caso de uso (UML) a partir do rascunho. Útil quando a atividade pede um diagrama.",
    defaultOn: false,
  },
];

export function isAbilityId(value: unknown): value is AbilityId {
  return typeof value === "string" && ABILITY_REGISTRY.some((a) => a.id === value);
}

export function abilityMeta(id: AbilityId): AbilityMeta | undefined {
  return ABILITY_REGISTRY.find((a) => a.id === id);
}

/** Fresh defaults for every registered ability. */
export function defaultAbilities(): AbilitySettings {
  const out: AbilitySettings = {};
  for (const a of ABILITY_REGISTRY) out[a.id] = a.defaultOn;
  return out;
}

/** Merge a stored (possibly partial/legacy) settings blob over the defaults. */
export function mergeAbilities(raw: unknown): AbilitySettings {
  const base = defaultAbilities();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (isAbilityId(key) && typeof value === "boolean") base[key] = value;
  }
  return base;
}

/**
 * Whether an ability is enabled for an activity. A per-activity override always
 * wins over the global config default.
 */
export function abilityEnabled(
  cfg: AiConfig,
  ability: AbilityId,
  activityOverrides: Partial<Record<AbilityId, boolean>> = {},
): boolean {
  const override = activityOverrides[ability];
  if (typeof override === "boolean") return override;
  return cfg.abilities?.[ability] ?? defaultAbilities()[ability] ?? false;
}
