import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Save, Trash, TriangleAlert } from "lucide-react";
import { saveProfessorPhoto } from "@/api";
import type { ProfessorLink } from "@/types";
import { useAppData } from "@/lib/app-state";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubjectAvatar } from "./identity";

interface ProfessorEntry {
  id: number;
  name: string;
  modules: string[];
}

/**
 * Management list for professor photos (Ajustes → Pessoal). Derived from the
 * loaded exercises, merged with the stored links.
 */
export function ProfessorPhotoList() {
  const { items, professorLinks, refresh } = useAppData();
  const { t } = useT();

  const professors = useMemo(() => {
    const map = new Map<number, ProfessorEntry>();
    for (const e of items) {
      if (e.professorId == null || !e.professor) continue;
      const entry = map.get(e.professorId) ?? { id: e.professorId, name: e.professor, modules: [] };
      if (e.moduleName && !entry.modules.includes(e.moduleName)) entry.modules.push(e.moduleName);
      map.set(e.professorId, entry);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "pt"));
  }, [items]);

  if (professors.length === 0) {
    return <p className="text-xs text-muted-foreground">{t("settings.professorsEmpty")}</p>;
  }

  return (
    <div className="space-y-2">
      {professors.map((p) => (
        <ProfessorPhotoRow
          key={p.id}
          professor={p}
          link={professorLinks.find((l) => l.professorId === p.id) ?? null}
          onSaved={refresh}
        />
      ))}
    </div>
  );
}

function ProfessorPhotoRow({
  professor,
  link,
  onSaved,
}: {
  professor: ProfessorEntry;
  link: ProfessorLink | null;
  onSaved: () => Promise<void> | void;
}) {
  const { t } = useT();
  const [linkedin, setLinkedin] = useState(link?.linkedinUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLinkedin(link?.linkedinUrl ?? "");
  }, [link?.linkedinUrl]);

  const save = async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await saveProfessorPhoto({
        professorId: professor.id,
        linkedinUrl: linkedin.trim(),
        imageUrl: link?.imageUrl ?? "",
      });
      await onSaved();
      if (res.resolved) setMsg(t("profPhoto.saved"));
      else if (res.removed) setMsg(t("profPhoto.removed"));
      else setErr(t("profPhoto.unresolved"));
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await saveProfessorPhoto({ professorId: professor.id, linkedinUrl: "", imageUrl: "" });
      await onSaved();
      setMsg(t("profPhoto.removed"));
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  };

  const dirty = linkedin.trim() !== (link?.linkedinUrl ?? "");

  return (
    <div className="rounded-lg border border-border bg-card/60 p-3">
      <div className="flex items-start gap-3">
        <SubjectAvatar
          moduleName={professor.modules[0] ?? ""}
          imageUrl={link?.photoUrl}
          className="size-10 self-start"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground/90">{professor.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">{professor.modules.join(" · ")}</p>
          <div className="mt-2 flex items-center gap-2">
            <Input
              value={linkedin}
              onChange={(ev) => {
                setLinkedin(ev.target.value);
                setMsg(null);
                setErr(null);
              }}
              placeholder="https://www.linkedin.com/in/…"
              className="h-7 text-[13px]"
              disabled={busy}
              inputMode="url"
              aria-label={`${t("profPhoto.linkedinLabel")} — ${professor.name}`}
            />
            <Button size="sm" onClick={() => void save()} disabled={busy || !dirty}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
              {t("settings.professorsSave")}
            </Button>
            {link && (
              <Button variant="ghost" size="sm" onClick={() => void remove()} disabled={busy} aria-label={t("profPhoto.remove")}>
                <Trash aria-hidden />
              </Button>
            )}
          </div>
          {msg && (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-ok">
              <Check className="size-3" aria-hidden /> {msg}
            </p>
          )}
          {err && (
            <p className="mt-1.5 flex items-start gap-1 text-[11px] text-destructive">
              <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden /> {err}
            </p>
          )}
          {!err && !msg && link?.status === "failed" && (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <TriangleAlert className="size-3" aria-hidden /> {t("settings.professorsNone")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
