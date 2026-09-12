import { describe, expect, it } from "vitest";
import { parseLinkedinUrl, unavatarUrl } from "../src/linkedin.js";

describe("parseLinkedinUrl", () => {
  it("normaliza uma URL completa preservando o slug percent-encoded", () => {
    const parsed = parseLinkedinUrl(
      "https://www.linkedin.com/in/d%C3%A9bora-amorim-de-carvalho-33867462/",
    );
    expect(parsed).toEqual({
      slug: "d%C3%A9bora-amorim-de-carvalho-33867462",
      url: "https://www.linkedin.com/in/d%C3%A9bora-amorim-de-carvalho-33867462",
    });
  });

  it("aceita slug sem acento e barra final", () => {
    expect(parseLinkedinUrl("linkedin.com/in/leonardo-dias/")?.slug).toBe("leonardo-dias");
  });

  it("aceita um slug solto", () => {
    expect(parseLinkedinUrl("debora-amorim")?.url).toBe(
      "https://www.linkedin.com/in/debora-amorim",
    );
  });

  it("ignora querystring e hash", () => {
    expect(parseLinkedinUrl("https://linkedin.com/in/fulano?trk=abc#top")?.slug).toBe("fulano");
  });

  it("rejeita vazio e valores com espaços", () => {
    expect(parseLinkedinUrl("")).toBeNull();
    expect(parseLinkedinUrl(null)).toBeNull();
    expect(parseLinkedinUrl("nao e um slug")).toBeNull();
  });

  it("rejeita slug longo demais", () => {
    expect(parseLinkedinUrl("a".repeat(121))).toBeNull();
  });
});

describe("unavatarUrl", () => {
  it("não recodifica um slug já percent-encoded", () => {
    expect(unavatarUrl("d%C3%A9bora-amorim")).toBe(
      "https://unavatar.io/linkedin/d%C3%A9bora-amorim",
    );
  });

  it("codifica um slug com acentos", () => {
    expect(unavatarUrl("débora")).toBe("https://unavatar.io/linkedin/d%C3%A9bora");
  });
});
