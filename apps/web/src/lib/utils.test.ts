import { describe, expect, it } from "vitest";
import { stripHtml } from "./utils";

describe("stripHtml", () => {
  it("remove tags preservando o texto", () => {
    expect(stripHtml("<p>Olá <b>mundo</b></p>")).toBe("Olá mundo");
  });

  it("resolve entidades numéricas hex/decimais", () => {
    expect(stripHtml("&#x41;&#66;")).toBe("AB");
    expect(stripHtml("&#72;i")).toBe("Hi");
  });

  it("resolve entidades nomeadas comuns", () => {
    expect(stripHtml("a&nbsp;b &amp; c &quot;d&quot; &#39;e&apos; &lt;f&gt;")).toBe(
      `a b & c "d" 'e' <f>`,
    );
  });

  it("colapsa whitespace e faz trim", () => {
    expect(stripHtml("<p>a</p>\n<p>  b  </p>")).toBe("a b");
  });

  it("aceita null/undefined/vazio", () => {
    expect(stripHtml(null)).toBe("");
    expect(stripHtml(undefined)).toBe("");
    expect(stripHtml("")).toBe("");
  });
});
