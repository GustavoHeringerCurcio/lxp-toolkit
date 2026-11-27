import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  answerToPdf,
  buildAnswerHtml,
  looksLikeMarkdown,
  renderRichPdf,
  summaryToPdf,
} from "../src/pdf.js";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lK3Q6wAAAABJRU5ErkJggg==",
  "base64",
);

function asLatin1(buf: Buffer): string {
  return buf.toString("latin1");
}

describe("looksLikeMarkdown", () => {
  it("detecta tabelas, títulos, listas e negrito", () => {
    expect(looksLikeMarkdown("| a | b |\n|---|---|\n| 1 | 2 |")).toBe(true);
    expect(looksLikeMarkdown("## Caso de Uso")).toBe(true);
    expect(looksLikeMarkdown("- item um\n- item dois")).toBe(true);
    expect(looksLikeMarkdown("texto com **negrito**")).toBe(true);
  });

  it("não confunde texto simples", () => {
    expect(looksLikeMarkdown("Apenas um parágrafo comum, sem marcação.")).toBe(false);
  });
});

describe("buildAnswerHtml (diagram page)", () => {
  it("adds a dedicated page with the embedded PNG", () => {
    const html = buildAnswerHtml("Atividade", "<p>Resposta</p>", {
      png: ONE_PIXEL_PNG,
      width: 1,
      height: 1,
      title: "Figura 1 — Diagrama de caso de uso (UML)",
    });
    expect(html).toContain('<figure class="diagram-page">');
    expect(html).toContain("data:image/png;base64,");
    expect(html).toContain("Figura 1");
    expect(html.indexOf("<p>Resposta</p>")).toBeLessThan(html.indexOf("<figure"));
  });

  it("does not add a diagram page when none is supplied", () => {
    expect(buildAnswerHtml("Atividade", "<p>Resposta</p>")).not.toContain("<figure");
  });

  it("resets html/body margins so the renderer adds no leading blank page", () => {
    expect(buildAnswerHtml("Atividade", "<p>Resposta</p>")).toContain(
      "html, body { margin: 0; padding: 0; }",
    );
  });
});

describe("answerToPdf", () => {
  it("produces a single page for a short answer (no leading blank page)", async () => {
    // Random answer keeps the cache from masking a renderer regression.
    const answer = `Resposta curta de teste ${Math.random().toString(36).slice(2)}`;
    const pdfPath = await answerToPdf(answer, "Atividade");
    expect(pdfPath).toBeTruthy();
    const text = asLatin1(readFileSync(pdfPath as string));
    const pages = (text.match(/\/Type\s*\/Page(?![s])/g) ?? []).length;
    expect(pages).toBe(1);
  }, 30_000);
});

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

describe("summaryToPdf", () => {
  it("renders the study layout with colored sections and a TOC", async () => {
    const markdown = [
      "## Vis�o geral",
      "",
      "Resumo com **termo-chave**.",
      "",
      "## T�picos-chave",
      "",
      "- Primeiro t�pico",
      "",
      "## Quest�es prov�veis",
      "",
      "1. **Pergunta?**",
      "   - **Resposta:** alternativa",
      "   - **Por qu�:** justificativa",
    ].join("\n");
    const title = `Resumo de teste ${Math.random().toString(36).slice(2)}`;
    const pdfPath = await summaryToPdf(markdown, title);
    expect(pdfPath).toBeTruthy();
    const htmlPath = (pdfPath as string).replace(/\.pdf$/, ".html");
    const html = readFileSync(htmlPath, "utf8");
    expect(html).toContain("section--blue");
    expect(html).toContain("section--green");
    expect(html).toContain("section--questions");
    expect(html).toContain("toc-title");
    expect(html).toContain("hero");
  }, 30_000);
});
