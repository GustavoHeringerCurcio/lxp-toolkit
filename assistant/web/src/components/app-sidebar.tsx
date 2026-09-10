import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  ChevronLeft,
  CircleAlert,
  Clock3,
  GraduationCap,
  ListChecks,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
import { Button, buttonVariants } from "@/components/ui/button";
import type { ExerciseStatus } from "@/types";
import { accentFor } from "@/lib/prof";
import { useAppData, useScopePrefs, type Scope } from "@/lib/app-state";
import { AiSettingsDialog } from "@/components/ai-settings-dialog";

const NAV: { key: Scope; label: string; icon: typeof ListChecks }[] = [
  { key: "open", label: "Abertas", icon: Clock3 },
  { key: "expired", label: "Atrasadas", icon: CircleAlert },
  { key: "done", label: "Concluídas", icon: CheckCircle2 },
  { key: "all", label: "Todas", icon: ListChecks },
];

export function AppSidebar() {
  const { items } = useAppData();
  const { scope, setScope } = useScopePrefs();
  const navigate = useNavigate();
  const location = useLocation();
  const inExercise = location.pathname.startsWith("/tarefa/");
  const activeScope: Scope | null = inExercise ? null : scope;
  const counts = {
    open: items.filter((i) => i.status === "open").length,
    expired: items.filter((i) => i.status === "expired").length,
    done: items.filter((i) => i.status === "done").length,
  };
  const professors = [...new Set(items.map((e) => e.professor).filter((p): p is string => !!p))].sort();
  const courseName = items[0]?.courseName ?? "LXP";

  const badge = (key: Scope) => (key === "open" ? counts.open : key === "expired" ? counts.expired : key === "done" ? counts.done : "");
  const goScope = (key: Scope) => {
    setScope(key);
    navigate("/");
  };

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <NavLink to="/" className="flex items-center gap-2 px-1" onClick={() => setScope("open")}>
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand to-brand-2 text-white shadow-md shadow-brand/20">
            <GraduationCap className="size-4" />
          </div>
          <div className="truncate font-heading text-sm font-semibold">LXP Assistant</div>
        </NavLink>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Minhas tarefas</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((n) => (
                <SidebarMenuItem key={n.key}>
                  <SidebarMenuButton
                    isActive={activeScope === n.key}
                    tooltip={n.label}
                    onClick={() => goScope(n.key)}
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

        <SidebarGroup>
          <SidebarGroupLabel>Ferramentas</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <AiSettingsDialog
                  trigger={
                    <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground">
                      <Settings2 />
                      <span>Perfil</span>
                    </Button>
                  }
                />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={location.pathname === "/ajustes"}
                  tooltip="Ajustes"
                  onClick={() => navigate("/ajustes")}
                  className="group-data-[collapsible=icon]:!px-2"
                >
                  <SlidersHorizontal />
                  <span>Ajustes</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
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

/** Reusable back link shown at the top of the exercise page. */
export function BackLink({ to = "/" }: { to?: string }) {
  return (
    <Link
      to={to}
      className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-1 text-muted-foreground")}
    >
      <ChevronLeft />
      voltar para o painel
    </Link>
  );
}
