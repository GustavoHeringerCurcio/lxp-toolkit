import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  ChartColumn,
  ChevronLeft,
  GraduationCap,
  ListChecks,
  Palette,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Sunrise,
  UserRound,
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
import { buttonVariants } from "@/components/ui/button";
import { accentFor, professorLabel } from "@/lib/prof";
import { useAppData } from "@/lib/app-state";
import { useT } from "@/lib/i18n";
import { AiSettingsDialog } from "@/components/ai-settings-dialog";

const NAV = [
  { to: "/", key: "nav.now", icon: Sunrise, end: true },
  { to: "/tarefas", key: "nav.tasks", icon: ListChecks, match: ["/tarefa/"] },
  { to: "/progresso", key: "nav.progress", icon: ChartColumn },
] as const;

const TRAINING_NAV = [
  { to: "/treino/quiz", key: "nav.trainingQuiz", icon: GraduationCap },
  { to: "/treino/estudo", key: "nav.trainingStudy", icon: Sparkles },
] as const;

const SYSTEM_NAV = [
  { to: "/ajustes", key: "nav.settings", icon: SlidersHorizontal },
  { to: "/design", key: "nav.design", icon: Palette },
] as const;

function isRouteActive(to: string, pathname: string, match?: readonly string[]): boolean {
  if (match?.some((m) => pathname.startsWith(m))) return true;
  return to === "/" ? pathname === "/" : pathname.startsWith(to);
}

export function AppSidebar() {
  const { items } = useAppData();
  const { t } = useT();
  const location = useLocation();
  const navigate = useNavigate();

  const professors = [
    ...new Map(
      items
        .filter((e) => e.professor)
        .map((e) => [
          e.professorId ?? `name:${e.professor}`,
          { id: e.professorId, name: e.professor as string },
        ]),
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name, "pt"));
  const courseName = items[0]?.courseName ?? "LXP";

  const nowCount = items.filter(
    (e) => !e.done && e.status === "open" && e.daysLeft != null && e.daysLeft <= 3,
  ).length;

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <NavLink to="/" className="flex items-center gap-2.5 px-1 py-0.5">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary font-heading text-base font-semibold text-primary-foreground shadow-md shadow-primary/25">
            P
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate font-heading text-[15px] font-semibold tracking-tight">Pauta</div>
            <div className="truncate text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              LXP ToolKit
            </div>
          </div>
        </NavLink>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("nav.groupStudy")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((n) => {
                const label = t(n.key);
                const active = isRouteActive(n.to, location.pathname, "match" in n ? n.match : undefined);
                const badge =
                  n.to === "/" ? (nowCount > 0 ? nowCount : "") : n.to === "/tarefas" ? (items.length > 0 ? items.length : "") : "";
                return (
                  <SidebarMenuItem key={n.to}>
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={label}
                      onClick={() => navigate(n.to)}
                      className="group-data-[collapsible=icon]:!px-2"
                    >
                      <n.icon />
                      <span>{label}</span>
                      {badge !== "" && (
                        <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">{badge}</span>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>{t("nav.groupTraining")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {TRAINING_NAV.map((n) => (
                <SidebarMenuItem key={n.to}>
                  <SidebarMenuButton
                    isActive={location.pathname.startsWith(n.to)}
                    tooltip={t(n.key)}
                    onClick={() => navigate(n.to)}
                    className="group-data-[collapsible=icon]:!px-2"
                  >
                    <n.icon />
                    <span>{t(n.key)}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>{t("nav.groupSystem")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {SYSTEM_NAV.map((n) => (
                <SidebarMenuItem key={n.to}>
                  <SidebarMenuButton
                    isActive={location.pathname === n.to}
                    tooltip={t(n.key)}
                    onClick={() => navigate(n.to)}
                    className="group-data-[collapsible=icon]:!px-2"
                  >
                    <n.icon />
                    <span>{t(n.key)}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <AiSettingsDialog
                  trigger={
                    <SidebarMenuButton tooltip={t("nav.profile")} className="group-data-[collapsible=icon]:!px-2">
                      <UserRound />
                      <span>{t("nav.profile")}</span>
                    </SidebarMenuButton>
                  }
                />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {professors.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>{t("nav.groupProfessors")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <div className="flex flex-col gap-1 px-2">
                {professors.map((p) => {
                  const acc = accentFor(p.id, p.name);
                  return (
                    <div key={p.id ?? p.name} className="flex items-center gap-2 px-1 text-[13px] text-muted-foreground">
                      <span className="size-2 shrink-0 rounded-full" style={{ background: acc }} />
                      <span className="truncate">{professorLabel(p.name)}</span>
                    </div>
                  );
                })}
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-2 truncate px-1 text-xs text-muted-foreground" title={courseName}>
          <RefreshCw className="size-3.5 shrink-0" />
          <span className="truncate">{courseName}</span>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

/** Reusable back link shown at the top of the exercise page. */
export function BackLink({ to = "/tarefas" }: { to?: string }) {
  const { t } = useT();
  return (
    <Link
      to={to}
      className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-1 text-muted-foreground")}
    >
      <ChevronLeft />
      {t("nav.backToTasks")}
    </Link>
  );
}
