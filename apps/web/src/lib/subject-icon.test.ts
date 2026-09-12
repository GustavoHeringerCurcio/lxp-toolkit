import { describe, expect, it } from "vitest";
import {
  Atom,
  BrainCircuit,
  ChartColumn,
  Code,
  Cpu,
  Database,
  DraftingCompass,
  HeartPulse,
  Network,
  Scale,
  ShieldCheck,
  Sigma,
} from "lucide-react";
import { normalizeSubjectKey, subjectIcon } from "./subject-icon";

describe("normalizeSubjectKey", () => {
  it("remove acentos e normaliza separadores", () => {
    expect(normalizeSubjectKey("Cálculo Numérico")).toBe("calculo numerico");
    expect(normalizeSubjectKey("Banco de Dados (SQL)")).toBe("banco de dados sql");
  });

  it("trata vazio", () => {
    expect(normalizeSubjectKey("")).toBe("");
  });
});

describe("subjectIcon", () => {
  it("mapeia matérias comuns para o ícone de domínio", () => {
    expect(subjectIcon("Banco de Dados")).toBe(Database);
    expect(subjectIcon("Programação Orientada a Objetos")).toBe(Code);
    expect(subjectIcon("Cálculo Diferencial e Integral")).toBe(Sigma);
    expect(subjectIcon("Estatística Aplicada")).toBe(ChartColumn);
    expect(subjectIcon("Enfermagem")).toBe(HeartPulse);
    expect(subjectIcon("Direito Constitucional")).toBe(Scale);
    expect(subjectIcon("Inteligência Artificial")).toBe(BrainCircuit);
    expect(subjectIcon("Física Mecânica")).toBe(Atom);
  });

  it("ignora acentos e caixa", () => {
    expect(subjectIcon("Segurança da Informação")).toBe(ShieldCheck);
    expect(subjectIcon("seguranca da informacao")).toBe(ShieldCheck);
  });

  it("prefere a correspondência mais específica", () => {
    expect(subjectIcon("Arquitetura de Software")).toBe(Network);
    expect(subjectIcon("Arquitetura de Computadores")).toBe(Cpu);
    expect(subjectIcon("Arquitetura e Urbanismo")).toBe(DraftingCompass);
  });

  it("retorna null quando nada casa (fallback para monograma)", () => {
    expect(subjectIcon("Metodologia Científica")).toBeNull();
    expect(subjectIcon("")).toBeNull();
    expect(subjectIcon(null)).toBeNull();
    expect(subjectIcon(undefined)).toBeNull();
  });
});
