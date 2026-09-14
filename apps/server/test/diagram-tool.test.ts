import { describe, expect, it } from "vitest";
import { buildDiagram, diagramRequested } from "../src/diagram-tool.js";
import type { AiConfig } from "../src/types.js";
import { makeExercise } from "./helpers.js";

const CFG = { models: {}, abilities: {} } as unknown as AiConfig;

describe("diagramRequested", () => {
  it("detects diagram/UML mentions", () => {
    expect(diagramRequested("Monte o diagrama de caso de uso")).toBe(true);
    expect(diagramRequested("Faça um diagrama UML")).toBe(true);
    expect(diagramRequested("Escreva uma redação sobre ética")).toBe(false);
    expect(diagramRequested("")).toBe(false);
  });
});

describe("buildDiagram", () => {
  it("returns null for an empty draft", async () => {
    expect(await buildDiagram(CFG, makeExercise(), "   ")).toBeNull();
  });

  it("returns null when the draft has no use cases and no diagram is requested", async () => {
    const exercise = makeExercise({
      title: "Redação",
      instructionsText: "Escreva um texto sobre X.",
    });
    expect(await buildDiagram(CFG, exercise, "Um texto qualquer, sem casos de uso.")).toBeNull();
  });
});
