import { useLocation, Route, Routes } from "react-router-dom";
import { RefreshCw, Settings2 } from "lucide-react";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { AppProviders, useAppData } from "@/lib/app-state";
import { AppSidebar } from "@/components/app-sidebar";
import { AiSettingsDialog } from "@/components/ai-settings-dialog";
import { DashboardPage } from "@/pages/dashboard";
import { ExercisePage } from "@/pages/exercise";
import { SettingsPage } from "@/pages/settings";
import { ErrorState } from "@/components/state-screens";
import { Skeleton } from "@/components/ui/skeleton";

function Shell() {
  const { items, cfg, error, reload, loading } = useAppData();
  const location = useLocation();
  const detailId = location.pathname.startsWith("/tarefa/")
    ? Number(location.pathname.split("/")[2])
    : null;
  const detailTitle = detailId ? items.find((x) => x.id === detailId)?.title : null;
  const inSettings = location.pathname === "/ajustes";

  if (error && items.length === 0 && !loading) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <div className="flex min-h-svh items-center justify-center p-4">
            <ErrorState error={error} onRetry={reload} />
          </div>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-5" />
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="truncate font-heading text-sm font-semibold">
              {inSettings ? "IA Ajustes" : detailId ? "Atividade" : "Minhas tarefas"}
            </div>
            {detailTitle && (
              <>
                <Separator orientation="vertical" className="h-4" />
                <span className="truncate text-sm text-muted-foreground">{detailTitle}</span>
              </>
            )}
          </div>
          {cfg && (
            <span className="hidden rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground sm:inline">
              modelo {cfg.model}
            </span>
          )}
          <AiSettingsDialog
            trigger={
              <Button variant="ghost" size="icon" title="Perfil & IA" aria-label="Perfil & IA">
                <Settings2 />
              </Button>
            }
          />
          <Button variant="ghost" size="icon" title="atualizar" aria-label="atualizar" onClick={reload}>
            <RefreshCw />
          </Button>
        </header>

        {loading && items.length === 0 ? (
          <div className="p-4">
            <Skeleton className="h-20 w-full rounded-xl" />
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
            <Skeleton className="mt-4 h-[28rem] w-full rounded-xl" />
          </div>
        ) : (
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/tarefa/:id" element={<ExercisePage />} />
            <Route path="/ajustes" element={<SettingsPage />} />
            <Route
              path="*"
              element={<DashboardPage />}
            />
          </Routes>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function App() {
  return (
    <AppProviders>
      <Shell />
    </AppProviders>
  );
}
