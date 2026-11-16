import { describe, expect, it } from "vitest";
import { artifactExtension } from "../src/reports.js";

describe("artifactExtension", () => {
  it("prefers the filename extension", () => {
    expect(artifactExtension("pdf", "Nome - Atividade.pdf")).toBe("pdf");
    expect(artifactExtension("image", "print.PNG")).toBe("png");
    expect(artifactExtension("weird", "a.bin")).toBe("bin");
  });

  it("falls back to the delivery mode", () => {
    expect(artifactExtension("pdf")).toBe("pdf");
    expect(artifactExtension("fill")).toBe("pdf");
    expect(artifactExtension("docx")).toBe("docx");
    expect(artifactExtension("txt")).toBe("txt");
    expect(artifactExtension("quiz")).toBe("json");
    expect(artifactExtension("image")).toBe("png");
  });
});
