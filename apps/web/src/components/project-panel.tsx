import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ExternalLink, FolderGit2, FolderKanban, Loader2, Settings2, TriangleAlert } from "lucide-react";
import { fetchProjectContext, saveProjectDefault, saveProjectUse } from "@/api";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ProjectContextDto } from "@/types";
import { Button } from "@/components/ui/button";
import { CollapsibleCard } from "@/components/collapsible-card";

type Busy = "load" | "activity" | "module" | null;

/**
 * The student's single college project (Ajustes -> Organizacao) used as
 * context for this activity.
 *
 * Everything is explicit: the activity switch can inherit the module/discipline
 * default, force on, or force off. No model guesses whether a project is needed.
 */
export function ProjectPanel({ e }: { e: ExerciseLike }) {
  const { t } = useT();
  const navigate = useNavigate();
  const [ctx, setCtx] = useState<ProjectContextDto | null>(null);
  const [busy, setBusy] = useState<Busy>("load");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    setCtx(await fetchProjectContext(e.id));
  }, [e.id]);

  useEffect(() => {
    let alive = true;
    setBusy("load");
    load()
      .catch((x) => {
        if (alive) setErr(x instanceof Error ? x.message : String(x));
      })
      .finally(() => {
        if (alive) setBusy(null);
      });
    return () => {
      alive = false;
    };
  }, [load]);

  const openSettings = () => {
    try {
      window.localStorage.setItem("lxp.settings.tab", JSON.stringify("organizacao"));
    } catch {
      /* storage unavailable */
    }
    navigate("/settings");
  };

  const run = async (kind: Exclude<Busy, null | "load">, fn: () => Promise<unknown>) => {
    setBusy(kind);
    setErr(null);
    try {
      await fn();
      await load();
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(null);
    }
  };

  const moduleLabel = ctx?.module.name?.trim() || ctx?.module.title?.trim() || t("project.noModule");
  const override = ctx?.activityOverride ?? null;
  const enabled = ctx?.enabled === true;
  const disabled = busy !== null;

  return (
    <CollapsibleCard
      id="projeto"
      icon={<FolderKanban className="size-4 shrink-0 text-brand" aria-hidden />}
      title={t("project.title")}
      badge={
        ctx && (
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-medium",
              ctx.configured
                ? "border-ok/30 bg-ok/10 text-ok"
                : "border-soon/40 bg-soon/10 text-soon",
            )}
          >
            {ctx.configured ? ctx.project.title || t("project.configured") : t("project.notConfiguredShort")}
          </span>
        )
      }
      bodyClassName="space-y-3 p-4"
    >
      <p className="text-xs text-muted-foreground">{t("project.intro")}</p>

      {busy === "load" && !ctx ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> {t("project.loading")}
        </p>
      ) : ctx ? (
        <>
          <div className="rounded-lg border border-border bg-muted/25 p-3">
            <div className="flex items-start gap-2">
              <FolderGit2 className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground/90">
                  {ctx.project.title || t("project.notConfigured")}
                </p>
                {ctx.project.githubUrl ? (
                  <a
                    href={ctx.project.githubUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-brand underline-offset-4 hover:underline"
                  >
                    {t("project.openRepo")}
                    <ExternalLink className="size-3" aria-hidden />
                  </a>
                ) : null}
                {ctx.project.notes ? (
                  <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{ctx.project.notes}</p>
                ) : null}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <span>{t("project.files", { n: ctx.project.files.length })}</span>
                  <span>
                    {ctx.project.readmeStatus === "ok"
                      ? t("project.readmeOk")
                      : t("project.readmeMissing")}
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={openSettings}
              >
                <Settings2 aria-hidden />
                {t("project.edit")}
              </Button>
            </div>
            {!ctx.configured && (
              <p className="mt-2 flex items-start gap-1.5 rounded-md border border-soon/40 bg-soon/10 px-2.5 py-1.5 text-[11px] text-soon">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {t("project.configureHint")}
              </p>
            )}
          </div>

          <SwitchRow
            label={t("project.useHere")}
            hint={
              override !== null
                ? t("project.overridden")
                : enabled
                  ? t("project.inheritedOn", { module: moduleLabel })
                  : t("project.inheritedOff", { module: moduleLabel })
            }
            checked={enabled}
            disabled={disabled}
            onChange={(next) => void run("activity", () => saveProjectUse(e.id, next))}
          />
          {override !== null && (
            <button
              type="button"
              onClick={() => void run("activity", () => saveProjectUse(e.id, null))}
              disabled={disabled}
              className="text-[11px] font-medium text-brand underline-offset-4 hover:underline disabled:opacity-50"
            >
              {t("project.restore")}
            </button>
          )}

          <div className="border-t border-border/60 pt-3">
            <SwitchRow
              label={t("project.defaultHere", { module: moduleLabel })}
              hint={t("project.defaultHint")}
              checked={ctx.moduleDefault}
              disabled={disabled}
              onChange={(next) => void run("module", () => saveProjectDefault(ctx.module.id, next))}
            />
          </div>

          <p className="text-[11px] text-muted-foreground">
            {enabled ? t("project.enabledNote") : t("project.disabledNote")}
          </p>
        </>
      ) : null}

      {err && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
          {err}
        </p>
      )}
    </CollapsibleCard>
  );
}

function SwitchRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground/90">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50",
          checked ? "border-brand bg-brand" : "border-border bg-muted",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 grid size-4 place-items-center rounded-full bg-card shadow transition-transform",
            checked && "translate-x-5",
          )}
        >
          {checked && <Check className="size-3 text-brand" aria-hidden />}
        </span>
      </button>
    </div>
  );
}

type ExerciseLike = { id: number };
