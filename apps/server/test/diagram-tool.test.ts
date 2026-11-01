import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/ai.js", () => ({
  cheapJsonCompletion: vi.fn(),
}));

import { cheapJsonCompletion } from "../src/ai.js";
import { buildDiagram, diagramRequested } from "../src/diagram-tool.js";
import type { AiConfig } from "../src/types.js";
import { makeExercise } from "./helpers.js";

const CFG = {
  models: { diagram: "gpt-4o" },
  abilities: {},
} as unknown as AiConfig;

beforeEach(() => {
  vi.mocked(cheapJsonCompletion).mockReset();
});

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
      id: 880_001,
    });
    expect(await buildDiagram(CFG, exercise, "Um texto qualquer, sem casos de uso.")).toBeNull();
  });

  it("force builds a spec from free-form text when the ability is on", async () => {
    vi.mocked(cheapJsonCompletion).mockResolvedValue({
      text: JSON.stringify({
        system: "Biblioteca",
        actors: ["Aluno"],
        useCases: [
          {
            name: "Realizar empréstimo",
            actors: ["Aluno"],
            includes: ["Validar matrícula"],
            extends: [],
          },
          {
            name: "Validar matrícula",
            actors: ["Aluno"],
            includes: [],
            extends: [],
          },
        ],
      }),
      model: "gpt-4o",
    });
    const exercise = makeExercise({
      id: 880_002,
      title: "Sistema de biblioteca",
      instructionsText: "Descreva os casos de uso do sistema.",
    });
    const artifact = await buildDiagram(CFG, exercise, "O aluno pega um livro emprestado.", {
      force: true,
      systemName: "Biblioteca",
    });
    expect(artifact?.spec.actors).toContain("Aluno");
    expect(artifact?.spec.useCases).toHaveLength(2);
    expect(artifact?.svg).toContain("Realizar empréstimo");
  });
});
