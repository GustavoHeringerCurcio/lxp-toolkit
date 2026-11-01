import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveDataPath } from "../src/paths.js";

describe("resolveDataPath", () => {
  it("maps the portable scraped/ prefix onto the current data root", () => {
    const root = path.join(path.sep, "data", "scraped");
    expect(resolveDataPath("scraped/courses/1/files/a.pdf", root)).toBe(
      path.join(root, "courses", "1", "files", "a.pdf"),
    );
    expect(resolveDataPath("scraped\\courses\\1\\files\\a.pdf", root)).toBe(
      path.join(root, "courses", "1", "files", "a.pdf"),
    );
  });

  it("accepts a path without the scraped/ prefix", () => {
    const root = path.join(path.sep, "data", "scraped");
    expect(resolveDataPath("courses/1/files/a.pdf", root)).toBe(
      path.join(root, "courses", "1", "files", "a.pdf"),
    );
  });
});
