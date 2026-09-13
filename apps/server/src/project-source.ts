/**
 * External project context ("Meu projeto" in Ajustes → Organização).
 *
 * A global, per-student source of truth: a GitHub repo link plus uploaded
 * docs/slides/PDFs, extracted to text and injected into answer drafts that need
 * project context. Extraction is best-effort — a scanned PDF or an Office file
 * without LibreOffice is kept but marked `unsupported`, never fatal.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assist } from "./paths.js";
import { extractFileText } from "./pdf.js";
import {
  addProjectSourceFile,
  deleteProjectSourceFile,
  getProjectSource,
  getProjectSourceFilePath,
  projectSourceText,
} from "./store.js";
import type { ProjectReadmeStatus, ProjectSourceFile, ProjectSourceFileStatus } from "./types.js";

export const PROJECT_FILE_MAX_BYTES = 25 * 1024 * 1024;
const MAX_FILE_CHARS = 60_000;
const MAX_SOURCE_CHARS = 12_000;

/** Where uploaded project files live (gitignored via `data/`). */
export function projectSourceDir(): string {
  return assist("data", "project");
}

const TEXT_EXTS = new Set([".txt", ".md", ".markdown", ".csv", ".json", ".html", ".htm"]);
const OFFICE_EXTS = new Set([
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".xls",
  ".xlsx",
  ".odt",
  ".ods",
  ".odp",
  ".rtf",
]);

export type ProjectFileKind = "pdf" | "office" | "text" | "other";

export function projectFileKind(filename: string): ProjectFileKind {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".pdf") return "pdf";
  if (OFFICE_EXTS.has(ext)) return "office";
  if (TEXT_EXTS.has(ext)) return "text";
  return "other";
}

/** Safe, filesystem-agnostic filename (forced non-empty). */
export function sanitizeProjectFilename(name: string): string {
  const base = (name ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[/\\:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 120)
    .trim();
  return base || "arquivo";
}

export interface GithubRepoRef {
  owner: string;
  repo: string;
  url: string;
}

/** Parse a GitHub repo URL (`https://github.com/owner/repo[.git|/…]`). */
export function parseGithubRepo(rawUrl: string): GithubRepoRef | null {
  const trimmed = (rawUrl ?? "").trim();
  if (!trimmed) return null;
  let u: URL;
  try {
    u = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (!/(^|\.)github\.com$/i.test(u.hostname)) return null;
  const parts = u.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, "");
  if (!owner || !repo) return null;
  return { owner, repo, url: `https://github.com/${owner}/${repo}` };
}

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "lxp-toolkit",
  };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

export interface GithubReadmeResult {
  text: string;
  status: ProjectReadmeStatus;
  detail: string;
}

/**
 * Fetch a repo's description/language + README as AI context. Works for public
 * repos without a token; set `GITHUB_TOKEN` for private repos and higher rate
 * limits. Never throws — errors come back as `status: "error"`.
 */
export async function fetchGithubReadme(rawUrl: string): Promise<GithubReadmeResult> {
  const ref = parseGithubRepo(rawUrl);
  if (!ref) return { text: "", status: "error", detail: "URL do GitHub inválida." };

  try {
    const metaRes = await fetch(`https://api.github.com/repos/${ref.owner}/${ref.repo}`, {
      headers: githubHeaders(),
    });
    if (metaRes.status === 404) {
      return { text: "", status: "error", detail: "Repositório não encontrado ou privado." };
    }
    if (!metaRes.ok) {
      return { text: "", status: "error", detail: `GitHub respondeu HTTP ${metaRes.status}.` };
    }
    const meta = (await metaRes.json()) as {
      description?: string | null;
      language?: string | null;
    };
    const header = [
      `Repositório: ${ref.url}`,
      meta.description ? `Descrição: ${meta.description.trim()}` : "",
      meta.language ? `Linguagem: ${meta.language.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const readmeRes = await fetch(`https://api.github.com/repos/${ref.owner}/${ref.repo}/readme`, {
      headers: { ...githubHeaders(), accept: "application/vnd.github.raw" },
    });
    if (readmeRes.status === 404) {
      return { text: header, status: "empty", detail: "Repositório sem README." };
    }
    if (!readmeRes.ok) {
      return { text: "", status: "error", detail: `GitHub respondeu HTTP ${readmeRes.status}.` };
    }
    const readme = (await readmeRes.text()).trim().slice(0, MAX_FILE_CHARS);
    const text = `${header}${readme ? `\n\n${readme}` : ""}`.trim();
    return { text, status: text ? "ok" : "empty", detail: "" };
  } catch (err) {
    return { text: "", status: "error", detail: err instanceof Error ? err.message : String(err) };
  }
}

/** Persist an uploaded file and extract its text (best-effort). */
export async function addProjectFile(input: {
  filename: string;
  mime: string | null;
  data: Buffer;
}): Promise<ProjectSourceFile> {
  const filename = sanitizeProjectFilename(input.filename);
  const dir = projectSourceDir();
  mkdirSync(dir, { recursive: true });
  const hash = createHash("sha256").update(input.data).digest("hex");
  const ext = path.extname(filename).toLowerCase();
  const storedPath = path.join(dir, `${hash.slice(0, 16)}${ext}`);
  writeFileSync(storedPath, input.data);

  const kind = projectFileKind(filename);
  let text = "";
  let status: ProjectSourceFileStatus = "empty";
  try {
    if (kind === "pdf" || kind === "office") {
      const extracted = await extractFileText(storedPath);
      if (extracted && extracted.trim()) {
        text = extracted.trim().slice(0, MAX_FILE_CHARS);
        status = "ok";
      } else {
        status = kind === "office" ? "unsupported" : "empty";
      }
    } else if (kind === "text") {
      const plain = readFileSync(storedPath, "utf-8").trim();
      if (plain) {
        text = plain.slice(0, MAX_FILE_CHARS);
        status = "ok";
      }
    } else {
      status = "unsupported";
    }
  } catch {
    status = "error";
  }

  return addProjectSourceFile({
    filename,
    mime: input.mime,
    sizeBytes: input.data.length,
    storedPath,
    text,
    status,
    contentHash: hash,
  });
}

/** Remove a file row and its bytes on disk (best-effort). */
export async function removeProjectFile(id: number): Promise<boolean> {
  const storedPath = await getProjectSourceFilePath(id);
  const removed = await deleteProjectSourceFile(id);
  if (removed && storedPath) {
    try {
      rmSync(storedPath, { force: true });
    } catch {
      /* best-effort */
    }
  }
  return removed;
}

/**
 * Prompt-ready block with the student's external project context (repo +
 * notes + README + extracted file text). Returns "" when nothing is configured.
 */
export async function buildExternalProjectBlock(): Promise<string> {
  const source = await getProjectSource();
  const parts: string[] = [];
  if (source.title.trim()) parts.push(`Projeto: ${source.title.trim()}.`);
  if (source.githubUrl.trim()) parts.push(`Repositório GitHub: ${source.githubUrl.trim()}.`);
  if (source.notes.trim()) parts.push(`Notas do aluno sobre o projeto:\n${source.notes.trim()}`);
  if (source.readmeText.trim()) parts.push(`README do projeto:\n${source.readmeText.trim()}`);

  const files = await projectSourceText(MAX_SOURCE_CHARS);
  if (files) parts.push(`Documentos do projeto:\n${files}`);

  if (parts.length === 0) return "";
  const block = `Contexto do projeto do aluno (fora da plataforma):\n\n${parts.join("\n\n")}`;
  return block.slice(0, MAX_SOURCE_CHARS + 4000);
}
