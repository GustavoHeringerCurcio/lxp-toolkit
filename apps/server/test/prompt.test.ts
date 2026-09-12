import { describe, expect, it } from "vitest";
import {
  buildActivityPrompt,
  buildMessages,
  buildStylePrompt,
  humanizeQuizAnswer,
  isPlaceholder,
  parseAiRequest,
  parseQuizSelections,
  renderTemplate,
  resolveExtraInstructions,
  type PromptVars,
} from "../src/prompt.js";
import { makeExercise, makeQuizQ } from "./helpers.js";

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

describe("renderTemplate", () => {
  it("substitui placeholders suportados", () => {
    expect(renderTemplate("Aluno: {nome} ({matricula})", baseVars)).toBe("Aluno: Maria (2024001)");
  });

  it("mantém tokens desconhecidos verbatim", () => {
    expect(renderTemplate("Olá {desconhecido} {nome}", baseVars)).toBe("Olá {desconhecido} Maria");
  });
});

describe("isPlaceholder", () => {
  it("detecta texto com placeholder", () => {
    expect(isPlaceholder("tem {nome} aqui")).toBe(true);
    expect(isPlaceholder("texto limpo")).toBe(false);
  });
});

describe("parseAiRequest / resolveExtraInstructions", () => {
  it("string vazia → estrutura vazia", () => {
    expect(parseAiRequest("")).toEqual({ perfil: "", instrucoes: [], contexto: "" });
  });

  it("JSON legacy com prompt → prompt tem precedência", () => {
    const raw = JSON.stringify({ perfil: "p", instrucoes: ["a"], contexto: "c", prompt: "texto livre" });
    expect(resolveExtraInstructions(raw)).toBe("texto livre");
  });

  it("JSON legacy sem prompt → compõe instruções + contexto", () => {
    const raw = JSON.stringify({ instrucoes: ["Seja breve", "Use exemplo"], contexto: "Turma de enfermagem" });
    expect(resolveExtraInstructions(raw)).toBe("- Seja breve\n- Use exemplo\nTurma de enfermagem");
  });

  it("texto puro passa direto", () => {
    expect(resolveExtraInstructions("cite as referências")).toBe("cite as referências");
  });
});

describe("buildStylePrompt", () => {
  const style = {
    persona: "Você é o aluno.",
    voice: "Português simples.",
    includeIdentity: true,
    mcqMode: "letter",
    numbering: true,
    associateInline: true,
    noIntroOutro: true,
    noMetaLabels: true,
    extraRules: "",
  } as const;

  it("inclui identidade quando habilitada", () => {
    const s = buildStylePrompt(style);
    expect(s).toContain("Nome: {nome}");
    expect(s).toContain("Matrícula: {matricula}");
  });

  it("omite identidade quando desabilitada", () => {
    const s = buildStylePrompt({ ...style, includeIdentity: false });
    expect(s).not.toContain("{nome}");
  });

  it("mcqMode letter vs letter_text muda a regra", () => {
    expect(buildStylePrompt(style)).toContain("escreva só a letra");
    expect(buildStylePrompt({ ...style, mcqMode: "letter_text" })).toContain("breve justificativa");
  });

  it("anexa instruções específicas no final", () => {
    const s = buildStylePrompt(style, "Foco no capítulo 3");
    expect(s).toContain("Instruções específicas desta atividade:\nFoco no capítulo 3");
  });

  it("transforma extraRules em bullets", () => {
    const s = buildStylePrompt({ ...style, extraRules: "Regra um\n- Regra dois" });
    expect(s).toContain("- Regra um");
    expect(s).toContain("- Regra dois");
  });
});

describe("buildActivityPrompt", () => {
  it("inclui seções habilitadas com conteúdo", () => {
    const s = buildActivityPrompt(baseVars, {
      enunciado: true,
      arquivos: true,
      questoes: true,
      observacoes: true,
    });
    expect(s).toContain("Atividade: Trabalho 1");
    expect(s).toContain("Enunciado:\nEscreva sobre X.");
    expect(s).toContain("Arquivos anexados:");
    expect(s).toContain("Questões:");
    expect(s).toContain("Observações do aluno:");
  });

  it("pula seções desabilitadas ou vazias (sem rótulo solto)", () => {
    const s = buildActivityPrompt(
      { ...baseVars, observacoes: "", forum: "" },
      { enunciado: false, arquivos: true, questoes: true, observacoes: true },
    );
    expect(s).not.toContain("Enunciado:");
    expect(s).not.toContain("Observações do aluno:");
    expect(s).toContain("Questões:");
  });

  it("inclui publicações do fórum quando existirem", () => {
    const s = buildActivityPrompt({ ...baseVars, forum: "- Prof em 2026: discuta X" }, {
      enunciado: true,
      arquivos: false,
      questoes: false,
      observacoes: false,
    });
    expect(s).toContain("Publicações no fórum:");
  });
});

describe("buildMessages", () => {
  it("upload → system + user, sem marcadores de scaffold", async () => {
    const messages = await buildMessages(
      makeExercise(),
      { nome: "Maria", matricula: "2024001" },
      {
        persona: "Você é o aluno.",
        voice: "Simples.",
        includeIdentity: true,
        mcqMode: "letter",
        numbering: true,
        associateInline: true,
        noIntroOutro: true,
        noMetaLabels: true,
        extraRules: "",
      },
      { enunciado: true, arquivos: false, questoes: false, observacoes: false },
    );
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");
    expect(messages[0].content).toContain("Maria");
    expect(messages[1].content).toContain("Enunciado:");
    expect(messages.join("\n")).not.toMatch(/\{[a-z]+\}/);
  });

  it("quiz → identidade removida do system e formato de resposta adicionado", async () => {
    const messages = await buildMessages(
      makeExercise({
        kind: "quiz",
        contentKind: "quiz",
        topicTypeId: 15,
        questions: [makeQuizQ(1, "2 + 2 = ?")],
      }),
      { nome: "Maria", matricula: "2024001" },
      {
        persona: "Você é o aluno.",
        voice: "Simples.",
        includeIdentity: true,
        mcqMode: "letter",
        numbering: true,
        associateInline: true,
        noIntroOutro: true,
        noMetaLabels: true,
        extraRules: "",
      },
      { enunciado: true, arquivos: false, questoes: true, observacoes: false },
    );
    expect(messages[0].content).not.toContain("{nome}");
    expect(messages[1].content).toContain('Formato da resposta: uma linha por questão, no formato "Q<id>: <letra>"');
  });

  it("forum → instrução de publicação única em primeira pessoa", async () => {
    const messages = await buildMessages(
      makeExercise({ kind: "forum", contentKind: "forum", topicTypeId: 9 }),
      { nome: "Maria", matricula: "2024001" },
      {
        persona: "Você é o aluno.",
        voice: "Simples.",
        includeIdentity: true,
        mcqMode: "letter",
        numbering: true,
        associateInline: true,
        noIntroOutro: true,
        noMetaLabels: true,
        extraRules: "",
      },
      { enunciado: true, arquivos: false, questoes: false, observacoes: false },
    );
    expect(messages[1].content).toContain("publicação em primeira pessoa");
  });
});

describe("parseQuizSelections", () => {
  const questions = [makeQuizQ(1, "a?"), makeQuizQ(2, "b?"), makeQuizQ(3, "c?")];

  it("parseia o formato Q<id>: <letra>", () => {
    const sel = parseQuizSelections("Q1: A\nQ2: c", questions);
    expect(sel).toEqual([
      { questionId: 1, optionIndex: 0, letter: "a", optionId: questions[0].options[0].id },
      { questionId: 2, optionIndex: 2, letter: "c", optionId: questions[1].options[2].id },
    ]);
  });

  it("fallback para linhas ordenadas 1. B quando ids não casam", () => {
    const sel = parseQuizSelections("1. B\n2. A", questions);
    expect(sel).toHaveLength(2);
    expect(sel[0]).toMatchObject({ questionId: 1, optionIndex: 1, letter: "b" });
    expect(sel[1]).toMatchObject({ questionId: 2, optionIndex: 0, letter: "a" });
  });

  it("ignora ids desconhecidos e letras fora das opções", () => {
    const sel = parseQuizSelections("Q99: A\nQ1: Z\nQ3: A", questions);
    expect(sel).toEqual([
      { questionId: 3, optionIndex: 0, letter: "a", optionId: questions[2].options[0].id },
    ]);
  });
});

describe("humanizeQuizAnswer", () => {
  const questions = [makeQuizQ(1, "a?"), makeQuizQ(2, "b?")];

  it("converte Q<id>: <letra> em N. <LETRA> pela ordem", () => {
    expect(humanizeQuizAnswer("Q1: a\nQ2: B", questions)).toBe("1. A\n2. B");
  });

  it("mantém texto com ids desconhecidos", () => {
    expect(humanizeQuizAnswer("Q9: a", questions)).toBe("Q9: a");
  });

  it("retorna o texto original quando não há questões", () => {
    expect(humanizeQuizAnswer("Q1: a", [])).toBe("Q1: a");
  });
});
