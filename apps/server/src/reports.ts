/**
 * Artifact archive + beta bug reports.
 *
 * Every preview, download and send that produces a file (or a delivered text)
 * is copied to `data/artifacts` and indexed in Postgres. When the user reports a
 * problem while looking at the preview, the report snapshots the activity,
 * draft, gate verdict and the exact artifact bytes, and writes a human/agent
 * readable markdown bundle to `data/reports/<id>.md`.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assist } from "./paths.js";
import {
  getBugReport,
  getGeneratedArtifact,
  pruneGeneratedArtifacts,
  saveBugReport,
  saveGeneratedArtifact,
  setBugReportFilePath,
  type GeneratedArtifactInput,
} from "./store.js";
import type { ArtifactSource, BugReport, GeneratedArtifact, GateResult } from "./types.js";

/** Durable artifact bytes (gitignored, under apps/server/data). */
export function artifactDir(): string {
  return assist("data", "artifacts");
}

/** Markdown bundles for reported problems (gitignored). */
export function reportDir(): string {
  return assist("data", "reports");
}

/** Keep this many artifacts and this many days; referenced artifacts survive. */
export const ARTIFACT_KEEP_COUNT = 500;
export const ARTIFACT_KEEP_DAYS = 90;

const MODE_EXT: Record<string, string> = {
  pdf: "pdf",
  fill: "pdf",
  docx: "docx",
  txt: "txt",
  text: "txt",
  forum: "txt",
  mark: "txt",
  quiz: "json",
  image: "png",
};

function cleanExt(ext: string): string {
  return ext.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

/** File extension for an archived artifact. */
export function artifactExtension(mode: string, filename?: string | null): string {
  const fromName = cleanExt(path.extname(filename ?? "").replace(/^\./, ""));
  if (fromName) return fromName;
  return MODE_EXT[mode] ?? "bin";
}

function sidecarPath(file: string): string {
  return file.replace(/\.[a-z0-9]+$/i, "") + ".json";
}

function slug(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "relato"
  );
}

export interface ArchiveArtifactInput {
  contentItemId: number;
  mode: string;
  filename: string;
  bytes: Buffer;
  source: ArtifactSource;
  activityTitle: string;
  courseName?: string | null;
  moduleTitle?: string | null;
  draft?: string | null;
  gate?: GateResult | null;
}

/**
 * Copy the exact bytes to `data/artifacts` and index them. Identical bytes for
 * the same activity/mode are deduplicated by the store (bumping `uses`).
 * Never throws: the caller uses it on the preview/send path, which must keep
 * working even if the archive fails.
 */
export async function archiveArtifact(input: ArchiveArtifactInput): Promise<GeneratedArtifact | null> {
  try {
    const dir = artifactDir();
    mkdirSync(dir, { recursive: true });
    const sha256 = createHash("sha256").update(input.bytes).digest("hex");
    const ext = artifactExtension(input.mode, input.filename);
    const file = path.join(dir, `${input.contentItemId}-${sha256.slice(0, 16)}.${ext}`);
    if (!existsSync(file)) writeFileSync(file, input.bytes);

    const index: GeneratedArtifactInput = {
      contentItemId: input.contentItemId,
      source: input.source,
      mode: input.mode,
      filename: input.filename,
      path: file,
      sha256,
      bytes: input.bytes.length,
      activityTitle: input.activityTitle,
      courseName: input.courseName ?? null,
      moduleTitle: input.moduleTitle ?? null,
      draft: input.draft ?? null,
      gate: input.gate ?? null,
    };
    const artifact = await saveGeneratedArtifact(index);
    writeFileSync(
      sidecarPath(file),
      JSON.stringify(
        {
          artifact,
          activityTitle: index.activityTitle,
          courseName: index.courseName,
          moduleTitle: index.moduleTitle,
          gate: index.gate,
          draft: index.draft,
        },
        null,
        2,
      ),
      "utf-8",
    );
    void prune();
    return artifact;
  } catch {
    return null;
  }
}

/** Best-effort retention: drop old files and their sidecars. */
async function prune(): Promise<void> {
  try {
    const removed = await pruneGeneratedArtifacts(ARTIFACT_KEEP_COUNT, ARTIFACT_KEEP_DAYS);
    for (const file of removed) {
      rmSync(file, { force: true });
      rmSync(sidecarPath(file), { force: true });
    }
  } catch {
    /* retention is best-effort */
  }
}

export interface CreateBugReportInput {
  contentItemId: number;
  artifactId: number | null;
  activityTitle: string;
  courseName?: string | null;
  moduleTitle?: string | null;
  mode: string;
  message: string;
  draft?: string | null;
  gate?: GateResult | null;
}

function fmtGate(gate: GateResult | null | undefined): string {
  return gate ? `${gate.verdict}${gate.reason ? ` — ${gate.reason}` : ""}` : "(nenhum)";
}

/** Markdown bundle an agent can read without touching Postgres. */
function reportMarkdown(report: BugReport, artifact: GeneratedArtifact | null): string {
  const lines: string[] = [
    `# Relato de problema #${report.id}`,
    "",
    `- Quando: ${report.createdAt}`,
    `- Status: ${report.status}`,
    `- Atividade: ${report.activityTitle}${report.contentItemId != null ? ` (#${report.contentItemId})` : ""}`,
    `- Curso: ${report.courseName ?? "(desconhecido)"}`,
    `- Módulo: ${report.moduleTitle ?? "(desconhecido)"}`,
    `- Modo: ${report.mode}`,
    `- Gate: ${fmtGate(report.gate)}`,
  ];
  if (artifact) {
    lines.push(
      `- Artefato: #${artifact.id} ${artifact.filename} (${artifact.bytes} bytes)`,
      `- SHA-256: ${artifact.sha256}`,
      `- Arquivo: ${artifact.path}`,
      `- Download: /api/artifact/${artifact.id}`,
    );
  } else {
    lines.push("- Artefato: (não disponível)");
  }
  lines.push("", "## Relato", "", report.message.trim() || "(vazio)", "");
  if (report.draft) {
    lines.push("## Rascunho", "", "```", report.draft, "```", "");
  }
  return lines.join("\n");
}

/**
 * Create the report row, write its markdown bundle and return the saved report.
 */
export async function createBugReport(input: CreateBugReportInput): Promise<BugReport> {
  const id = await saveBugReport({
    contentItemId: input.contentItemId,
    artifactId: input.artifactId,
    activityTitle: input.activityTitle,
    courseName: input.courseName ?? null,
    moduleTitle: input.moduleTitle ?? null,
    mode: input.mode,
    message: input.message,
    draft: input.draft ?? null,
    gate: input.gate ?? null,
  });
  const artifact =
    input.artifactId != null ? await getGeneratedArtifact(input.artifactId) : null;
  const report = await getBugReport(id);
  if (report) {
    try {
      const dir = reportDir();
      mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${id}-${slug(report.activityTitle)}.md`);
      writeFileSync(file, reportMarkdown(report, artifact), "utf-8");
      await setBugReportFilePath(id, file);
      report.filePath = file;
    } catch {
      /* the DB row is still useful without the markdown bundle */
    }
  }
  return report ?? {
    id,
    contentItemId: input.contentItemId,
    artifactId: input.artifactId,
    activityTitle: input.activityTitle,
    courseName: input.courseName ?? null,
    moduleTitle: input.moduleTitle ?? null,
    mode: input.mode,
    message: input.message,
    draft: input.draft ?? null,
    gate: input.gate ?? null,
    status: "open",
    resolutionNotes: null,
    filePath: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    resolvedAt: null,
    hasArtifact: artifact != null,
    artifactFilename: artifact?.filename ?? null,
  };
}

/** Resolve the on-disk path for an artifact download, or null when missing. */
export async function artifactDownloadPath(id: number): Promise<GeneratedArtifact | null> {
  const artifact = await getGeneratedArtifact(id);
  if (!artifact || !existsSync(artifact.path)) return null;
  return artifact;
}
