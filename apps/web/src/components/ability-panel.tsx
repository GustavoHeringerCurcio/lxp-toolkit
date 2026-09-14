import { useEffect, useState } from "react";
import { Puzzle, RotateCcw } from "lucide-react";
import { fetchActivityAbilities, setActivityAbility } from "@/api";
import { useAppData } from "@/lib/app-state";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { AbilityId, Exercise } from "@/types";
import { Button } from "@/components/ui/button";

/**
 * Per-activity AI abilities card: a toggle per registered ability that overrides
 * the global switch for this item. A "reset" clears the override and falls back
 * to the global default. Renders nothing when no abilities are registered.
 */
export function AbilityPanel({ e }: { e: Exercise }) {
  const { cfg } = useAppData();
  const { t } = useT();
  const [overrides, setOverrides] = useState<Partial<Record<AbilityId, boolean>>>({});
  const registry = cfg?.abilityRegistry ?? [];
  const global = cfg?.abilities ?? {};

  useEffect(() => {
    let alive = true;
    fetchActivityAbilities(e.id)
      .then((next) => {
        if (alive) setOverrides(next);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [e.id]);

  if (!registry.length) return null;

  const toggle = async (id: AbilityId, enabled: boolean): Promise<void> => {
    setOverrides((prev) => ({ ...prev, [id]: enabled }));
    try {
      setOverrides(await setActivityAbility(e.id, id, enabled));
    } catch {
      /* keep optimistic state */
    }
  };

  const reset = async (id: AbilityId): Promise<void> => {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      setOverrides(await setActivityAbility(e.id, id, null));
    } catch {
      /* keep optimistic state */
    }
  };

  return (
    <section className="shrink-0 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <Puzzle className="size-4 shrink-0 text-brand" aria-hidden />
        <h3 className="font-heading text-sm font-semibold">{t("ability.toggle")}</h3>
      </div>
      <div className="mt-2.5 space-y-1.5">
        {registry.map((ability) => {
          const hasOverride = typeof overrides[ability.id] === "boolean";
          const effective = hasOverride ? overrides[ability.id] === true : global[ability.id] === true;
          return (
            <div
              key={ability.id}
              className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2"
            >
              <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={effective}
                  onChange={(ev) => void toggle(ability.id, ev.target.checked)}
                  className="mt-0.5 size-4 shrink-0 accent-brand"
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground/90">
                    {ability.label}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">{ability.description}</span>
                </span>
              </label>
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                  hasOverride
                    ? "border-brand/30 bg-brand/10 text-brand"
                    : "border-border bg-muted/40 text-muted-foreground",
                )}
              >
                {hasOverride
                  ? effective
                    ? t("ability.overrideOn")
                    : t("ability.overrideOff")
                  : t("ability.useGlobal")}
              </span>
              {hasOverride && (
                <Button
                  variant="ghost"
                  size="xs"
                  aria-label={t("ability.useGlobal")}
                  onClick={() => void reset(ability.id)}
                >
                  <RotateCcw aria-hidden />
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
