import { describe, expect, it } from "vitest";
import { sanitizeHtml, stripDangerousHtml } from "../src/sanitize.js";

describe("sanitizeHtml", () => {
  it("remove blocos perigosos e comentários", () => {
    const html = `<p>oi</p><script>alert(1)</script><style>p{color:red}</style><!-- x -->`;
    expect(sanitizeHtml(html)).toBe("<p>oi</p>");
  });

  it("mantém a estrutura de parágrafos e listas", () => {
    const html = `<div style="text-align: justify;"><p>Um</p><ul><li><p>Dois</p></li><li>Três</li></ul></div>`;
    expect(sanitizeHtml(html)).toBe(
      `<div data-align="justify"><p>Um</p><ul><li><p>Dois</p></li><li>Três</li></ul></div>`,
    );
  });

  it("desembrulha elementos customizados preservando o texto", () => {
    const html = `<p>Veja <grupoaattachment file="x.pdf">o anexo</grupoaattachment> agora.</p>`;
    expect(sanitizeHtml(html)).toBe("<p>Veja o anexo agora.</p>");
  });

  it("converte anexos e links do portal em âncoras seguras", () => {
    const attachment = `<grupoaattachment file="https://x.test/a.pdf" filename="A.pdf"></grupoaattachment>`;
    expect(sanitizeHtml(attachment)).toBe(
      `<a href="https://x.test/a.pdf" target="_blank" rel="noreferrer">A.pdf</a>`,
    );
    const link = `<grupoalink href="https://x.test/doc" text="Ver doc"></grupoalink>`;
    expect(sanitizeHtml(link)).toBe(
      `<a href="https://x.test/doc" target="_blank" rel="noreferrer">Ver doc</a>`,
    );
    const video = `<grupoavideo type="youtube" url="https://www.youtube.com/embed/abc"></grupoavideo>`;
    expect(sanitizeHtml(video)).toBe(
      `<a href="https://www.youtube.com/embed/abc" target="_blank" rel="noreferrer">https://www.youtube.com/embed/abc</a>`,
    );
  });

  it("converte o banner do layout em imagem e descarta fontes inseguras", () => {
    expect(sanitizeHtml(`<grupoalayout banner="https://x.test/b.jpg" bannername="capa"></grupoalayout>`)).toBe(
      `<img src="https://x.test/b.jpg" alt="capa">`,
    );
    expect(sanitizeHtml(`<grupoaattachment file="javascript:alert(1)" filename="x"></grupoaattachment>`)).toBe("");
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
