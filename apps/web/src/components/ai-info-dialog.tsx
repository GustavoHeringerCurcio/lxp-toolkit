import { Check, Minus, Scale, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AI_CAPABILITIES, AI_CAPABILITY_GROUPS } from "@/lib/ai-capabilities";
import { useAppData } from "@/lib/app-state";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Transparency modal for the Files card.
 *
 * ⚠️ KEEP THE CONTENT UPDATED: the rows come from `@/lib/ai-capabilities`.
 * When the AI gains a new input source or ability, add it there and in the
 * PT/EN `aiInfo.*` strings — never edit this file's text directly.
 */
export function AiInfoDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useT();
  const { cfg } = useAppData();
  const readingFiles = cfg?.readAttachments !== false && cfg?.activitySections?.arquivos !== false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 shrink-0 text-brand" aria-hidden />
            {t("exercise.aiInfoTitle")}
          </DialogTitle>
          <DialogDescription>{t("exercise.aiInfoIntro")}</DialogDescription>
        </DialogHeader>

        {!readingFiles && (
          <p className="rounded-md border border-soon/40 bg-soon/10 px-2.5 py-2 text-xs text-foreground">
            {t("exercise.aiInfoOff")}
          </p>
        )}

        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          {AI_CAPABILITY_GROUPS.map((group) => {
            const items = AI_CAPABILITIES.filter((c) => c.kind === group.kind);
            if (!items.length) return null;
            const negative = group.kind === "doesNot";
            const limits = group.kind === "limits";
            return (
              <section key={group.kind}>
                <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t(group.headingKey)}
                </h4>
                <ul className="space-y-1.5">
                  {items.map((cap) => (
                    <li key={cap.id} className="flex gap-2">
                      <span
                        className={cn(
                          "mt-0.5 shrink-0",
                          negative ? "text-muted-foreground" : limits ? "text-foreground" : "text-ok",
                        )}
                        aria-hidden
                      >
                        {negative ? (
                          <Minus className="size-3.5" />
                        ) : limits ? (
                          <Scale className="size-3.5" />
                        ) : (
                          <Check className="size-3.5" />
                        )}
                      </span>
                      <p className="text-xs leading-relaxed">
                        <span className="font-medium text-foreground">{t(`aiInfo.${cap.id}.title`)}</span>
                        <span className="text-muted-foreground"> — {t(`aiInfo.${cap.id}.detail`)}</span>
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        <p className="border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
          {t("exercise.aiInfoKeepUpdated")}
        </p>
      </DialogContent>
    </Dialog>
  );
}
