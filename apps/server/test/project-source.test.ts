import { describe, expect, it } from "vitest";
import {
  parseGithubRepo,
  projectFileKind,
  sanitizeProjectFilename,
} from "../src/project-source.js";

describe("parseGithubRepo", () => {
  it("parses a full https URL", () => {
    expect(parseGithubRepo("https://github.com/acme/library-system")).toEqual({
      owner: "acme",
      repo: "library-system",
      url: "https://github.com/acme/library-system",
    });
  });

  it("accepts a .git suffix and trailing path/query", () => {
    expect(parseGithubRepo("https://github.com/acme/app.git/tree/main")).toMatchObject({
      owner: "acme",
      repo: "app",
    });
  });

  it("accepts a bare host/path without a scheme", () => {
    expect(parseGithubRepo("github.com/acme/app")).toMatchObject({ owner: "acme", repo: "app" });
  });

  it("rejects non-github hosts and incomplete paths", () => {
    expect(parseGithubRepo("https://gitlab.com/acme/app")).toBeNull();
    expect(parseGithubRepo("https://github.com/acme")).toBeNull();
    expect(parseGithubRepo("")).toBeNull();
    expect(parseGithubRepo("not a url")).toBeNull();
  });
});

describe("projectFileKind", () => {
  it("classifies pdf, office and text files", () => {
    expect(projectFileKind("doc.pdf")).toBe("pdf");
    expect(projectFileKind("slides.PPTX")).toBe("office");
    expect(projectFileKind("notes.md")).toBe("text");
    expect(projectFileKind("data.csv")).toBe("text");
    expect(projectFileKind("archive.zip")).toBe("other");
  });
});

describe("sanitizeProjectFilename", () => {
  it("strips path separators and control characters", () => {
    expect(sanitizeProjectFilename("../../etc/passwd")).toBe("etcpasswd");
    expect(sanitizeProjectFilename("my\u0000file.pdf")).toBe("myfile.pdf");
  });

  it("falls back to a default when empty", () => {
    expect(sanitizeProjectFilename("   ")).toBe("arquivo");
    expect(sanitizeProjectFilename("")).toBe("arquivo");
  });
});
