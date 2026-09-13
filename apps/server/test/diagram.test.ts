import { describe, expect, it } from "vitest";
import { renderUseCaseSvg, specFromUseCases, type DiagramSpec } from "../src/diagram.js";
import type { UseCase } from "../src/usecase.js";

const cases: UseCase[] = [
  {
    id: "UC-01",
    name: "Realizar Agendamento de Consulta",
    fields: { atores: "Recepcionista, Sistema da Clínica" },
  },
  {
    id: "UC-02",
    name: "Enviar Lembrete",
    fields: { atores: "Sistema de Notificação" },
  },
];

describe("specFromUseCases", () => {
  it("deriva atores e casos do preenchimento", () => {
    const spec = specFromUseCases(cases, "Clínica");
    expect(spec.system).toBe("Clínica");
    expect(spec.actors).toEqual(["Recepcionista", "Sistema da Clínica", "Sistema de Notificação"]);
    expect(spec.useCases.map((u) => u.name)).toEqual([
      "Realizar Agendamento de Consulta",
      "Enviar Lembrete",
    ]);
  });
});

describe("renderUseCaseSvg", () => {
  const spec: DiagramSpec = {
    system: "Clínica",
    actors: ["Recepcionista", "Sistema de Notificação"],
    useCases: [
      { name: "Realizar Agendamento", actors: ["Recepcionista"], includes: ["Enviar Lembrete"], extends: [] },
      { name: "Enviar Lembrete", actors: ["Sistema de Notificação"], includes: [], extends: [] },
    ],
  };

  it("produz um SVG com sistema, atores, casos e relações", () => {
    const svg = renderUseCaseSvg(spec);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain("Clínica");
    expect(svg).toContain("Recepcionista");
    expect(svg).toContain("Realizar Agendamento");
    expect(svg).toContain("&lt;&lt;include&gt;&gt;");
    expect(svg).toContain('stroke-dasharray="5 4"');
  });

  it("não quebra com um spec vazio", () => {
    const svg = renderUseCaseSvg({ system: "", actors: [], useCases: [] });
    expect(svg.startsWith("<svg")).toBe(true);
  });
});
