import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildAiAttachments, MAX_ATTACHMENTS } from "../src/attachments.js";
import type { PdfRef } from "../src/types.js";

function dir(): string {
  return mkdtempSync(path.join(tmpdir(), "lxp-attachments-"));
}

function ref(base: string, name: string): PdfRef {
  return { name, relPath: name, absPath: path.join(base, name), remoteUrl: "" };
}

describe("buildAiAttachments", () => {
  it("envia PDF como file part e imagem como image_url", async () => {
    const base = dir();
    writeFileSync(path.join(base, "a.pdf"), Buffer.from("%PDF-1.4\nfake"));
    writeFileSync(path.join(base, "d.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const built = await buildAiAttachments([ref(base, "a.pdf"), ref(base, "d.png")]);

    expect(built.parts).toHaveLength(2);
    expect(built.parts[0]).toMatchObject({ type: "file", file: { filename: "a.pdf" } });
    expect((built.parts[0] as { file: { file_data: string } }).file.file_data).toMatch(
      /^data:application\/pdf;base64,/,
    );
    expect(built.parts[1]).toMatchObject({ type: "image_url", image_url: { detail: "high" } });
    expect((built.parts[1] as { image_url: { url: string } }).image_url.url).toMatch(
      /^data:image\/png;base64,/,
    );
    expect([...built.attachedNames]).toEqual(["a.pdf", "d.png"]);
    expect(built.skipped).toEqual([]);
  });

  it("respeita o limite de arquivos e ignora formatos sem suporte", async () => {
    const base = dir();
    const files: PdfRef[] = [];
    for (let i = 0; i < MAX_ATTACHMENTS + 1; i++) {
      const name = `f${i}.pdf`;
      writeFileSync(path.join(base, name), Buffer.from("%PDF-1.4\n"));
      files.push(ref(base, name));
    }
    const zip = "a.zip";
    writeFileSync(path.join(base, zip), Buffer.from("zip"));
    files.push(ref(base, zip));

    const built = await buildAiAttachments(files);

    expect(built.parts).toHaveLength(MAX_ATTACHMENTS);
    expect(built.skipped.length).toBe(2);
    expect(built.skipped.some((s) => s.name === "a.zip")).toBe(true);
  });

  it("ignora arquivo inexistente sem lançar", async () => {
    const base = dir();
    const built = await buildAiAttachments([ref(base, "missing.pdf")]);
    expect(built.parts).toHaveLength(0);
    expect(built.skipped[0]?.name).toBe("missing.pdf");
  });
});
