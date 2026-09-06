import { CheckCircle2, CircleAlert, Clock3, GraduationCap, ListChecks, RefreshCw } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import type { ExerciseStatus } from "@/types";
import { accentFor } from "@/lib/prof";

export type Scope = "open" | "expired" | "done" | "all";

const NAV: { key: Scope; label: string; icon: typeof ListChecks }[] = [
  { key: "open", label: "Abertas", icon: Clock3 },
  { key: "expired", label: "Atrasadas", icon: CircleAlert },
  { key: "done", label: "Concluídas", icon: CheckCircle2 },
  { key: "all", label: "Todas", icon: ListChecks },
];

interface Props {
  courseName: string;
  counts: { open: number; expired: number; done: number };
  scope: Scope;
  onScope: (s: Scope) => void;
  professors: (string | null)[];
}

export function AppSidebar({ courseName, counts, scope, onScope, professors }: Props) {
  const badge = (key: Scope) => (key === "open" ? counts.open : key === "expired" ? counts.expired : key === "done" ? counts.done : "");
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-1">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
            <GraduationCap className="size-4" />
          </div>
          <div className="truncate font-heading text-sm font-semibold">LXP Assistant</div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Minhas tarefas</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((n) => (
                <SidebarMenuItem key={n.key}>
                  <SidebarMenuButton
                    isActive={scope === n.key}
                    tooltip={n.label}
                    onClick={() => onScope(n.key)}
                    className="group-data-[collapsible=icon]:!px-2"
                  >
                    <n.icon />
                    <span>{n.label}</span>
                    {badge(n.key) !== "" && (
                      <span className="ml-auto tabular-nums text-xs text-muted-foreground">{badge(n.key)}</span>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Professores</SidebarGroupLabel>
          <SidebarGroupContent>
            <div className="flex flex-col gap-1 px-2">
              {professors.map((p) => {
                const acc = accentFor(p);
                return (
                  <div key={p ?? "?"} className="flex items-center gap-2 px-1 text-[13px] text-muted-foreground">
                    <span className="size-2 rounded-full" style={{ background: acc }} />
                    <span className="truncate">{p?.replace(/^Profa?\.\s*/i, "")}</span>
                  </div>
                );
              })}
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-2 truncate px-1 text-xs text-muted-foreground" title={courseName}>
          <RefreshCw className="size-3.5" />
          <span className="truncate">{courseName}</span>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

export function isExerciseStatus(s: string): s is ExerciseStatus {
  return s === "open" || s === "expired" || s === "done";
}
