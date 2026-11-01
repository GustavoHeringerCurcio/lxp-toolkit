import { describe, expect, it } from "vitest";
import { gateForDraft, hashDraft } from "./gate";
import type { GateResultDto } from "@/types";

const draft = "Resposta do aluno.";

function gate(patch: Partial<GateResultDto> = {}): GateResultDto {
  return {
    verdict: "terrible",
    reason: "falta a tabela",
    model: "gpt-5-nano",
    draftHash: hashDraft(draft),
    ...patch,
  };
}

describe("gateForDraft", () => {
  it("returns the gate only when it matches the current draft", () => {
    expect(gateForDraft(gate(), draft)?.verdict).toBe("terrible");
    expect(gateForDraft(gate(), `${draft} editada`)).toBeNull();
    expect(gateForDraft(null, draft)).toBeNull();
  });
});
