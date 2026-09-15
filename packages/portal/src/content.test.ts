import { describe, expect, it } from "vitest";
import {
  reconcileGradebook,
  type ContentItem,
  type GradebookActivity,
} from "./content.js";

function item(
  overrides: Partial<ContentItem> & Pick<ContentItem, "itemId" | "itemTitle">,
): ContentItem {
  return {
    courseId: 5254272,
    courseName: "PROGRAMAÇÃO BACK-END",
    moduleId: 89611984,
    moduleTitle: "Banco de Dados I",
    sectionId: null,
    sectionTitle: null,
    topicTypeId: 3,
    categoryTypeId: null,
    kind: "reading",
    progressTypeId: 1,
    isRecordProgress: false,
    done: false,
    viewed: false,
    expired: false,
    hasDeadline: false,
    deadlineAt: null,
    hasCompletedAllAttempts: null,
    grade: null,
    studentGrade: null,
    attachments: [],
    html: null,
    content: null,
    context: { enrollmentId: 120887299 },
    links: [],
    ...overrides,
  };
}

function activity(
  overrides: Partial<GradebookActivity> & Pick<GradebookActivity, "id" | "name" | "topicTypeId">,
): GradebookActivity {
  return {
    categoryId: 5487000,
    categoryName: "Atividades Formativas 1",
    categoryTypeId: 5,
    deadlineAt: null,
    isSubmited: false,
    isDeadlineExpired: false,
    ...overrides,
  };
}

const course = { id: 5254272, name: "PROGRAMAÇÃO BACK-END" };

describe("reconcileGradebook", () => {
  it("adiciona atividade do boletim ausente na árvore como gradebook-only", () => {
    const items = [item({ itemId: 1, itemTitle: "Aula 1" })];
    const added = reconcileGradebook(course, items, [
      activity({
        id: 5487151,
        name: "BDI - Atividade 14",
        topicTypeId: 8,
        deadlineAt: "2026-09-16T00:30:00.000Z",
      }),
    ]);

    expect(added).toBe(1);
    expect(items).toHaveLength(2);
    const synthetic = items[1];
    expect(synthetic.itemId).toBe(-5487151);
    expect(synthetic.itemTitle).toBe("BDI - Atividade 14");
    expect(synthetic.origin).toBe("gradebook");
    expect(synthetic.topicAvailable).toBe(false);
    expect(synthetic.kind).toBe("file_upload");
    expect(synthetic.hasDeadline).toBe(true);
    expect(synthetic.deadlineAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(synthetic.moduleId).toBe(-5487000);
    expect(synthetic.moduleTitle).toBe("Atividades Formativas 1");
    expect(synthetic.context).toEqual({ enrollmentId: 120887299 });
    expect(synthetic.attachments).toEqual([]);
    expect(synthetic.content).toBeNull();
  });

  it("não duplica quando o título já existe (ignora caixa/acentos/espaços)", () => {
    const items = [item({ itemId: 1, itemTitle: "BDI - Atividade 14" })];
    const added = reconcileGradebook(course, items, [
      activity({ id: 2, name: "bdi  -  ATIVIDADE 14", topicTypeId: 8 }),
    ]);

    expect(added).toBe(0);
    expect(items).toHaveLength(1);
  });

  it("ignora tipos que não são conteúdo (ex.: 27 avaliação externa)", () => {
    const items: ContentItem[] = [];
    const added = reconcileGradebook(course, items, [
      activity({ id: 1, name: "AVD1 - SOMATIVA", topicTypeId: 27 }),
      activity({ id: 2, name: "BDI - Atividade 14", topicTypeId: 8 }),
    ]);

    expect(added).toBe(1);
    expect(items.map((i) => i.itemTitle)).toEqual(["BDI - Atividade 14"]);
  });

  it("preserva done/expired e classifica quizzes", () => {
    const items: ContentItem[] = [];
    reconcileGradebook(course, items, [
      activity({
        id: 5487159,
        name: "ARS - Formativa 1 - AVD2",
        topicTypeId: 15,
        isSubmited: true,
        isDeadlineExpired: true,
      }),
    ]);

    const synthetic = items[0];
    expect(synthetic.kind).toBe("quiz");
    expect(synthetic.done).toBe(true);
    expect(synthetic.expired).toBe(true);
  });

  it("é idempotente: a segunda chamada não adiciona nada", () => {
    const items: ContentItem[] = [];
    const acts = [activity({ id: 5487151, name: "BDI - Atividade 14", topicTypeId: 8 })];
    expect(reconcileGradebook(course, items, acts)).toBe(1);
    expect(reconcileGradebook(course, items, acts)).toBe(0);
    expect(items).toHaveLength(1);
  });

  it("sem enrollment no contexto, mantém context null", () => {
    const items = [item({ itemId: 1, itemTitle: "Aula 1", context: null })];
    reconcileGradebook(course, items, [
      activity({ id: 5, name: "Nova tarefa", topicTypeId: 8 }),
    ]);

    expect(items[1].context).toBeNull();
  });

  it("sem categoria, agrupa sob um módulo sintético do curso", () => {
    const items: ContentItem[] = [];
    reconcileGradebook(course, items, [
      activity({ id: 7, name: "Tarefa solta", topicTypeId: 8, categoryId: 0, categoryName: "" }),
    ]);

    expect(items[0].moduleId).toBe(-course.id);
    expect(items[0].moduleTitle).toBe("Atividades no portal");
  });
});
