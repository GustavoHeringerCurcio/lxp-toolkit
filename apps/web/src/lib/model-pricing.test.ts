import { describe, expect, it } from "vitest";
import {
  ESTIMATED_GENERATION_TOKENS,
  OPENAI_MODELS,
  estimateGenerationCostUsd,
  findModel,
  formatUsd,
  groupModels,
} from "./model-pricing";

describe("catálogo de modelos", () => {
  it("não tem ids duplicados e todo preço é positivo", () => {
    const ids = OPENAI_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of OPENAI_MODELS) {
      expect(m.input, m.id).toBeGreaterThan(0);
      expect(m.output, m.id).toBeGreaterThan(0);
    }
  });

  it("findModel resolve ids conhecidos e ignora desconhecidos", () => {
    expect(findModel("gpt-4o")?.label).toBe("GPT-4o");
    expect(findModel("modelo-inexistente")).toBeUndefined();
  });

  it("groupModels preserva todos os modelos e a ordem das famílias", () => {
    const groups = groupModels();
    const flat = groups.flatMap((g) => g.models);
    expect(flat).toHaveLength(OPENAI_MODELS.length);
    expect(groups[0].group).toBe("GPT-5.6");
    expect(flat[0].id).toBe("gpt-5.6-sol");
  });
});

describe("estimateGenerationCostUsd", () => {
  it("calcula o custo a partir dos tokens de entrada e saída", () => {
    const cost = estimateGenerationCostUsd("gpt-4o");
    const expected =
      (ESTIMATED_GENERATION_TOKENS.input / 1_000_000) * 2.5 +
      (ESTIMATED_GENERATION_TOKENS.output / 1_000_000) * 10;
    expect(cost).toBeCloseTo(expected, 10);
  });

  it("modelos mais baratos custam menos que os mais caros", () => {
    const nano = estimateGenerationCostUsd("gpt-5-nano") as number;
    const sol = estimateGenerationCostUsd("gpt-5.6-sol") as number;
    expect(nano).toBeGreaterThan(0);
    expect(nano).toBeLessThan(sol);
  });

  it("retorna null para modelo desconhecido", () => {
    expect(estimateGenerationCostUsd("modelo-inexistente")).toBeNull();
  });
});

describe("formatUsd", () => {
  it("mostra centavos para preços por token", () => {
    expect(formatUsd(2.5, "en-US")).toBe("$2.50");
    expect(formatUsd(10, "en-US")).toBe("$10.00");
  });

  it("mantém precisão para estimativas abaixo de um centavo", () => {
    expect(formatUsd(0.000625, "en-US")).toContain("0.0006");
  });
});
