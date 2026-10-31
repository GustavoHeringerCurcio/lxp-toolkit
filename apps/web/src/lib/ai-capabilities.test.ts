import { describe, expect, it } from "vitest";
import { AI_CAPABILITIES, AI_CAPABILITY_GROUPS } from "./ai-capabilities";
import { pt } from "./i18n/pt";
import { en } from "./i18n/en";

const PT = pt as Record<string, string>;
const EN = en as Record<string, string>;

/**
 * Guards the "(i) O que a IA vê" modal against drift: every row added to the
 * registry must have PT + EN strings. If this fails, add the missing
 * `aiInfo.<id>.*` keys instead of deleting the row.
 */
describe("ai-capabilities", () => {
  it("cada grupo tem cabeçalho nos dois idiomas", () => {
    for (const group of AI_CAPABILITY_GROUPS) {
      expect(PT[group.headingKey]?.trim(), `pt ${group.headingKey}`).toBeTruthy();
      expect(EN[group.headingKey]?.trim(), `en ${group.headingKey}`).toBeTruthy();
    }
  });

  it("cada capacidade tem título e detalhe nos dois idiomas", () => {
    for (const cap of AI_CAPABILITIES) {
      for (const key of [`aiInfo.${cap.id}.title`, `aiInfo.${cap.id}.detail`]) {
        expect(PT[key]?.trim(), `pt ${key}`).toBeTruthy();
        expect(EN[key]?.trim(), `en ${key}`).toBeTruthy();
      }
    }
  });

  it("não há id duplicado", () => {
    const ids = AI_CAPABILITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
