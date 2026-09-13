import { describe, expect, it } from "vitest";
import { activityBadge, BADGE_TONE_CLS } from "./kind";
import type { Anomaly, ContentKind, ExerciseKind } from "@/types";

function info(
  kind: ExerciseKind,
  contentKind: ContentKind,
  anomalies: Anomaly[] = [],
  isSurvey = false,
) {
  return activityBadge({ kind, contentKind, isSurvey, anomalies });
}

describe("activityBadge", () => {
  it("tarefa normal → tipo + 'Com pergunta', neutro", () => {
    const b = info("upload", "file_upload");
    expect(b.typeKey).toBe("kind.upload.short");
    expect(b.stateKey).toBe("badgeState.questionTask");
    expect(b.tone).toBe("none");
  });

  it("tarefa ghost → 'Sem pergunta' em erro (vermelho)", () => {
    const b = info("upload", "file_upload", [{ code: "ghost", severity: "error" }]);
    expect(b.stateKey).toBe("badgeState.ghostTask");
    expect(b.tone).toBe("error");
    expect(BADGE_TONE_CLS[b.tone]).toContain("late");
  });

  it("tarefa print → 'Print' em aviso (âmbar)", () => {
    const b = info("upload", "file_upload", [{ code: "print", severity: "warn" }]);
    expect(b.stateKey).toBe("badgeState.print");
    expect(b.tone).toBe("warn");
    expect(BADGE_TONE_CLS[b.tone]).toContain("soon");
  });

  it("quiz normal → 'Com perguntas'", () => {
    expect(info("quiz", "quiz").stateKey).toBe("badgeState.questionQuiz");
  });

  it("quiz ghost → 'Sem perguntas' em erro", () => {
    const b = info("quiz", "quiz", [{ code: "ghost", severity: "error" }]);
    expect(b.stateKey).toBe("badgeState.ghostQuiz");
    expect(b.tone).toBe("error");
  });

  it("fórum → só o tipo, sem estado", () => {
    const b = info("forum", "forum");
    expect(b.typeKey).toBe("kind.forum.short");
    expect(b.stateKey).toBeNull();
    expect(b.tone).toBe("none");
  });

  it("leitura (mark) → só o conteúdo", () => {
    const b = info("mark", "pdf");
    expect(b.typeKey).toBe("content.pdf");
    expect(b.stateKey).toBeNull();
  });

  it("pesquisa → rótulo próprio, sem estado", () => {
    const b = info("quiz", "quiz", [], true);
    expect(b.typeKey).toBe("badge.survey");
    expect(b.stateKey).toBeNull();
  });

  it("anomalia desconhecida não quebra (neutro)", () => {
    const b = info("upload", "file_upload", []);
    expect(b.tone).toBe("none");
    expect(BADGE_TONE_CLS[b.tone]).not.toContain("late");
  });
});
