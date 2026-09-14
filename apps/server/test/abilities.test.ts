import { describe, expect, it } from "vitest";
import {
  ABILITY_REGISTRY,
  abilityEnabled,
  defaultAbilities,
  isAbilityId,
  mergeAbilities,
} from "../src/abilities.js";
import type { AiConfig } from "../src/types.js";

function cfg(abilities: Record<string, boolean>): AiConfig {
  return { abilities } as unknown as AiConfig;
}

describe("ABILITY_REGISTRY", () => {
  it("has unique ids and registers uml_diagram", () => {
    const ids = ABILITY_REGISTRY.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("uml_diagram");
  });
});

describe("isAbilityId", () => {
  it("accepts only registered ids", () => {
    expect(isAbilityId("uml_diagram")).toBe(true);
    expect(isAbilityId("nao_existe")).toBe(false);
    expect(isAbilityId(42)).toBe(false);
    expect(isAbilityId(null)).toBe(false);
  });
});

describe("defaultAbilities", () => {
  it("covers every registered ability", () => {
    const defaults = defaultAbilities();
    for (const a of ABILITY_REGISTRY) expect(defaults[a.id]).toBe(a.defaultOn);
  });
});

describe("mergeAbilities", () => {
  it("keeps defaults and applies valid stored values", () => {
    const merged = mergeAbilities({ uml_diagram: true });
    expect(merged.uml_diagram).toBe(true);
  });

  it("ignores unknown ids and non-boolean values", () => {
    const merged = mergeAbilities({ uml_diagram: "yes", bogus: true, outro: 1 });
    expect(merged.uml_diagram).toBe(false);
    expect(merged).not.toHaveProperty("bogus");
    expect(merged).not.toHaveProperty("outro");
  });

  it("tolerates non-object input", () => {
    expect(mergeAbilities(null)).toEqual(defaultAbilities());
    expect(mergeAbilities("x")).toEqual(defaultAbilities());
  });
});

describe("abilityEnabled", () => {
  it("falls back to the global switch", () => {
    expect(abilityEnabled(cfg({ uml_diagram: true }), "uml_diagram")).toBe(true);
    expect(abilityEnabled(cfg({ uml_diagram: false }), "uml_diagram")).toBe(false);
  });

  it("lets a per-activity override win over the global switch", () => {
    expect(abilityEnabled(cfg({ uml_diagram: true }), "uml_diagram", { uml_diagram: false })).toBe(false);
    expect(abilityEnabled(cfg({ uml_diagram: false }), "uml_diagram", { uml_diagram: true })).toBe(true);
  });
});
