import { describe, expect, it } from "vitest";
import { selectCourseContext, type CourseContextRow } from "../src/extract.js";

const rows: CourseContextRow[] = [
  { id: 1, title: "Apresentação", text: "conteudo A" },
  { id: 2, title: "Definindo o Tema", text: "conteudo B" },
  { id: 3, title: "Casos de Uso", text: "exemplo clinica" },
];

describe("selectCourseContext", () => {
  it("prioriza itens de projeto/requisitos", () => {
    const out = selectCourseContext(rows, 8000);
    expect(out.indexOf("Definindo o Tema")).toBeLessThan(out.indexOf("Apresentação"));
  });

  it("exclui o item da própria atividade (exemplo do professor)", () => {
    const out = selectCourseContext(rows, 8000, [3]);
    expect(out).not.toContain("exemplo clinica");
    expect(out).toContain("conteudo B");
  });

  it("respeita o limite de caracteres", () => {
    const out = selectCourseContext(rows, 40);
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out).toContain("Definindo o Tema");
    expect(out).not.toContain("Apresentação");
  });
});
