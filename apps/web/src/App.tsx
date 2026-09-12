import { useLocation, Route, Routes } from "react-router-dom";
import { Command, Settings2 } from "lucide-react";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { AppProviders, useAppData } from "@/lib/app-state";
import { ThemeProvider } from "@/lib/theme";
import { AppSidebar } from "@/components/app-sidebar";
import { AiSettingsDialog } from "@/components/ai-settings-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  CommandPalette,
  CommandPaletteProvider,
  useCommandPalette,
} from "@/components/command-palette";
import { ContentRefreshBanner, ContentRefreshButton, useContentRefresh } from "@/components/content-refresh";
import { AgoraPage } from "@/pages/agora";
import { TarefasPage } from "@/pages/tarefas";
import { ProgressoPage } from "@/pages/progresso";
import { ExercisePage } from "@/pages/exercise";
import { SettingsPage } from "@/pages/settings";
import { DesignPage } from "@/pages/design";
import { ErrorState } from "@/components/state-screens";
import { Skeleton } from "@/components/ui/skeleton";

function pageTitle(pathname: string, items: { id: number; title: string }[]): string {
  if (pathname === "/") return "Agora";
  if (pathname === "/tarefas") return "Tarefas";
  if (pathname === "/progresso") return "Progresso";
  if (pathname === "/ajustes") return "Ajustes";
  if (pathname === "/design") return "Design";
  if (pathname.startsWith("/tarefa/")) {
    const id = Number(pathname.split("/")[2]);
    return items.find((x) => x.id === id)?.title ?? "Atividade";
  }
  return "Agora";
}

function PaletteButton() {
  const { setOpen } = useCommandPalette();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1.5 text-muted-foreground"
      onClick={() => setOpen(true)}
      title="Buscar (Ctrl+K)"
      aria-label="Abrir busca"
    >
      <Command />
      <kbd className="hidden font-mono text-[10px] font-medium tracking-widest sm:inline">Ctrl K</kbd>
    </Button>
  );
}

function Shell() {
  const { items, cfg, error, reload, loading } = useAppData();
  const refresh = useContentRefresh(reload);
  const location = useLocation();
  const title = pageTitle(location.pathname, items);

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
    <CommandPaletteProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-5" />
            <div className="min-w-0 flex-1 truncate font-heading text-sm font-semibold">{title}</div>
            {cfg && (
              <span className="hidden rounded-full border border-border bg-muted/40 px-2.5 py-1 font-mono text-[11px] text-muted-foreground sm:inline">
                {cfg.model}
              </span>
            )}
            <PaletteButton />
            <AiSettingsDialog
              trigger={
                <Button variant="ghost" size="icon" title="Perfil & IA" aria-label="Perfil & IA">
                  <Settings2 />
                </Button>
              }
            />
            <ContentRefreshButton state={refresh.state} onStart={refresh.start} />
            <ThemeToggle />
          </header>
          <ContentRefreshBanner state={refresh.state} />

          {loading && items.length === 0 ? (
            <div className="p-4">
              <Skeleton className="h-24 w-full rounded-xl" />
              <div className="mt-4 grid grid-cols-3 gap-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
              </div>
              <Skeleton className="mt-4 h-[28rem] w-full rounded-xl" />
            </div>
          ) : (
            <Routes>
              <Route path="/" element={<AgoraPage />} />
              <Route path="/tarefas" element={<TarefasPage />} />
              <Route path="/progresso" element={<ProgressoPage />} />
              <Route path="/tarefa/:id" element={<ExercisePage />} />
              <Route path="/ajustes" element={<SettingsPage />} />
              <Route path="/design" element={<DesignPage />} />
              <Route path="*" element={<AgoraPage />} />
            </Routes>
          )}
        </SidebarInset>
        <CommandPalette />
      </SidebarProvider>
    </CommandPaletteProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppProviders>
        <Shell />
      </AppProviders>
    </ThemeProvider>
  );
}
