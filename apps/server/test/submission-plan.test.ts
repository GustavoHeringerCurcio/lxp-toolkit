import { describe, expect, it } from "vitest";
import {
  describeSubmissionContract,
  describeSubmissionPlan,
  resolveSubmissionPlan,
} from "../src/submission-plan.js";
import type { AiConfig } from "../src/types.js";

function cfg(abilities: Record<string, boolean>): AiConfig {
  return { abilities } as unknown as AiConfig;
}

const upload = { kind: "upload", remoteFiles: [] };

describe("resolveSubmissionPlan", () => {
  it("uses plain text for a normal upload with no artifacts", () => {
    const plan = resolveSubmissionPlan(upload, cfg({ uml_diagram: false }));
    expect(plan).toMatchObject({ delivery: "text", diagram: false });
    expect(describeSubmissionPlan(plan)).toContain("Texto simples");
  });

  it("uses PDF and appends the UML page when the ability is enabled", () => {
    const plan = resolveSubmissionPlan(upload, cfg({ uml_diagram: true }));
    expect(plan).toMatchObject({ delivery: "pdf", diagram: true });
    expect(describeSubmissionPlan(plan)).toContain("diagrama UML");
  });

  it("respects a per-activity off override (global on)", () => {
    const plan = resolveSubmissionPlan(upload, cfg({ uml_diagram: true }), {
      uml_diagram: false,
    });
    expect(plan).toMatchObject({ delivery: "text", diagram: false });
  });

  it("prefers DOCX when the professor attached a model", () => {
    const plan = resolveSubmissionPlan(
      { kind: "upload", remoteFiles: [{ filename: "modelo.docx" }] },
      cfg({ uml_diagram: true }),
    );
    expect(plan).toMatchObject({ delivery: "docx", hasDocxTemplate: true, diagram: true });
    expect(describeSubmissionPlan(plan)).toContain("modelo do professor");
  });

  it("handles quiz/forum without a file format", () => {
    expect(resolveSubmissionPlan({ kind: "quiz" }, cfg({ uml_diagram: true })).delivery).toBe(
      "quiz",
    );
    expect(resolveSubmissionPlan({ kind: "forum" }, cfg({ uml_diagram: true })).delivery).toBe(
      "forum",
    );
  });
});

describe("describeSubmissionContract", () => {
  it("lists template fields and the project only when provided", () => {
    const plan = resolveSubmissionPlan(
      upload,
      cfg({ uml_diagram: false }),
      {},
      { wantsTemplate: true, templateFields: ["Entidade", "Atributos"] },
    );
    const contract = describeSubmissionContract(plan, { projectTitle: "FastAid" });
    expect(contract).toContain("Entidade, Atributos");
    expect(contract).toContain("FastAid");
    expect(describeSubmissionContract(plan, {})).not.toContain("FastAid");
  });
});
