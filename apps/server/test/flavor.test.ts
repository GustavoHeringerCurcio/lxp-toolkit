import { describe, expect, it } from "vitest";
import { detectFlavor, flavorFromTag } from "../src/build.js";
import { buildMessages, composeGhostAnswer } from "../src/prompt.js";
import { makeExercise, makeQuizQ } from "./helpers.js";

const baseStyle = {
  persona: "Você é o aluno.",
  voice: "Simples.",
  includeIdentity: true,
  mcqMode: "letter" as const,
  numbering: true,
  associateInline: true,
  noIntroOutro: true,
  noMetaLabels: true,
  extraRules: "",
};

const baseSections = { enunciado: true, arquivos: false, questoes: true, observacoes: false };

describe("detectFlavor", () => {
  it("task sem caixa de upload (hasFileUpload=false) → ghost", () => {
    expect(
      detectFlavor({
        kind: "file_upload",
        title: "Aula 3 - Modelos de Referência OSI e TCP IP",
        html: '<div><grupoaattachment file="slides.pptx"/></div>',
        content: { hasFileUpload: false, retryTypeId: 3 },
        attachments: [{ url: "https://x/slides.pptx" }],
        questions: [],
      }),
    ).toBe("ghost");
  });

  it("task com palavra print/captura → print", () => {
    expect(
      detectFlavor({
        kind: "file_upload",
        title: "SRC Curso - Começando com Cisco Packet Tracert",
        html: "<p>Fazer curso Packet tracer e printar tela de término e postar no LXP.</p>",
        content: { hasFileUpload: true },
        attachments: [],
        questions: [],
      }),
    ).toBe("print");
  });

  it("task com enunciado real → question", () => {
    expect(
      detectFlavor({
        kind: "file_upload",
        title: "Casos de Uso",
        html: "<p>Responda as questões do modelo anexo.</p>",
        content: { hasFileUpload: true },
        attachments: [{ url: "https://x/modelo.docx" }],
        questions: [],
      }),
    ).toBe("question");
  });

  it("quiz sem questões → ghost", () => {
    expect(
      detectFlavor({
        kind: "quiz",
        title: "Questionário vazio",
        html: null,
        content: { questions: [] },
        attachments: [],
        questions: [],
      }),
    ).toBe("ghost");
  });

  it("quiz com questões → question", () => {
    expect(
      detectFlavor({
        kind: "quiz",
        title: "Quiz",
        html: null,
        content: {},
        attachments: [],
        questions: [makeQuizQ(1, "2+2?")],
      }),
    ).toBe("question");
  });

  it("task sem enunciado e sem anexos → ghost", () => {
    expect(
      detectFlavor({
        kind: "file_upload",
        title: "Tarefa",
        html: null,
        content: { hasFileUpload: true },
        attachments: [],
        questions: [],
      }),
    ).toBe("ghost");
  });

  it("task sem enunciado mas com anexos → question (conservador)", () => {
    expect(
      detectFlavor({
        kind: "file_upload",
        title: "Leia o anexo",
        html: null,
        content: { hasFileUpload: true },
        attachments: [{ url: "https://x/a.pdf" }],
        questions: [],
      }),
    ).toBe("question");
  });
});

describe("flavorFromTag", () => {
  it("mapeia tags conhecidas", () => {
    expect(flavorFromTag("print")).toBe("print");
    expect(flavorFromTag("ghost")).toBe("ghost");
    expect(flavorFromTag("anomalia")).toBe("ghost");
    expect(flavorFromTag("question")).toBe("question");
  });

  it("tags neutras/ausentes → null", () => {
    expect(flavorFromTag(null)).toBeNull();
    expect(flavorFromTag(undefined)).toBeNull();
    expect(flavorFromTag("")).toBeNull();
    expect(flavorFromTag("qualquer")).toBeNull();
  });
});

describe("composeGhostAnswer", () => {
  it("compõe nome e matrícula", () => {
    expect(composeGhostAnswer({ nome: "Maria", matricula: "2024001" })).toBe(
      "Nome: Maria\nMatrícula: 2024001",
    );
  });

  it("lida com campos vazios", () => {
    expect(composeGhostAnswer({ nome: "", matricula: "" })).toBe("Nome:\nMatrícula:");
  });
});

describe("buildMessages para flavors não-pergunta", () => {
  it("ghost → nenhuma mensagem (IA não é chamada)", async () => {
    const messages = await buildMessages(
      makeExercise({ flavor: "ghost" }),
      { nome: "Maria", matricula: "1" },
      baseStyle,
      baseSections,
    );
    expect(messages).toEqual([]);
  });

  it("print → nenhuma mensagem", async () => {
    const messages = await buildMessages(
      makeExercise({ flavor: "print" }),
      { nome: "Maria", matricula: "1" },
      baseStyle,
      baseSections,
    );
    expect(messages).toEqual([]);
  });
});
