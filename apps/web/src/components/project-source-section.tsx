import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, FileText, FolderGit2, Loader2, RefreshCw, Save, Trash2, Upload } from "lucide-react";
import {
  deleteProjectFile,
  fetchProjectReadme,
  fetchProjectSource,
  saveProjectSource,
  uploadProjectFile,
} from "@/api";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ProjectSourceFile, ProjectSourceFileStatus, ProjectSourceState } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const STATUS_CLS: Record<ProjectSourceFileStatus, string> = {
  ok: "border-ok/30 bg-ok/10 text-ok",
  empty: "border-border bg-muted/50 text-muted-foreground",
  unsupported: "border-soon/30 bg-soon/10 text-soon",
  error: "border-destructive/40 bg-destructive/10 text-destructive",
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * "Meu projeto" (Ajustes → Organização): a global, per-student external project
 * context — GitHub repo link plus uploaded docs/slides/PDFs. The server extracts
 * their text and injects it into answer drafts that need project context.
 */
export function ProjectSourceSection() {
  const { t } = useT();
  const [source, setSource] = useState<ProjectSourceState | null>(null);
  const [files, setFiles] = useState<ProjectSourceFile[]>([]);
  const [title, setTitle] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const applySource = useCallback((s: ProjectSourceState) => {
    setSource(s);
    setTitle(s.title);
    setGithubUrl(s.githubUrl);
    setNotes(s.notes);
  }, []);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const data = await fetchProjectSource();
      applySource(data.source);
      setFiles(data.files);
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    }
  }, [applySource]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const s = await saveProjectSource({ title, githubUrl, notes });
      applySource(s);
      setMsg(t("org.project.saved"));
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  };

  const fetchReadme = async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const r = await fetchProjectReadme(githubUrl);
      applySource(r.source);
      if (r.status === "ok") setMsg(t("org.project.readmeOk"));
      else if (r.status === "empty") setMsg(t("org.project.readmeEmpty"));
      else setErr(r.detail || t("org.project.readmeError"));
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  };

  const onFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setUploading(true);
    setErr(null);
    setMsg(null);
    try {
      for (const f of Array.from(list)) {
        const file = await uploadProjectFile(f);
        setFiles((prev) => [...prev, file]);
      }
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async (id: number) => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await deleteProjectFile(id);
      setFiles((prev) => prev.filter((f) => f.id !== id));
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  };

  const readmeFetched = source?.readmeStatus === "ok" && source.readmeFetchedAt;

  return (
    <div className="space-y-4 border-t border-border/60 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground/90">
            <FolderGit2 className="size-4 text-brand" aria-hidden />
            {t("org.project.title")}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{t("org.project.desc")}</p>
        </div>
        {readmeFetched && (
          <span className="shrink-0 rounded-full border border-ok/30 bg-ok/10 px-2 py-0.5 text-[10px] font-semibold text-ok">
            {t("org.project.readmeBadge")}
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            {t("org.project.name")}
          </span>
          <Input
            value={title}
            onChange={(ev) => setTitle(ev.target.value)}
            placeholder={t("org.project.namePlaceholder")}
            disabled={busy}
          />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            {t("org.project.repo")}
          </span>
          <Input
            value={githubUrl}
            onChange={(ev) => setGithubUrl(ev.target.value)}
            placeholder={t("org.project.repoPlaceholder")}
            disabled={busy}
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          {t("org.project.notes")}
        </span>
        <Textarea
          value={notes}
          onChange={(ev) => setNotes(ev.target.value)}
          rows={3}
          className="min-h-20 leading-relaxed"
          placeholder={t("org.project.notesPlaceholder")}
          disabled={busy}
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void save()} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
          {busy ? t("org.project.saving") : t("org.project.save")}
        </Button>
        <Button variant="outline" size="sm" onClick={() => void fetchReadme()} disabled={busy || !githubUrl.trim()}>
          <RefreshCw aria-hidden />
          {t("org.project.fetch")}
        </Button>
      </div>

      <div className="space-y-2 border-t border-border/60 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-foreground/90">{t("org.project.files")}</p>
            <p className="text-[11px] text-muted-foreground">{t("org.project.filesHint")}</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(ev) => void onFiles(ev.target.files)}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
            {uploading ? t("org.project.uploading") : t("org.project.addFiles")}
          </Button>
        </div>

        {files.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("org.project.noFiles")}</p>
        ) : (
          <ul className="space-y-2">
            {files.map((f) => (
              <li
                key={f.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-card/60 p-2.5"
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground/90">{f.filename}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {formatBytes(f.sizeBytes)}
                    {f.charCount > 0 ? ` · ${t("org.project.chars", { n: f.charCount })}` : ""}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                    STATUS_CLS[f.status],
                  )}
                >
                  {t(`org.project.fileStatus.${f.status}`)}
                </span>
                <button
                  type="button"
                  onClick={() => void remove(f.id)}
                  disabled={busy}
                  aria-label={t("org.project.delete")}
                  className="shrink-0 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {msg && (
        <p className="flex items-center gap-1.5 rounded-md border border-ok/30 bg-ok/10 px-2.5 py-1.5 text-xs text-ok">
          <Check className="size-3.5" aria-hidden /> {msg}
        </p>
      )}
      {err && (
        <p className="flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden /> {err}
        </p>
      )}
    </div>
  );
}
