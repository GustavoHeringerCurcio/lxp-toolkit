import { describe, expect, it } from "vitest";
import { classify, isDone, isMarkable } from "./content.js";

describe("classify", () => {
  it("mapeia tarefa e quizzes", () => {
    expect(classify(8, 1, false)).toBe("file_upload");
    expect(classify(15, 1, false)).toBe("quiz");
    expect(classify(29, 1, false)).toBe("quiz");
    expect(classify(30, 1, false)).toBe("quiz");
    expect(classify(37, 1, false)).toBe("quiz");
  });

  it("mapeia links e fóruns", () => {
    expect(classify(7, 1, false)).toBe("link");
    expect(classify(9, 1, false)).toBe("forum");
  });

  it("distingue leitura de pdf pelo tipo de progresso/anexo", () => {
    expect(classify(3, 1, true)).toBe("pdf");
    expect(classify(3, 1, false)).toBe("reading");
    expect(classify(3, 2, true)).toBe("reading");
  });

  it("cai em other para tipos desconhecidos", () => {
    expect(classify(10, 1, false)).toBe("other");
  });
});

describe("isDone", () => {
  it("considera progresso, tentativas, nota e visualização", () => {
    expect(isDone({ progressId: 1 })).toBe(true);
    expect(isDone({ hasCompletedAllAttempts: true })).toBe(true);
    expect(isDone({ grade: 0 })).toBe(true);
    expect(isDone({ viewed: true })).toBe(true);
  });

  it("não marca como concluído quando nada foi feito", () => {
    expect(isDone({})).toBe(false);
    expect(isDone({ hasCompletedAllAttempts: false, viewed: false })).toBe(false);
  });
});

describe("isMarkable", () => {
  it("permite marcar leituras/links pendentes que registram progresso", () => {
    expect(isMarkable({ kind: "reading", isRecordProgress: true, done: false })).toBe(true);
    expect(isMarkable({ kind: "link", isRecordProgress: true, done: false })).toBe(true);
  });

  it("bloqueia quizzes/tarefas e itens já concluídos", () => {
    expect(isMarkable({ kind: "quiz", isRecordProgress: true, done: false })).toBe(false);
    expect(isMarkable({ kind: "file_upload", isRecordProgress: true, done: false })).toBe(false);
    expect(isMarkable({ kind: "reading", isRecordProgress: true, done: true })).toBe(false);
    expect(isMarkable({ kind: "reading", isRecordProgress: false, done: false })).toBe(false);
  });
});
