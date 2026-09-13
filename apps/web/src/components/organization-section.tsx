import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Check, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { fetchOrganizations, saveProfessorPhoto } from "@/api";
import type { OrganizationDto, OrganizationProfessor } from "@/types";
import { useAppData } from "@/lib/app-state";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SubjectAvatar } from "./identity";

/**
 * Organization section (Ajustes → Organização).
 *
 * Organizations and their professor → LinkedIn lists are **hardcoded** in
 * `apps/server/config/organizations.json`. The avatars load straight from
 * unavatar in the browser; applying a directory entry stores it as a personal
 * `professor_link` (which wins over the directory).
 */
export function OrganizationSection() {
  const { t } = useT();
  const { items, professorLinks, refresh } = useAppData();
  const [orgs, setOrgs] = useState<OrganizationDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      setOrgs(await fetchOrganizations());
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => orgs.find((o) => o.id === selectedId) ?? orgs.find((o) => o.selected) ?? orgs[0] ?? null,
    [orgs, selectedId],
  );

  const modulesFor = (professorId: number | null): string[] => {
    if (professorId == null) return [];
    return [
      ...new Set(
        items.filter((e) => e.professorId === professorId && e.moduleName).map((e) => e.moduleName),
      ),
    ];
  };

  const personalFor = (professorId: number | null) =>
    professorId == null ? null : professorLinks.find((l) => l.professorId === professorId) ?? null;

  const apply = async (professorId: number, linkedin: string) => {
    setBusy(true);
    setErr(null);
    try {
      await saveProfessorPhoto({ professorId, linkedinUrl: linkedin });
      await refresh();
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  };

  const applyAll = async () => {
    if (!selected) return;
    const pending = selected.professors.filter(
      (p) => p.matched && p.professorId != null && p.photoUrl && !personalFor(p.professorId),
    );
    if (pending.length === 0) return;
    setBusy(true);
    setErr(null);
    try {
      for (const p of pending) {
        await saveProfessorPhoto({ professorId: p.professorId as number, linkedinUrl: p.linkedin });
      }
      await refresh();
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  };

  if (orgs.length === 0) {
    return <p className="text-xs text-muted-foreground">{err ?? t("org.empty")}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {orgs.map((o) => {
          const isSelected = selected?.id === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => setSelectedId(o.id)}
              aria-pressed={isSelected}
              title={o.name}
              className={cn(
                "relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-full border-2 bg-card transition",
                isSelected ? "border-brand ring-2 ring-brand/20" : "border-border opacity-70 hover:opacity-100",
              )}
            >
              {o.logo ? (
                <img src={o.logo} alt={o.name} className="size-full object-contain p-2" loading="lazy" />
              ) : (
                <span className="font-heading text-lg font-semibold">{o.name.slice(0, 1)}</span>
              )}
              {isSelected && (
                <span className="absolute -right-0.5 -bottom-0.5 grid size-5 place-items-center rounded-full bg-brand text-primary-foreground">
                  <Check className="size-3" aria-hidden />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Building2 className="size-4 text-brand" aria-hidden />
            <span className="font-heading text-sm font-semibold">{selected.name}</span>
            {selected.host && <span className="text-[11px] text-muted-foreground">{selected.host}</span>}
          </div>

          <div className="flex items-start justify-between gap-3 border-t border-border/60 pt-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground/90">{t("org.directory")}</p>
              <p className="text-[11px] text-muted-foreground">{t("org.directoryHint")}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => void applyAll()} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
              {t("org.applyAll")}
            </Button>
          </div>

          {err && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
              {err}
            </p>
          )}

          <div className="space-y-2">
            {selected.professors.map((p) => (
              <DirectoryRow
                key={`${p.professorName}-${p.linkedin}`}
                entry={p}
                modules={modulesFor(p.professorId)}
                personal={Boolean(personalFor(p.professorId))}
                busy={busy}
                onApply={() => {
                  if (p.professorId != null) void apply(p.professorId, p.linkedin);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DirectoryRow({
  entry,
  modules,
  personal,
  busy,
  onApply,
}: {
  entry: OrganizationProfessor;
  modules: string[];
  personal: boolean;
  busy: boolean;
  onApply: () => void;
}) {
  const { t } = useT();
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/60 p-3">
      <SubjectAvatar
        moduleName={modules[0] ?? entry.displayName ?? entry.professorName}
        imageUrl={entry.photoUrl}
        className="size-10"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground/90">
          {entry.displayName ?? entry.professorName}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {entry.matched ? modules.join(" · ") || entry.professorName : t("org.unmatched")}
        </p>
      </div>
      {personal && (
        <span className="shrink-0 rounded-full border border-ok/30 bg-ok/10 px-2 py-0.5 text-[10px] font-semibold text-ok">
          {t("org.applied")}
        </span>
      )}
      <a
        href={entry.linkedin}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        aria-label={t("org.openLinkedin")}
      >
        <ExternalLink className="size-3.5" />
      </a>
      <Button size="sm" variant={personal ? "ghost" : "outline"} onClick={onApply} disabled={busy || !entry.matched}>
        {t("org.apply")}
      </Button>
    </div>
  );
}
