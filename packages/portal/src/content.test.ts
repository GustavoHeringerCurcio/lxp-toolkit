import { describe, expect, it, vi } from "vitest";
import {
  classify,
  harvestHiddenTopics,
  isDone,
  isMarkable,
  normalizeTitle,
  type ContentItem,
  type GradebookActivity,
} from "./content.js";
import type { ApiClient } from "./client.js";

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

function treeItem(id: number, title: string): ContentItem {
  return {
    courseId: 1,
    courseName: "Curso",
    moduleId: 900,
    moduleTitle: "Modulo",
    sectionId: 901,
    sectionTitle: "Secao",
    itemId: id,
    itemTitle: title,
    topicTypeId: 8,
    categoryTypeId: 5,
    kind: "file_upload",
    progressTypeId: 1,
    isRecordProgress: true,
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
    context: null,
    links: [],
  };
}

function topicDetail(overrides: {
  title: string;
  topicTypeId?: number;
  gradeBookId?: number | null;
  parentTopicId?: number;
  grandParentTopicId?: number;
}): unknown {
  return {
    context: {
      parentTopicId: overrides.parentTopicId ?? 901,
      parentTopicTitle: "Secao",
      grandParentTopicId: overrides.grandParentTopicId ?? 900,
      topicTypeId: overrides.topicTypeId ?? 8,
      gradeBookId: overrides.gradeBookId ?? null,
    },
    topics: [
      {
        id: 1,
        title: overrides.title,
        topicTypeId: overrides.topicTypeId ?? 8,
        categoryTypeId: 5,
        progressTypeId: 1,
        isRecordProgress: true,
        isVisible: true,
        isFuture: false,
        viewed: false,
        content: { html: "<p>enunciado</p>", hasFileUpload: true },
      },
    ],
  };
}

const GRADEBOOK: GradebookActivity[] = [
  {
    id: 500,
    name: "Oculto com nota",
    categoryId: 1,
    categoryName: "AVD1",
    topicTypeId: 8,
    categoryTypeId: 5,
    deadlineAt: "2026-05-16T02:59:00.000Z",
    isSubmited: false,
  },
];

describe("normalizeTitle", () => {
  it("ignora acentos, caixa e espaços", () => {
    expect(normalizeTitle("  Exercícios  de   BD ")).toBe("exercicios de bd");
  });
});

describe("harvestHiddenTopics", () => {
  it("recupera tópicos fora da árvore, deriva módulo/seção e enriquece o prazo pelo boletim", async () => {
    const get = vi.fn(async (path: string) => {
      if (path.endsWith("/topics/101")) {
        return { status: 200, data: topicDetail({ title: "Oculto com nota", gradeBookId: 500 }) };
      }
      if (path.endsWith("/topics/102")) throw new Error("GET -> 404");
      if (path.endsWith("/topics/103")) return { status: 200, data: topicDetail({ title: "Atividade A" }) };
      throw new Error(`unexpected ${path}`);
    });
    const client = { get } as unknown as ApiClient;

    const result = await harvestHiddenTopics(
      client,
      { id: 1, name: "Curso" },
      [treeItem(100, "Atividade A"), treeItem(104, "Atividade D")],
      GRADEBOOK,
      { margin: 0 },
    );

    expect(result.hidden).toHaveLength(2);
    const linked = result.hidden.find((h) => h.itemId === 101)!;
    expect(linked.origin).toBe("hidden");
    expect(linked.moduleId).toBe(900);
    expect(linked.sectionId).toBe(901);
    expect(linked.gradebookId).toBe(500);
    expect(linked.deadlineAt).toBe("2026-05-16T02:59:00.000Z");
    expect(linked.hasDeadline).toBe(true);
    expect(linked.duplicate).toBe(false);

    const dup = result.hidden.find((h) => h.itemId === 103)!;
    expect(dup.duplicate).toBe(true);
    expect(result.errors).toBe(1);
  });

  it("reusa itens já colhidos (não refaz o GET) e descarta os que agora estão na árvore", async () => {
    const get = vi.fn(async () => {
      throw new Error("should not fetch previous ids");
    });
    const client = { get } as unknown as ApiClient;

    const previous = [
      { ...treeItem(200, "Antigo oculto"), origin: "hidden" as const },
      { ...treeItem(100, "Atividade A"), origin: "hidden" as const },
    ];

    const result = await harvestHiddenTopics(
      client,
      { id: 1, name: "Curso" },
      [treeItem(100, "Atividade A"), treeItem(101, "Atividade B")],
      [],
      { margin: 0, previous },
    );

    expect(get).not.toHaveBeenCalled();
    expect(result.hidden.map((h) => h.itemId)).toEqual([200]);
  });
});
