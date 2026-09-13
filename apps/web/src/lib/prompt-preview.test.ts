import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACTIVITY_SECTIONS,
  DEFAULT_STYLE,
  buildActivityPrompt,
  buildStylePrompt,
  buildVars,
  renderPreviewMessage,
  renderTemplate,
  resolveExtraInstructions,
  type PromptVars,
} from "./prompt-preview";
import type { Exercise, ForumPost } from "@/types";

function makeForumPost(overrides: Partial<ForumPost> = {}): ForumPost {
  return {
    id: 1,
    topicId: 9,
    html: "<p>Primeira publicação</p>",
    createdAt: "2026-09-01T10:00:00Z",
    updatedAt: "2026-09-01T10:00:00Z",
    isEdited: false,
    enrollmentId: 77,
    parentPostId: null,
    isHidden: false,
    isDeleted: false,
    postOwnerUsername: "prof_carlos",
    postOwnerProfilePhoto: null,
    postOwnerSafeaRole: "professor",
    postOwnerRoleName: "Professor",
    children: [],
    enrollmentIdsWhoLiked: [],
    ...overrides,
  };
}

export function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 1,
    title: "Atividade Teste",
    kind: "upload",
    flavor: "question",
    flavorSource: "auto",
    anomalies: [],
    needsReview: false,
    tag: null,
    enrollmentId: null,
    isSurvey: false,
    contentKind: "other",
    isRecordProgress: false,
    courseId: 10,
    courseName: "Curso Teste",
    moduleTitle: "Módulo 1",
    moduleName: "M1",
    professor: null,
    professorId: null,
    sectionTitle: null,
    topicTypeId: 8,
    status: "open",
    done: false,
    hasDeadline: true,
    deadlineAt: "2026-12-01T23:59:59Z",
    daysLeft: 5,
    files: [],
    remoteFiles: [],
    instructionsText: "Escreva um texto sobre X.",
    questions: [],
    forum: null,
    answer: null,
    answerSource: null,
    selections: [],
    notes: "",
    aiRequest: { perfil: "", instrucoes: [], contexto: "" },
    hasAiOverride: false,
    aiRequestJson: "",
    ...overrides,
  };
}

const baseVars: PromptVars = {
  nome: "Maria",
  matricula: "2024001",
  atividade: "Trabalho 1",
  tipo: "tarefa com envio de arquivo",
  modulo: "Módulo 1 — Unidade A",
  prazo: "2026-12-01",
  enunciado: "Escreva sobre X.",
  arquivos: "arquivo.pdf",
  questoes: "Q1: qual…",
  observacoes: "Notas do aluno",
  forum: "",
};

describe("paridade web ⇄ server", () => {
  it("DEFAULT_STYLE é idêntico ao do server (apps/server/src/config.ts)", async () => {
    const server = await import("@server/config");
    expect(DEFAULT_STYLE).toEqual(server.DEFAULT_STYLE);
    expect(DEFAULT_ACTIVITY_SECTIONS).toEqual(server.DEFAULT_ACTIVITY_SECTIONS);
  });
});

describe("renderTemplate", () => {
  it("substitui placeholders e mantém tokens desconhecidos", () => {
    expect(renderTemplate("{nome} — {prazo} {xyz}", baseVars)).toBe("Maria — 2026-12-01 {xyz}");
  });
});

describe("buildStylePrompt", () => {
  it("compila persona, formato e regras", () => {
    const s = buildStylePrompt(DEFAULT_STYLE);
    expect(s).toContain(DEFAULT_STYLE.persona);
    expect(s).toContain("Nome: {nome}");
    expect(s).toContain("escreva só a letra");
    expect(s).toContain("Regras:");
  });

  it("anexa instruções específicas", () => {
    expect(buildStylePrompt(DEFAULT_STYLE, "Foco no capítulo 2")).toContain(
      "Instruções específicas desta atividade:\nFoco no capítulo 2",
    );
  });
});

describe("buildActivityPrompt", () => {
  it("pula seções vazias/desabilitadas", () => {
    const s = buildActivityPrompt({ ...baseVars, observacoes: "" }, {
      ...DEFAULT_ACTIVITY_SECTIONS,
      enunciado: false,
      observacoes: true,
    });
    expect(s).not.toContain("Enunciado:");
    expect(s).not.toContain("Observações do aluno:");
    expect(s).toContain("Questões:");
  });
});

describe("buildVars", () => {
  it("quiz → lista as questões com opções", () => {
    const e = makeExercise({
      kind: "quiz",
      contentKind: "quiz",
      topicTypeId: 15,
      questions: [
        { id: 1, text: "2+2?", options: [{ id: 101, text: "3" }, { id: 102, text: "4" }] },
      ],
    });
    const vars = buildVars(e, { nome: "Maria", matricula: "1" });
    expect(vars.questoes).toContain("Q1: 2+2?");
    expect(vars.questoes).toContain("a) 3");
    expect(vars.questoes).toContain("b) 4");
  });

  it("upload → lista arquivos e links remotos", () => {
    const e = makeExercise({
      files: [{ name: "roteiro.pdf", relPath: "a.pdf", remoteUrl: "https://x/a.pdf" }],
      remoteFiles: [{ filename: "roteiro.pdf", url: "https://x/a.pdf" }],
    });
    const vars = buildVars(e, { nome: "Maria", matricula: "1" });
    expect(vars.arquivos).toContain("--- Arquivo: roteiro.pdf ---");
    expect(vars.arquivos).toContain("Links dos arquivos no portal:");
  });

  it("fórum → serializa posts com autor e texto limpo, pulando deletados", () => {
    const e = makeExercise({
      kind: "forum",
      contentKind: "forum",
      topicTypeId: 9,
      forum: {
        countPosts: 2,
        countOfMyPosts: 0,
        isAllowLikes: true,
        isToLimitResponses: false,
        maxAnswerPerStudent: 1,
        isOnlyVisibleToPeopleWithPost: false,
        hasReachedPostLimit: false,
        posts: [
          makeForumPost(),
          makeForumPost({
            id: 2,
            parentPostId: 1,
            html: "<p>Réplica</p>",
            postOwnerUsername: "colega_ana",
            postOwnerSafeaRole: "student",
            isDeleted: true,
          }),
        ],
      },
    });
    const vars = buildVars(e, { nome: "Maria", matricula: "1" });
    expect(vars.forum).toContain("- prof_carlos (Professor) em 2026-09-01T10:00:00Z:");
    expect(vars.forum).toContain("Primeira publicação");
    expect(vars.forum).not.toContain("colega_ana");
  });

  it("módulo inclui seção quando existir", () => {
    const vars = buildVars(makeExercise({ sectionTitle: "Unidade A" }), { nome: "", matricula: "" });
    expect(vars.modulo).toBe("Módulo 1 — Unidade A");
  });
});

describe("renderPreviewMessage", () => {
  it("emite blocos [system] e [user] sem placeholders restantes", () => {
    const out = renderPreviewMessage(
      DEFAULT_STYLE,
      DEFAULT_ACTIVITY_SECTIONS,
      makeExercise(),
      { nome: "Maria", matricula: "2024001" },
      "Cite a bibliografia",
    );
    expect(out).toMatch(/^\[system\]/);
    expect(out).toContain("[user]");
    expect(out).toContain("Maria");
    expect(out).toContain("Cite a bibliografia");
    expect(out).not.toMatch(/\{[a-z]+\}/);
  });

  it("quiz adiciona o formato Q<id>: <letra> no user", () => {
    const out = renderPreviewMessage(
      DEFAULT_STYLE,
      DEFAULT_ACTIVITY_SECTIONS,
      makeExercise({
        kind: "quiz",
        contentKind: "quiz",
        topicTypeId: 15,
        questions: [{ id: 7, text: "1+1?", options: [{ id: 701, text: "2" }] }],
      }),
      { nome: "Maria", matricula: "1" },
    );
    expect(out).toContain('Formato da resposta: uma linha por questão, no formato "Q<id>: <letra>"');
    expect(out).toContain("Exemplo: Q7: B");
  });

  it("fórum adiciona a instrução de publicação única", () => {
    const out = renderPreviewMessage(
      DEFAULT_STYLE,
      DEFAULT_ACTIVITY_SECTIONS,
      makeExercise({ kind: "forum", contentKind: "forum", topicTypeId: 9 }),
      { nome: "Maria", matricula: "1" },
    );
    expect(out).toContain("publicação em primeira pessoa");
  });
});

describe("resolveExtraInstructions", () => {
  it("texto puro passa direto", () => {
    expect(resolveExtraInstructions("seja breve")).toBe("seja breve");
  });

  it("JSON com prompt tem precedência", () => {
    const raw = JSON.stringify({ perfil: "p", instrucoes: ["a"], prompt: "livre" });
    expect(resolveExtraInstructions(raw)).toBe("livre");
  });

  it("JSON com instrucoes/contexto compõe bullets", () => {
    const raw = JSON.stringify({ instrucoes: ["A", "B"], contexto: "Contexto C" });
    expect(resolveExtraInstructions(raw)).toBe("- A\n- B\nContexto C");
  });

  it("vazio/nulo → vazio", () => {
    expect(resolveExtraInstructions("")).toBe("");
    expect(resolveExtraInstructions(null)).toBe("");
    expect(resolveExtraInstructions(undefined)).toBe("");
  });
});
