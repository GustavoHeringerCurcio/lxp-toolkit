import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActivityProject: vi.fn(),
  getModuleProjectDefault: vi.fn(),
  getProjectSource: vi.fn(),
  saveActivityProject: vi.fn(),
  detectActivityRelevance: vi.fn(),
  buildExternalProjectBlock: vi.fn(),
}));

vi.mock("../src/store.js", () => ({
  getActivityProject: mocks.getActivityProject,
  getModuleProjectDefault: mocks.getModuleProjectDefault,
  getProjectSource: mocks.getProjectSource,
  saveActivityProject: mocks.saveActivityProject,
}));
vi.mock("../src/ai.js", () => ({ detectActivityRelevance: mocks.detectActivityRelevance }));
vi.mock("../src/project-source.js", () => ({
  buildExternalProjectBlock: mocks.buildExternalProjectBlock,
}));

import {
  activityContentHash,
  composeEffectiveInstructions,
  detectActivityTemplate,
  projectFormatHint,
  projectSignal,
  resolveProjectContext,
  resolveProjectEnabled,
  resolveProjectOrigin,
} from "../src/project-context.js";
import type { Exercise } from "../src/types.js";

function exercise(partial: Partial<Exercise> = {}): Exercise {
  return {
    id: 1,
    title: "Atividade",
    instructionsText: "",
    remoteFiles: [],
    moduleId: 10,
    ...partial,
  } as unknown as Exercise;
}

const SOURCE = {
  title: "FastAid",
  githubUrl: "https://github.com/x/fastaid",
  notes: "site de primeiros socorros",
  readmeText: "",
  readmeStatus: "none",
  readmeFetchedAt: null,
  updatedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getActivityProject.mockResolvedValue(null);
  mocks.getModuleProjectDefault.mockResolvedValue(false);
  mocks.getProjectSource.mockResolvedValue(SOURCE);
  mocks.buildExternalProjectBlock.mockResolvedValue("Contexto do projeto do aluno: FastAid.");
  mocks.saveActivityProject.mockResolvedValue({});
  mocks.detectActivityRelevance.mockResolvedValue({
    needsProject: true,
    wantsTemplate: true,
    templateFields: ["Ator", "Caso de uso"],
    confidence: 0.9,
    intent: "documentar casos de uso",
    reason: "template",
    proposed: null,
    model: "gpt-5-nano",
  });
});

describe("project switch precedence", () => {
  it("activity override wins over the module default", () => {
    expect(resolveProjectEnabled(false, true)).toBe(false);
    expect(resolveProjectEnabled(true, false)).toBe(true);
    expect(resolveProjectOrigin(false, true)).toBe("activity");
  });

  it("inherits the module default when there is no override", () => {
    expect(resolveProjectEnabled(null, true)).toBe(true);
    expect(resolveProjectEnabled(null, false)).toBe(false);
    expect(resolveProjectOrigin(null, true)).toBe("module");
    expect(resolveProjectOrigin(null, false)).toBe("off");
  });
});

describe("resolveProjectContext", () => {
  it("injects the external project when the activity opts in", async () => {
    mocks.getActivityProject.mockResolvedValue({ useProject: true });
    const out = await resolveProjectContext(exercise());
    expect(out).toMatchObject({ enabled: true, origin: "activity", configured: true });
    expect(out.external).toContain("FastAid");
  });

  it("inherits the module default", async () => {
    mocks.getModuleProjectDefault.mockResolvedValue(true);
    const out = await resolveProjectContext(exercise());
    expect(out).toMatchObject({ enabled: true, origin: "module" });
  });

  it("does not inject when disabled", async () => {
    mocks.getModuleProjectDefault.mockResolvedValue(true);
    mocks.getActivityProject.mockResolvedValue({ useProject: false });
    const out = await resolveProjectContext(exercise());
    expect(out).toMatchObject({ enabled: false, origin: "activity" });
    expect(out.external).toBe("");
  });

  it("reports enabled but unconfigured when the external block is empty", async () => {
    mocks.getActivityProject.mockResolvedValue({ useProject: true });
    mocks.buildExternalProjectBlock.mockResolvedValue("");
    const out = await resolveProjectContext(exercise());
    expect(out).toMatchObject({ enabled: true, configured: false, external: "" });
  });
});

describe("detectActivityTemplate", () => {
  it("uses the cached template fields for the same content hash", async () => {
    const e = exercise({ title: "Preencha a tabela do projeto" });
    mocks.getActivityProject.mockResolvedValue({
      contentHash: activityContentHash(e),
      wantsTemplate: true,
      templateFields: ["Campo A"],
    });
    const out = await detectActivityTemplate({} as never, e);
    expect(out).toEqual({ wantsTemplate: true, templateFields: ["Campo A"] });
    expect(mocks.detectActivityRelevance).not.toHaveBeenCalled();
  });

  it("detects and caches template fields when there is a signal", async () => {
    const e = exercise({ title: "Preencha a tabela do projeto" });
    const out = await detectActivityTemplate({} as never, e);
    expect(out).toEqual({ wantsTemplate: true, templateFields: ["Ator", "Caso de uso"] });
    expect(mocks.saveActivityProject).toHaveBeenCalledWith(
      e.id,
      expect.objectContaining({ wantsTemplate: true, contentHash: activityContentHash(e) }),
    );
  });

  it("skips the model when there is no signal", async () => {
    const out = await detectActivityTemplate({} as never, exercise({ title: "Qual a capital?" }));
    expect(out).toEqual({ wantsTemplate: false, templateFields: [] });
    expect(mocks.detectActivityRelevance).not.toHaveBeenCalled();
  });
});

describe("projectSignal", () => {
  it("detects strong and weak signals", () => {
    expect(projectSignal("Preencha a tabela do seu projeto")).toBe("strong");
    expect(projectSignal("Liste os requisitos")).toBe("weak");
    expect(projectSignal("Qual a capital da Franca?")).toBe("none");
  });
});

describe("composeEffectiveInstructions / projectFormatHint", () => {
  it("merges blocks and skips empty parts", () => {
    expect(composeEffectiveInstructions("Seja breve.", "", "Contexto: X.")).toBe(
      "Seja breve.\n\nContexto: X.",
    );
  });

  it("adds a markdown table hint for table-like activities", () => {
    const hint = projectFormatHint(exercise({ instructionsText: "Preencha a tabela abaixo" }));
    expect(hint).toContain("Markdown");
    expect(projectFormatHint(exercise({ instructionsText: "Comente o texto" }))).toBe("");
  });
});
