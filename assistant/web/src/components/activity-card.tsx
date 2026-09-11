import { useNavigate } from "react-router-dom";
import {
  Copy,
  Download,
  ExternalLink,
  ListChecks,
  MoreHorizontal,
  Paperclip,
  Sparkles,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Exercise } from "@/types";
import { fmtDeadline } from "@/lib/status";
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
  const quiz = e.kind === "quiz";
  const fileCount = e.remoteFiles.length || e.files.length;
  const meta =
    quiz && e.questions.length
      ? `${e.questions.length} questão${e.questions.length > 1 ? "es" : ""}`
      : !quiz && fileCount
        ? `${fileCount} arquivo${fileCount > 1 ? "s" : ""}`
        : "";
  const lateish = !e.done && e.status === "expired";
  const dateTone = lateish ? "text-late" : !e.done && e.daysLeft != null && e.daysLeft <= 3 ? "text-soon" : "text-muted-foreground";

  const open = () => navigate(`/tarefa/${e.id}`);
  const generate = () => navigate(`/tarefa/${e.id}?gerar=1`);
  const portalUrl = `https://unifoa2.grupoa.education/plataforma/course/${e.courseId}/content/${e.id}`;
  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.origin + `/tarefa/${e.id}`);
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
        className={cn(
          "grid size-9 shrink-0 self-center place-items-center rounded-lg",
          quiz ? "bg-teal/15 text-teal" : "bg-brand/15 text-brand",
        )}
        aria-hidden
      >
        {quiz ? <ListChecks className="size-4" /> : <Upload className="size-4" />}
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className={cn("truncate text-sm font-medium", e.done && "text-muted-foreground line-through")}>{e.title}</span>
          {e.done && <DoneBadge className="shrink-0" />}
        </span>
        <AccChips professor={e.professor} moduleName={e.moduleName} />
        {meta && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            {!quiz && <Paperclip className="size-3" aria-hidden />}
            {meta}
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
            <DropdownMenuItem onClick={(ev) => { ev.stopPropagation(); generate(); }}>
              <Sparkles />
              Gerar com IA
            </DropdownMenuItem>
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
