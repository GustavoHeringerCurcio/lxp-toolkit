import { describe, expect, it, vi } from "vitest";
import {
  classify,
  collectContent,
  harvestHiddenTopics,
  isDone,
  isMarkable,
  normalizeCourseProgress,
  normalizeTitle,
  retainedHiddenItems,
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

describe("normalizeCourseProgress", () => {
  it("aceita percentual inteiro, fracao e string", () => {
    expect(normalizeCourseProgress(56)).toBe(56);
    expect(normalizeCourseProgress("56")).toBe(56);
    expect(normalizeCourseProgress(0.56)).toBe(56);
    expect(normalizeCourseProgress(null)).toBeNull();
    expect(normalizeCourseProgress("abc")).toBeNull();
  });

  it("mantem 1 como 1% e limita a faixa 0-100", () => {
    expect(normalizeCourseProgress(1)).toBe(1);
    expect(normalizeCourseProgress(120)).toBe(100);
    expect(normalizeCourseProgress(-5)).toBe(0);
  });
});

describe("isDone", () => {
  it("nunca usa a nota máxima (grade/worth) como conclusão", () => {
    // Regression: the portal tree `grade` is the activity's worth (10/50), not
    // the student's grade. This is exactly how LPW/DBE were marked done.
    expect(isDone({ kind: "file_upload", content: { attempts: [] } })).toBe(false);
    expect(
      isDone({ kind: "quiz", content: { attempts: [], hasCompletedAllAttempts: false } }),
    ).toBe(false);
  });

  it("marca upload apenas com uma entrega real", () => {
    expect(isDone({ kind: "file_upload", content: { attempts: [{ isDraft: true }] } })).toBe(false);
    expect(isDone({ kind: "file_upload", content: { attempts: [{ isDraft: false }] } })).toBe(true);
    expect(isDone({ kind: "file_upload", studentGrade: 0 })).toBe(true);
    expect(
      isDone({
        kind: "file_upload",
        gradebook: {
          id: 1,
          name: "x",
          categoryId: 1,
          categoryName: "AVD",
          topicTypeId: 8,
          categoryTypeId: 5,
          deadlineAt: null,
          isSubmited: true,
        },
      }),
    ).toBe(true);
    // progressId alone is not a hand-in for uploads.
    expect(isDone({ kind: "file_upload", progressId: 1, viewed: true })).toBe(false);
  });

  it("marca quiz concluído por tentativa finalizada/nota/tentativas esgotadas", () => {
    expect(
      isDone({ kind: "quiz", content: { attempts: [{ finishedAt: "2026-01-01" }] } }),
    ).toBe(true);
    expect(isDone({ kind: "quiz", studentGrade: 5 })).toBe(true);
    expect(isDone({ kind: "quiz", hasCompletedAllAttempts: true })).toBe(true);
    expect(
      isDone({ kind: "quiz", content: { attempts: [], hasCompletedAllAttempts: false } }),
    ).toBe(false);
  });

  it("mantém leitura como concluída por progresso/visualização", () => {
    expect(isDone({ kind: "reading", progressId: 1 })).toBe(true);
    expect(isDone({ kind: "reading", viewed: true })).toBe(true);
    expect(isDone({ kind: "reading" })).toBe(false);
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
  id: number;
  title: string;
  topicTypeId?: number;
  gradeBookId?: number | null;
  parentTopicId?: number;
  grandParentTopicId?: number;
}): unknown {
  return {
    context: {
      topicId: overrides.id,
      topicTitle: overrides.title,
      parentTopicId: overrides.parentTopicId ?? 901,
      parentTopicTitle: "Secao",
      grandParentTopicId: overrides.grandParentTopicId ?? 900,
      topicTypeId: overrides.topicTypeId ?? 8,
      gradeBookId: overrides.gradeBookId ?? null,
    },
    topics: [
      {
        id: overrides.id,
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

describe("collectContent", () => {
  it("captura uma disciplina nova mesmo sem atividades", async () => {
    const get = vi.fn(async (path: string) => {
      if (path.includes("/courses/me")) {
        return { data: { courses: [{ id: 1, name: "Curso (T01_2026_2)" }] } };
      }
      if (path.endsWith("/contents")) {
        return {
          data: {
            topics: [
              { id: 10, title: "Nova Disciplina - Prof. Teste", topicTypeId: 1, children: [] },
            ],
          },
        };
      }
      if (path.includes("/grades/me/course/1")) {
        return { data: { structure: [] } };
      }
      throw new Error(`GET ${path} -> 404`);
    });
    const client = { get } as unknown as ApiClient;

    const courses = await collectContent(client);

    expect(courses).toHaveLength(1);
    expect(courses[0].items).toHaveLength(0);
    expect(courses[0].modules).toEqual([{ id: 10, title: "Nova Disciplina - Prof. Teste" }]);
    expect(courses[0].detailsFailed).toBe(0);
  });
});

describe("harvestHiddenTopics", () => {
  it("recupera tópicos fora da árvore, deriva módulo/seção e enriquece o prazo pelo boletim", async () => {
    const get = vi.fn(async (path: string) => {
      if (path.endsWith("/topics/101")) {
        return {
          status: 200,
          data: topicDetail({ id: 101, title: "Oculto com nota", gradeBookId: 500 }),
        };
      }
      if (path.endsWith("/topics/103")) {
        return { status: 200, data: topicDetail({ id: 103, title: "Atividade A" }) };
      }
      throw new Error("GET -> 404");
    });
    const client = { get } as unknown as ApiClient;

    const result = await harvestHiddenTopics(
      client,
      { id: 1, name: "Curso" },
      [treeItem(100, "Atividade A"), treeItem(104, "Atividade D")],
      GRADEBOOK,
      { margin: 2 },
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
    expect(result.errors).toBeGreaterThan(0);
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

  it("ignora respostas de container (seção/módulo) e não cria fantasma com id de seção", async () => {
    const get = vi.fn(async (path: string) => {
      if (path.endsWith("/topics/101")) {
        // The endpoint answers a section id with the section context plus its
        // first child; keying that child by the section id creates a phantom.
        return {
          status: 200,
          data: {
            context: {
              topicId: 101,
              topicTitle: "Exercícios - 1º Bimestre",
              topicTypeId: 2,
              parentTopicId: 900,
              grandParentTopicId: null,
            },
            topics: [
              {
                id: 102,
                title: "Exercícios_Unidade 1",
                topicTypeId: 3,
                progressTypeId: 1,
                content: { html: "<p>pdf</p>" },
              },
            ],
          },
        };
      }
      throw new Error("GET -> 404");
    });
    const client = { get } as unknown as ApiClient;

    const result = await harvestHiddenTopics(
      client,
      { id: 1, name: "Curso" },
      [treeItem(100, "Atividade A")],
      [],
      { margin: 1 },
    );

    expect(result.scanned).toBe(1);
    expect(result.hidden).toEqual([]);
  });

  it("ignora resposta cujo tópico retornado tem outro id (container sem type 2)", async () => {
    const get = vi.fn(async (path: string) => {
      if (path.endsWith("/topics/101")) {
        return {
          status: 200,
          data: {
            context: { topicId: 101, topicTitle: "Seção", topicTypeId: 3 },
            topics: [
              {
                id: 102,
                title: "Primeiro filho",
                topicTypeId: 3,
                content: { html: "<p>filho</p>" },
              },
            ],
          },
        };
      }
      throw new Error("GET -> 404");
    });
    const client = { get } as unknown as ApiClient;

    const result = await harvestHiddenTopics(
      client,
      { id: 1, name: "Curso" },
      [treeItem(100, "Atividade A")],
      [],
      { margin: 1 },
    );

    expect(result.hidden).toEqual([]);
  });

  it("descarta falsos ocultos antigos criados a partir de containers", async () => {
    const get = vi.fn(async () => {
      throw new Error("should not fetch previous ids");
    });
    const client = { get } as unknown as ApiClient;

    const phantom = {
      ...treeItem(105, "Exercícios_Unidade 1"),
      origin: "hidden" as const,
      moduleId: 900,
      sectionId: null,
      sectionTitle: null,
      context: {
        topicId: 105,
        topicTitle: "Exercícios - 1º Bimestre",
        topicTypeId: 2,
      },
    };
    const valid = {
      ...treeItem(200, "Antigo oculto"),
      origin: "hidden" as const,
      context: { topicId: 200, topicTitle: "Antigo oculto", topicTypeId: 3 },
    };

    const result = await harvestHiddenTopics(
      client,
      { id: 1, name: "Curso" },
      [treeItem(100, "Atividade A")],
      [],
      { margin: 0, previous: [phantom, valid] },
    );

    expect(result.hidden.map((h) => h.itemId)).toEqual([200]);
  });
});

describe("retainedHiddenItems", () => {
  it("preserva atividades válidas e remove só containers/duplicatas da árvore", () => {
    const valid = {
      ...treeItem(200, "Atividade futura"),
      origin: "hidden" as const,
      kind: "file_upload" as const,
      hasDeadline: true,
      deadlineAt: "2026-12-01 23:59:00",
      context: { topicId: 200, topicTitle: "Atividade futura", topicTypeId: 8 },
    };
    const container = {
      ...treeItem(201, "Primeiro filho"),
      origin: "hidden" as const,
      context: { topicId: 201, topicTitle: "Seção", topicTypeId: 2 },
    };
    const published = {
      ...treeItem(202, "Já publicada"),
      origin: "hidden" as const,
      context: { topicId: 202, topicTitle: "Já publicada", topicTypeId: 8 },
    };

    const kept = retainedHiddenItems([valid, valid, container, published], [202]);
    expect(kept.map((h) => h.itemId)).toEqual([200]);
  });
});
