import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocalStorage } from "@/lib/use-local-storage";

const STORAGE_PREFIX = "lxp.tarefa.cards.";

export function useCardCollapse(id: string, defaultOpen = true) {
  const [collapsed, setCollapsed] = useLocalStorage(`${STORAGE_PREFIX}${id}`, !defaultOpen);
  return {
    open: !collapsed,
    toggle: () => setCollapsed((v) => !v),
  };
}

export function CollapseButton({
  open,
  onToggle,
  label,
  className,
}: {
  open: boolean;
  onToggle: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={label ?? (open ? "Recolher" : "Expandir")}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className,
      )}
    >
      <ChevronDown className={cn("size-4 transition-transform duration-200", !open && "-rotate-90")} aria-hidden />
    </button>
  );
}

export function CollapsibleCard({
  id,
  title,
  icon,
  badge,
  actions,
  footer,
  defaultOpen = true,
  className,
  headerClassName,
  bodyClassName,
  children,
}: {
  id: string;
  title: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const { open, toggle } = useCardCollapse(id, defaultOpen);
  return (
    <section data-open={open ? "true" : "false"} className={cn("rounded-xl border border-border bg-card", className)}>
      <div className={cn("flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-3", headerClassName)}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {icon}
          <h3 className="font-heading text-sm font-semibold">{title}</h3>
          {badge}
        </button>
        {actions}
        <CollapseButton open={open} onToggle={toggle} />
      </div>
      {open && <div className={bodyClassName}>{children}</div>}
      {open && footer}
    </section>
  );
}
