import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Camera,
  CircleCheckBig,
  Copy,
  Download,
  ExternalLink,
  MoreHorizontal,
  Paperclip,
  Sparkles,
  Tag,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { saveTag } from "@/api";
import type { Exercise, FlavorSource, UploadFlavor } from "@/types";
import { fmtDeadline } from "@/lib/status";
import { contentLabel, kindMeta, canAiAnswer } from "@/lib/kind";
import { runMark } from "@/lib/mark";
import { useAppData } from "@/lib/app-state";
import { useT } from "@/lib/i18n";
import { ProfessorTag, SubjectAvatar, SubjectLabel } from "./identity";
import { ProfessorPhotoDialog } from "./professor-photo-dialog";
import { StatusBadge, DoneBadge, ActivityBadge } from "./status-badges";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export function ActivityCard({ e }: { e: Exercise }) {
  const navigate = useNavigate();
  const { patchExercise, professorLinks, refresh } = useAppData();
  const { t, tn, locale } = useT();
  const [marking, setMarking] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const professorLink =
    e.professorId != null ? professorLinks.find((l) => l.professorId === e.professorId) ?? null : null;
  const meta = kindMeta(e.kind);
  const fileCount = e.remoteFiles.length || e.files.length;
  const detail =
    e.kind === "quiz" && e.questions.length
      ? tn("plural.questions", e.questions.length)
      : e.kind === "upload" && fileCount
        ? tn("plural.files", fileCount)
        : e.kind === "forum" && e.forum
          ? t("forum.count", { n: e.forum.countPosts })
          : e.kind === "mark" || e.kind === "other"
            ? contentLabel(e.contentKind, t)
            : "";
  const lateish = !e.done && e.status === "expired";
  const dateTone = lateish ? "text-late" : !e.done && e.daysLeft != null && e.daysLeft <= 3 ? "text-soon" : "text-muted-foreground";

  const open = () => navigate(`/tarefa/${e.id}`);
  const generate = () => navigate(`/tarefa/${e.id}?gerar=1`);
  const portalUrl = `https://unifoa2.grupoa.education/plataforma/course/${e.courseId}/content/${e.id}`;
  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.origin + `/tarefa/${e.id}`);
  };
  const doMark = async () => {
    setMarking(true);
    const toastId = toast.loading(t("toast.markLoading"), { description: t("toast.markLoadingDesc") });
    try {
      const final = await runMark(e.id);
      if (final.status === "ok" || final.status === "already") {
        toast.success(t("toast.markDone"), { id: toastId, description: final.detail });
        patchExercise(e.id, { done: true, status: "done" });
      } else {
        toast.error(t("toast.markFail"), { id: toastId, description: final.detail });
      }
    } catch (x) {
      toast.error(t("toast.markFail"), { id: toastId, description: x instanceof Error ? x.message : String(x) });
    } finally {
      setMarking(false);
    }
  };

  const setTag = async (tag: string | null) => {
    try {
      const res = await saveTag(e.id, tag);
      patchExercise(e.id, {
        tag: res.tag,
        flavor: res.flavor as UploadFlavor,
        flavorSource: res.flavorSource as FlavorSource,
        anomalies: res.anomalies,
      });
      toast.success(t("toast.tagSaved"));
      refresh();
    } catch (x) {
      toast.error(x instanceof Error ? x.message : String(x));
    }
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={open}
        onKeyDown={(ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            open();
          }
        }}
        title={e.title}
        className={cn(
          "flex w-full cursor-pointer items-stretch gap-3 rounded-xl border bg-card px-3.5 py-3 text-left transition-colors",
          "hover:border-primary/30 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <SubjectAvatar
          moduleName={e.moduleName}
          kind={e.kind}
          imageUrl={e.professorPhotoUrl}
          className="self-center"
        />

        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="flex min-w-0 items-center gap-2">
            <span className={cn("truncate text-sm font-medium", e.done && "text-muted-foreground line-through")}>{e.title}</span>
            <ActivityBadge e={e} className="shrink-0" />
            {e.done && <DoneBadge className="shrink-0" />}
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <ProfessorTag name={e.professor} imageUrl={e.professorPhotoUrl} />
            {e.professor && e.moduleName && (
              <span className="text-muted-foreground/50" aria-hidden>
                ·
              </span>
            )}
            {e.moduleName && <SubjectLabel moduleName={e.moduleName} />}
          </span>
          {detail && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              {e.kind === "upload" && <Paperclip className="size-3" aria-hidden />}
              {detail}
            </span>
          )}
        </span>

        <span className="flex shrink-0 flex-col items-end justify-center gap-1.5">
          <StatusBadge e={e} />
          {e.deadlineAt && (
            <span className={cn("whitespace-nowrap text-[11px] tabular-nums", dateTone)}>{fmtDeadline(e.deadlineAt, locale)}</span>
          )}
        </span>

        <span
          className="flex shrink-0 flex-col items-center justify-center gap-1"
          onClick={(ev) => ev.stopPropagation()}
          onKeyDown={(ev) => ev.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t("card.moreAria")} />}>
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              {canAiAnswer(e) && (
                <DropdownMenuItem onClick={(ev) => { ev.stopPropagation(); generate(); }}>
                  <Sparkles />
                  {t("menu.generate")}
                </DropdownMenuItem>
              )}
              {meta.canMark && !e.done && (
                <DropdownMenuItem
                  disabled={marking}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    void doMark();
                  }}
                >
                  <CircleCheckBig />
                  {t("menu.mark")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={(ev) => {
                  ev.stopPropagation();
                  open();
                }}
              >
                {t("menu.open")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(ev) => { ev.stopPropagation(); window.open(portalUrl, "_blank", "noopener"); }}>
                <ExternalLink />
                {t("menu.openPortal")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(ev) => { ev.stopPropagation(); void copyLink(); }}>
                <Copy />
                {t("menu.copyLink")}
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Tag />
                  {t("menu.classify")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={(ev) => { ev.stopPropagation(); void setTag(null); }}>
                    {t("tag.auto")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={(ev) => { ev.stopPropagation(); void setTag("question"); }}>
                    {t("tag.question")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(ev) => { ev.stopPropagation(); void setTag("ghost"); }}>
                    {t("tag.ghost")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(ev) => { ev.stopPropagation(); void setTag("print"); }}>
                    {t("tag.print")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(ev) => { ev.stopPropagation(); void setTag("anomalia"); }}>
                    {t("tag.anomaly")}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              {e.professorId != null && (
                <DropdownMenuItem
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setPhotoOpen(true);
                  }}
                >
                  <Camera />
                  {t("menu.professorPhoto")}
                </DropdownMenuItem>
              )}
              {e.answer ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={(ev) => { ev.stopPropagation(); window.location.href = `/api/export/${e.id}`; }}>
                    <Download />
                    {t("menu.downloadMd")}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </div>

      {e.professorId != null && (
        <ProfessorPhotoDialog
          open={photoOpen}
          onOpenChange={setPhotoOpen}
          professorId={e.professorId}
          professorName={e.professor}
          moduleName={e.moduleName}
          link={professorLink}
          onSaved={() => refresh()}
        />
      )}
    </>
  );
}
