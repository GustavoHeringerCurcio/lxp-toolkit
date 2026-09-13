import { describe, expect, it } from "vitest";
import {
  buildProjectInstructionBlock,
  composeEffectiveInstructions,
  effectiveProfileFor,
  projectFormatHint,
  projectSignal,
} from "../src/project-context.js";
import type { ActivityProject, Exercise, ProjectProfile } from "../src/types.js";

function exercise(partial: Partial<Exercise>): Exercise {
  return {
    title: "",
    instructionsText: "",
    remoteFiles: [],
    ...partial,
  } as unknown as Exercise;
}

function mainProfile(partial: Partial<ProjectProfile> = {}): ProjectProfile {
  return {
    courseId: 1,
    theme: "Loja Virtual",
    atores: ["Cliente"],
    requisitos: ["Cadastrar produto"],
    suggestedThemes: [],
    source: "auto",
    confidence: 0.8,
    model: "gpt-5-nano",
    contentHash: null,
    updatedAt: "",
    ...partial,
  };
}

function activity(partial: Partial<ActivityProject> = {}): ActivityProject {
  return {
    contentItemId: 1,
    needsProject: true,
    wantsTemplate: false,
    templateFields: [],
    profileMode: "main",
    theme: null,
    atores: [],
    requisitos: [],
    confidence: 0.8,
    intent: null,
    reason: null,
    source: "auto",
    model: null,
    contentHash: null,
    updatedAt: "",
    ...partial,
  };
}

describe("projectSignal", () => {
  it("detects strong signals without the model", () => {
    expect(projectSignal("Preencha a tabela do seu projeto")).toBe("strong");
    expect(projectSignal("Descreva um caso de uso do seu sistema")).toBe("strong");
  });

  it("detects weak signals", () => {
    expect(projectSignal("Fale sobre o projeto da disciplina")).toBe("weak");
    expect(projectSignal("Liste os requisitos")).toBe("weak");
  });

  it("returns none for unrelated text", () => {
    expect(projectSignal("Qual a capital da França?")).toBe("none");
  });
});

describe("effectiveProfileFor", () => {
  it("uses the main project by default", () => {
    const eff = effectiveProfileFor(mainProfile(), activity());
    expect(eff).toEqual({
      theme: "Loja Virtual",
      atores: ["Cliente"],
      requisitos: ["Cadastrar produto"],
      origin: "main",
    });
  });

  it("uses the activity quick project when selected", () => {
    const eff = effectiveProfileFor(
      mainProfile(),
      activity({ profileMode: "activity", theme: "Biblioteca", atores: ["Bibliotecário"], requisitos: ["Emprestar livro"] }),
    );
    expect(eff).toMatchObject({ theme: "Biblioteca", origin: "activity" });
  });

  it("returns null when opted out or no main project", () => {
    expect(effectiveProfileFor(mainProfile(), activity({ profileMode: "none" }))).toBeNull();
    expect(effectiveProfileFor(null, activity())).toBeNull();
    expect(effectiveProfileFor(mainProfile(), activity({ needsProject: false }))).toBeNull();
  });
});

describe("buildProjectInstructionBlock", () => {
  it("renders theme, actors and requirements", () => {
    const block = buildProjectInstructionBlock({
      theme: "Loja Virtual",
      atores: ["Cliente", "Admin"],
      requisitos: ["Cadastrar produto"],
      origin: "main",
    });
    expect(block).toContain("Contexto do projeto: Loja Virtual.");
    expect(block).toContain("Atores: Cliente, Admin.");
    expect(block).toContain("- Cadastrar produto");
  });
});

describe("composeEffectiveInstructions", () => {
  it("merges the override with project and format blocks", () => {
    const merged = composeEffectiveInstructions("Seja breve.", "Contexto do projeto: X.", "Formato: tabela.");
    expect(merged).toBe("Seja breve.\n\nContexto do projeto: X.\n\nFormato: tabela.");
  });

  it("skips empty parts", () => {
    expect(composeEffectiveInstructions("", "", "Só isso.")).toBe("Só isso.");
  });
});

describe("projectFormatHint", () => {
  it("adds a markdown-table hint for table-like activities", () => {
    const hint = projectFormatHint(exercise({ title: "Caso de uso", instructionsText: "Preencha a tabela abaixo" }));
    expect(hint).toContain("Markdown");
  });

  it("is empty for unrelated activities", () => {
    expect(projectFormatHint(exercise({ title: "Fórum", instructionsText: "Comente sobre o texto" }))).toBe("");
  });
});
