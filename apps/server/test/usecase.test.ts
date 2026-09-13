import { describe, expect, it } from "vitest";
import {
  applyTemplateDefaults,
  buildTemplateFillContract,
  forceTodayDate,
  formatDateBr,
  normalizeLabel,
  parseUseCases,
  useCaseName,
} from "../src/usecase.js";

const LABELS = [
  "Identificador",
  "Nome do Caso de Uso",
  "Versao",
  "Autor",
  "Data",
  "Atores",
  "Descricao / Objetivo",
  "Pre-condicoes",
  "Pos-condicoes",
  "Fluxo Principal",
  "Fluxos Alternativos / Excecoes",
  "Regras de Negocio",
  "Requisitos Nao Funcionais",
  "Prioridade",
  "Observacoes",
];

describe("normalizeLabel", () => {
  it("ignora acentos, caixa e pontuação", () => {
    expect(normalizeLabel("Descrição / Objetivo")).toBe("descricao objetivo");
    expect(normalizeLabel("Pré-condições")).toBe("pre condicoes");
    expect(normalizeLabel("Fluxo Principal")).toBe("fluxo principal");
  });
});

describe("parseUseCases", () => {
  it("parseia blocos UC com campos e passos multilinha", () => {
    const text = [
      "## UC-01 — Realizar Agendamento de Consulta",
      "Identificador: UC-01",
      "Nome do Caso de Uso: Realizar Agendamento de Consulta",
      "Atores: Recepcionista, Sistema da Clínica",
      "Fluxo Principal:",
      "1. Recepcionista acessa o sistema",
      "2. Seleciona paciente",
      "3. Escolhe médico, data e horário",
      "Prioridade: Alta",
      "",
      "## UC-02 — Cancelar Consulta",
      "Identificador: UC-02",
      "Nome do Caso de Uso: Cancelar Consulta",
      "Prioridade: Média",
    ].join("\n");

    const cases = parseUseCases(text, LABELS);
    expect(cases).toHaveLength(2);
    expect(cases[0].id).toBe("UC-01");
    expect(cases[0].name).toBe("Realizar Agendamento de Consulta");
    expect(cases[0].fields["atores"]).toBe("Recepcionista, Sistema da Clínica");
    expect(cases[0].fields["fluxo principal"]).toBe(
      "1. Recepcionista acessa o sistema\n2. Seleciona paciente\n3. Escolhe médico, data e horário",
    );
    expect(cases[0].fields["prioridade"]).toBe("Alta");
    expect(cases[1].id).toBe("UC-02");
    expect(cases[1].fields["prioridade"]).toBe("Média");
  });

  it("não confunde passos numerados com campos", () => {
    const text = [
      "## UC-01 — X",
      "Fluxo Principal:",
      "1. Passo: com dois pontos",
      "2. Outro passo",
    ].join("\n");
    const cases = parseUseCases(text, LABELS);
    expect(Object.keys(cases[0].fields)).toEqual(["fluxo principal"]);
    expect(cases[0].fields["fluxo principal"]).toContain("1. Passo: com dois pontos");
  });

  it("aceita cabeçalho sem cerquilha e com dois-pontos", () => {
    const cases = parseUseCases("UC-03: Fazer Login\nPrioridade: Alta", LABELS);
    expect(cases).toHaveLength(1);
    expect(cases[0].id).toBe("UC-03");
    expect(cases[0].name).toBe("Fazer Login");
  });

  it("retorna vazio para texto sem casos de uso", () => {
    expect(parseUseCases("apenas um texto qualquer", LABELS)).toEqual([]);
    expect(parseUseCases("", LABELS)).toEqual([]);
  });
});

describe("useCaseName", () => {
  it("cai no campo Nome quando o cabeçalho não traz nome", () => {
    const cases = parseUseCases("## UC-01\nNome do Caso de Uso: Fazer Login", LABELS);
    expect(useCaseName(cases[0])).toBe("Fazer Login");
  });
});

describe("buildTemplateFillContract", () => {
  it("lista os campos detectados na ordem", () => {
    const contract = buildTemplateFillContract(["Identificador", "Atores", "Fluxo Principal"]);
    expect(contract).toContain("Identificador; Atores; Fluxo Principal");
    expect(contract).toContain("UC-01");
    expect(contract).toContain("sem tabela Markdown");
  });

  it("pede para seguir o modelo do enunciado quando não há campos", () => {
    const contract = buildTemplateFillContract();
    expect(contract).toContain("enunciado");
  });

  it("inclui a data de hoje quando fornecida", () => {
    const contract = buildTemplateFillContract(["Data"], "13/09/2026");
    expect(contract).toContain("13/09/2026");
  });
});

describe("formatDateBr", () => {
  it("formata como dd/mm/aaaa", () => {
    expect(formatDateBr(new Date(2026, 8, 13))).toBe("13/09/2026");
    expect(formatDateBr(new Date(2026, 0, 5))).toBe("05/01/2026");
  });
});

describe("forceTodayDate", () => {
  it("substitui o campo Data por hoje, mesmo com ano errado do modelo", () => {
    const text = ["UC-01 — Login", "Data: 05/10/2023", "Autor: Maria"].join("\n");
    const out = forceTodayDate(text, new Date(2026, 8, 13));
    expect(out).toContain("Data: 13/09/2026");
    expect(out).not.toContain("2023");
    expect(out).toContain("Autor: Maria");
  });

  it("lida com placeholder e marcadores", () => {
    const text = ["Data (dd/mm/aaaa): 01/01/2000", "- Data: 31/12/1999"].join("\n");
    const out = forceTodayDate(text, new Date(2026, 8, 13));
    expect(out).toBe(["Data (dd/mm/aaaa): 13/09/2026", "- Data: 13/09/2026"].join("\n"));
  });

  it("não toca em outras linhas", () => {
    expect(forceTodayDate("Data de nascimento: 01/01/1990", new Date(2026, 8, 13))).toBe(
      "Data de nascimento: 01/01/1990",
    );
  });
});

describe("applyTemplateDefaults", () => {
  it("preenche Autor, Data e Versão quando vazios ou placeholder", () => {
    const cases = parseUseCases(
      ["## UC-01 — X", "Autor: (Nome do analista ou aluno)", "Data: (dd/mm/aaaa)"].join("\n"),
      LABELS,
    );
    const out = applyTemplateDefaults(cases, { nome: "Maria" }, new Date(2026, 8, 13));
    expect(out[0].fields["autor"]).toBe("Maria");
    expect(out[0].fields["data"]).toBe("13/09/2026");
    expect(out[0].fields["versao"]).toBe("1.0");
  });

  it("não sobrescreve valores reais", () => {
    const cases = parseUseCases(["## UC-01 — X", "Autor: João", "Versao: 2.0"].join("\n"), LABELS);
    const out = applyTemplateDefaults(cases, { nome: "Maria" });
    expect(out[0].fields["autor"]).toBe("João");
    expect(out[0].fields["versao"]).toBe("2.0");
  });
});
