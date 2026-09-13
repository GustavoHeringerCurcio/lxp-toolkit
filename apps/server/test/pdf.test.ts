import { describe, expect, it } from "vitest";
import { renderRichPdf } from "../src/pdf.js";

function asLatin1(buf: Buffer): string {
  return buf.toString("latin1");
}

describe("renderRichPdf (fill mode)", () => {
  it("produces a valid PDF header and footer", () => {
    const pdf = renderRichPdf("Atividade", "Olá mundo");
    const text = asLatin1(pdf);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(pdf.length).toBeGreaterThan(200);
  });

  it("renders a markdown table with grid lines", () => {
    const md = ["| Campo | Valor |", "|---|---|", "| Nome | Teste |", "| Idade | 20 |"].join("\n");
    const text = asLatin1(renderRichPdf("Tabela", md));
    // table cells are stroked lines/rectangles; the header uses the bold font
    expect(text).toContain(" re f");
    expect(text).toContain(" l S");
    expect(text).toContain("/F2");
    expect(text).toContain("(Campo)");
  });

  it("renders headings and list markers", () => {
    const md = ["# Título", "", "- primeiro item", "- segundo item"].join("\n");
    const text = asLatin1(renderRichPdf("Listas", md));
    expect(text).toContain("(Título)");
    expect(text).toContain("(-)"); // bullet normalised to "-"
  });

  it("handles bold runs and does not throw on messy input", () => {
    const md = "**negrito** e texto normal\n\n> citação\n\n---";
    expect(() => renderRichPdf("Misto", md)).not.toThrow();
    const text = asLatin1(renderRichPdf("Misto", md));
    expect(text).toContain("/F2");
    expect(text).toContain(" l S"); // horizontal rule
  });
});
