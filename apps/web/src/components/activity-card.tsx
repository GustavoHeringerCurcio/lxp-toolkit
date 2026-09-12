import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CircleCheckBig,
  Copy,
  Download,
  ExternalLink,
  MoreHorizontal,
  Paperclip,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Exercise } from "@/types";
import { fmtDeadline } from "@/lib/status";
import { CONTENT_LABEL, kindMeta } from "@/lib/kind";
import { runMark } from "@/lib/mark";
import { useAppData } from "@/lib/app-state";
import { AccChips } from "./prof-chip";
import { StatusBadge, DoneBadge } from "./status-badges";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export function ActivityCard({ e }: { e: Exercise }) {
  const navigate = useNavigate();
  const { patchExercise } = useAppData();
  const [marking, setMarking] = useState(false);
  const meta = kindMeta(e.kind);
  const Icon = meta.icon;
  const fileCount = e.remoteFiles.length || e.files.length;
  const detail =
    e.kind === "quiz" && e.questions.length
      ? `${e.questions.length} questão${e.questions.length > 1 ? "es" : ""}`
      : e.kind === "upload" && fileCount
        ? `${fileCount} arquivo${fileCount > 1 ? "s" : ""}`
        : e.kind === "mark" || e.kind === "other"
          ? CONTENT_LABEL[e.contentKind]
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
    const t = toast.loading("Marcando como concluída…", { description: "Fazendo login e registrando no portal." });
    try {
      const final = await runMark(e.id);
      if (final.status === "ok" || final.status === "already") {
        toast.success("Marcada como concluída", { id: t, description: final.detail });
        patchExercise(e.id, { done: true, status: "done" });
      } else {
        toast.error("Não foi possível marcar", { id: t, description: final.detail });
      }
    } catch (x) {
      toast.error("Não foi possível marcar", { id: t, description: x instanceof Error ? x.message : String(x) });
    } finally {
      setMarking(false);
    }
  };

  return (
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
      <span
        className={cn("grid size-9 shrink-0 self-center place-items-center rounded-lg", meta.tileClass)}
        aria-hidden
      >
        <Icon className="size-4" />
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className={cn("truncate text-sm font-medium", e.done && "text-muted-foreground line-through")}>{e.title}</span>
          {e.done && <DoneBadge className="shrink-0" />}
        </span>
        <AccChips professor={e.professor} moduleName={e.moduleName} />
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
          <span className={cn("whitespace-nowrap text-[11px] tabular-nums", dateTone)}>{fmtDeadline(e.deadlineAt)}</span>
        )}
      </span>

      <span
        className="flex shrink-0 flex-col items-center justify-center gap-1"
        onClick={(ev) => ev.stopPropagation()}
        onKeyDown={(ev) => ev.stopPropagation()}
      >
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="mais opções" />}>
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            {meta.canAnswer && (
              <DropdownMenuItem onClick={(ev) => { ev.stopPropagation(); generate(); }}>
                <Sparkles />
                Gerar rascunho
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
                Marcar como concluída
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={(ev) => {
                ev.stopPropagation();
                open();
              }}
            >
              Abrir atividade
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(ev) => { ev.stopPropagation(); window.open(portalUrl, "_blank", "noopener"); }}>
              <ExternalLink />
              Abrir no portal
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(ev) => { ev.stopPropagation(); void copyLink(); }}>
              <Copy />
              Copiar link
            </DropdownMenuItem>
            {e.answer ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={(ev) => { ev.stopPropagation(); window.location.href = `/api/export/${e.id}`; }}>
                  <Download />
                  Baixar resposta .md
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    </div>
  );
}
