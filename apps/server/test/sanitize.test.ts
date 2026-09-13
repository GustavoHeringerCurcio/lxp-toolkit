import { describe, expect, it } from "vitest";
import { sanitizeHtml, stripDangerousHtml } from "../src/sanitize.js";

describe("sanitizeHtml", () => {
  it("remove blocos perigosos e comentários", () => {
    const html = `<p>oi</p><script>alert(1)</script><style>p{color:red}</style><!-- x -->`;
    expect(sanitizeHtml(html)).toBe("<p>oi</p>");
  });

  it("mantém a estrutura de parágrafos e listas", () => {
    const html = `<div style="text-align: justify;"><p>Um</p><ul><li><p>Dois</p></li><li>Três</li></ul></div>`;
    expect(sanitizeHtml(html)).toBe("<div><p>Um</p><ul><li><p>Dois</p></li><li>Três</li></ul></div>");
  });

  it("desembrulha elementos customizados preservando o texto", () => {
    const html = `<p>Veja <grupoaattachment file="x.pdf">o anexo</grupoaattachment> agora.</p>`;
    expect(sanitizeHtml(html)).toBe("<p>Veja o anexo agora.</p>");
  });

  it("remove atributos e mantém só href seguro em links", () => {
    expect(sanitizeHtml(`<p class="x" data-start="1" style="color:red">a</p>`)).toBe("<p>a</p>");
    expect(sanitizeHtml(`<a href="https://x.test/a" onclick="evil()">ir</a>`)).toBe(
      `<a href="https://x.test/a" target="_blank" rel="noreferrer">ir</a>`,
    );
    expect(sanitizeHtml(`<a href="javascript:alert(1)">x</a>`)).toBe("<a>x</a>");
  });

  it("lida com entradas vazias", () => {
    expect(sanitizeHtml("")).toBe("");
    expect(sanitizeHtml(null)).toBe("");
    expect(sanitizeHtml(undefined)).toBe("");
  });
});

describe("stripDangerousHtml", () => {
  it("remove iframe/object/embed/noscript", () => {
    const html = `<iframe src="x"></iframe><object></object><embed src="y"><noscript>n</noscript><p>ok</p>`;
    expect(stripDangerousHtml(html)).toBe("<p>ok</p>");
  });
});
