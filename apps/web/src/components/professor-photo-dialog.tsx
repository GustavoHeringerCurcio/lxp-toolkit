import { useEffect, useState } from "react";
import { Camera, ImageOff, Link2, Loader2, Trash, TriangleAlert } from "lucide-react";
import { saveProfessorPhoto } from "@/api";
import type { ProfessorLink } from "@/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SubjectAvatar } from "./identity";

/**
 * Configure the photo shown for a professor (and on the subject tile) from a
 * LinkedIn URL — resolved + cached by the server — or a direct image URL.
 */
export function ProfessorPhotoDialog({
  open,
  onOpenChange,
  professorId,
  professorName,
  moduleName,
  link,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  professorId: number;
  professorName: string | null;
  moduleName?: string | null;
  link?: ProfessorLink | null;
  onSaved: () => Promise<void> | void;
}) {
  const { t } = useT();
  const [linkedin, setLinkedin] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLinkedin(link?.linkedinUrl ?? "");
    setImageUrl(link?.imageUrl ?? "");
    setErr(null);
  }, [open, link]);

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await saveProfessorPhoto({
        professorId,
        linkedinUrl: linkedin.trim(),
        imageUrl: imageUrl.trim(),
      });
      await onSaved();
      onOpenChange(false);
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setErr(null);
    try {
      await saveProfessorPhoto({ professorId, linkedinUrl: "", imageUrl: "" });
      await onSaved();
      onOpenChange(false);
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  };

  const previewSrc = imageUrl.trim() || link?.photoUrl || null;
  const hasLink = Boolean(link);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("profPhoto.title")}</DialogTitle>
          <DialogDescription>
            {t("profPhoto.desc", { name: professorName ?? "", module: moduleName ?? "" })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4">
          <SubjectAvatar
            moduleName={moduleName ?? ""}
            imageUrl={previewSrc}
            iconClassName="size-7"
            className="size-16 rounded-xl text-lg"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-heading text-sm font-semibold">{professorName}</p>
            {moduleName && <p className="truncate text-xs text-muted-foreground">{moduleName}</p>}
            {!previewSrc && (
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                <ImageOff className="size-3" aria-hidden />
                {t("settings.professorsNone")}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-foreground/90" htmlFor="prof-linkedin">
            {t("profPhoto.linkedinLabel")}
          </label>
          <div className="relative">
            <Link2
              className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="prof-linkedin"
              value={linkedin}
              onChange={(ev) => setLinkedin(ev.target.value)}
              placeholder="https://www.linkedin.com/in/…"
              className="pl-8"
              disabled={busy}
              inputMode="url"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">{t("profPhoto.linkedinHint")}</p>
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-foreground/90" htmlFor="prof-image">
            {t("profPhoto.imageLabel")}
          </label>
          <Input
            id="prof-image"
            value={imageUrl}
            onChange={(ev) => setImageUrl(ev.target.value)}
            placeholder="https://…/foto.jpg"
            disabled={busy}
            inputMode="url"
          />
          <p className="text-[11px] text-muted-foreground">{t("profPhoto.imageHint")}</p>
        </div>

        {err && (
          <p className="flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {err}
          </p>
        )}

        <p className="text-[11px] text-muted-foreground">{t("profPhoto.privacy")}</p>

        <div className={cn("flex items-center gap-2 border-t border-border/60 pt-3", hasLink ? "justify-between" : "justify-end")}>
          {hasLink && (
            <Button variant="ghost" size="sm" onClick={() => void remove()} disabled={busy}>
              <Trash aria-hidden />
              {t("profPhoto.remove")}
            </Button>
          )}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={busy || (!linkedin.trim() && !imageUrl.trim())}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Camera aria-hidden />}
              {busy ? t("profPhoto.saving") : t("profPhoto.save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
