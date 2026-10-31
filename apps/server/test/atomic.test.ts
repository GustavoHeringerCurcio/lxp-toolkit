import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeFileAtomic } from "../src/atomic.js";

const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "lxp-atomic-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("writeFileAtomic", () => {
  it("writes a complete file and leaves no temp file behind", () => {
    const dir = tempDir();
    const file = path.join(dir, "exercises.json");

    writeFileAtomic(file, JSON.stringify({ exercises: [1, 2, 3] }));

    expect(JSON.parse(readFileSync(file, "utf-8"))).toEqual({ exercises: [1, 2, 3] });
    expect(readdirSync(dir)).toEqual(["exercises.json"]);
  });

  it("replaces an existing file in place", () => {
    const dir = tempDir();
    const file = path.join(dir, "exercises.json");

    writeFileAtomic(file, "old");
    writeFileAtomic(file, "new");

    expect(readFileSync(file, "utf-8")).toBe("new");
    expect(readdirSync(dir)).toEqual(["exercises.json"]);
  });
});
