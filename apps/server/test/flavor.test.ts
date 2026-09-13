import { describe, expect, it } from "vitest";
import { anomaliesFromTag, detectAnomalies, flavorFromAnomalies, flavorFromTag, needsFlavorReview } from "../src/build.js";
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

const codes = (anomalies: { code: string }[]): string[] => anomalies.map((a) => a.code);

describe("detectAnomalies", () => {
  it("task sem caixa de upload (hasFileUpload=false) → ghost", () => {
    expect(
      codes(
        detectAnomalies({
          kind: "file_upload",
          title: "Aula 3 - Modelos de Referência OSI e TCP IP",
          html: '<div><grupoaattachment file="slides.pptx"/></div>',
          content: { hasFileUpload: false, retryTypeId: 3 },
          attachments: [{ url: "https://x/slides.pptx" }],
          questions: [],
        }),
      ),
    ).toEqual(["ghost"]);
  });

  it("task com palavra print/captura → print", () => {
    expect(
      codes(
        detectAnomalies({
          kind: "file_upload",
          title: "SRC Curso - Começando com Cisco Packet Tracert",
          html: "<p>Fazer curso Packet tracer e printar tela de término e postar no LXP.</p>",
          content: { hasFileUpload: true },
          attachments: [],
          questions: [],
        }),
      ),
    ).toEqual(["print"]);
  });

  it("task com enunciado real → sem anomalia", () => {
    expect(
      detectAnomalies({
        kind: "file_upload",
        title: "Casos de Uso",
        html: "<p>Responda as questões do modelo anexo.</p>",
        content: { hasFileUpload: true },
        attachments: [{ url: "https://x/modelo.docx" }],
        questions: [],
      }),
    ).toEqual([]);
  });

  it("quiz sem questões → ghost", () => {
    expect(
      codes(
        detectAnomalies({
          kind: "quiz",
          title: "Questionário vazio",
          html: null,
          content: { questions: [] },
          attachments: [],
          questions: [],
        }),
      ),
    ).toEqual(["ghost"]);
  });

  it("quiz com questões → sem anomalia", () => {
    expect(
      detectAnomalies({
        kind: "quiz",
        title: "Quiz",
        html: null,
        content: {},
        attachments: [],
        questions: [makeQuizQ(1, "2+2?")],
      }),
    ).toEqual([]);
  });

  it("task sem enunciado e sem anexos → ghost", () => {
    expect(
      codes(
        detectAnomalies({
          kind: "file_upload",
          title: "Tarefa",
          html: null,
          content: { hasFileUpload: true },
          attachments: [],
          questions: [],
        }),
      ),
    ).toEqual(["ghost"]);
  });

  it("task sem enunciado mas com anexos → sem anomalia (conservador)", () => {
    expect(
      detectAnomalies({
        kind: "file_upload",
        title: "Leia o anexo",
        html: null,
        content: { hasFileUpload: true },
        attachments: [{ url: "https://x/a.pdf" }],
        questions: [],
      }),
    ).toEqual([]);
  });

  it("roteiro/encontro presencial sem pergunta → ghost", () => {
    expect(
      codes(
        detectAnomalies({
          kind: "file_upload",
          title: "Roteiro para o Encontro Presencial em 03/11/2025",
          html: "<p>Material de apoio: tragam o Relatório Técnico preenchido, em WORD, no dia do encontro.</p>",
          content: { hasFileUpload: true },
          attachments: [{ url: "https://x/modelo.docx" }],
          questions: [],
        }),
      ),
    ).toEqual(["ghost"]);
  });

  it("roteiro com pedido explícito continua pergunta", () => {
    expect(
      codes(
        detectAnomalies({
          kind: "file_upload",
          title: "Roteiro do encontro",
          html: "<p>Material de apoio. Responda as questões do modelo anexo.</p>",
          content: { hasFileUpload: true },
          attachments: [{ url: "https://x/modelo.docx" }],
          questions: [],
        }),
      ),
    ).toEqual([]);
  });

  it("severidade por código: ghost=error, print=warn", () => {
    const [ghost] = detectAnomalies({
      kind: "file_upload",
      title: "Tarefa",
      html: null,
      content: { hasFileUpload: false },
      attachments: [],
      questions: [],
    });
    const [print] = detectAnomalies({
      kind: "file_upload",
      title: "Print da tela",
      html: null,
      content: { hasFileUpload: true },
      attachments: [],
      questions: [],
    });
    expect(ghost.severity).toBe("error");
    expect(print.severity).toBe("warn");
  });
});

describe("needsFlavorReview", () => {
  it("upload sem pista de resposta → revisão", () => {
    expect(
      needsFlavorReview({
        kind: "file_upload",
        title: "Atividade",
        html: "<p>Assista à palestra e produza um resumo.</p>",
        anomalies: [],
      }),
    ).toBe(true);
  });

  it("upload com pista de resposta → sem revisão", () => {
    expect(
      needsFlavorReview({
        kind: "file_upload",
        title: "Atividade",
        html: "<p>Responda as questões do modelo.</p>",
        anomalies: [],
      }),
    ).toBe(false);
  });

  it("item já anômalo → sem revisão", () => {
    expect(
      needsFlavorReview({
        kind: "file_upload",
        title: "Roteiro",
        html: "<p>Texto.</p>",
        anomalies: [{ code: "ghost", severity: "error" }],
      }),
    ).toBe(false);
  });

  it("quiz → sem revisão", () => {
    expect(
      needsFlavorReview({ kind: "quiz", title: "Quiz", html: "<p>Texto.</p>", anomalies: [] }),
    ).toBe(false);
  });
});

describe("flavorFromAnomalies", () => {
  it("deriva o flavor primário", () => {
    expect(flavorFromAnomalies([])).toBe("question");
    expect(flavorFromAnomalies([{ code: "print", severity: "warn" }])).toBe("print");
    expect(flavorFromAnomalies([{ code: "ghost", severity: "error" }])).toBe("ghost");
  });
});

describe("anomaliesFromTag / flavorFromTag", () => {
  it("mapeia tags conhecidas", () => {
    expect(codes(anomaliesFromTag("print") ?? [])).toEqual(["print"]);
    expect(codes(anomaliesFromTag("ghost") ?? [])).toEqual(["ghost"]);
    expect(codes(anomaliesFromTag("anomalia") ?? [])).toEqual(["ghost"]);
    expect(anomaliesFromTag("question")).toEqual([]);
  });

  it("tags neutras/ausentes → null", () => {
    expect(anomaliesFromTag(null)).toBeNull();
    expect(anomaliesFromTag(undefined)).toBeNull();
    expect(anomaliesFromTag("")).toBeNull();
    expect(anomaliesFromTag("qualquer")).toBeNull();
  });

  it("flavorFromTag continua derivando o flavor", () => {
    expect(flavorFromTag("print")).toBe("print");
    expect(flavorFromTag("ghost")).toBe("ghost");
    expect(flavorFromTag("question")).toBe("question");
    expect(flavorFromTag(null)).toBeNull();
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
