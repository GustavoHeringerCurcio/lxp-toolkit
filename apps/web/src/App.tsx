import { Link, useLocation, Route, Routes } from "react-router-dom";
import { Command, Settings2 } from "lucide-react";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button, buttonVariants } from "@/components/ui/button";
import { AppProviders, useAppData } from "@/lib/app-state";
import { ThemeProvider } from "@/lib/theme";
import { LangProvider, useT } from "@/lib/i18n";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import {
  CommandPalette,
  CommandPaletteProvider,
  useCommandPalette,
} from "@/components/command-palette";
import {
  RefreshProvider,
  ContentRefreshBanner,
  ContentRefreshButton,
  usePortalRefresh,
} from "@/components/content-refresh";
import { AgoraPage } from "@/pages/agora";
import { TarefasPage } from "@/pages/tarefas";
import { ProgressoPage } from "@/pages/progresso";
import { ExercisePage } from "@/pages/exercise";
import { SettingsPage } from "@/pages/settings";
import { DesignPage } from "@/pages/design";
import { TrainingQuizPage } from "@/pages/training-quiz";
import { TrainingStudyPage } from "@/pages/training-study";
import { TrainingProvider } from "@/lib/training-state";
import { ErrorState } from "@/components/state-screens";
import { Skeleton } from "@/components/ui/skeleton";

function pageTitle(
  pathname: string,
  items: { id: number; title: string }[],
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (pathname === "/") return t("nav.now");
  if (pathname === "/tarefas") return t("nav.tasks");
  if (pathname === "/progresso") return t("nav.progress");
  if (pathname === "/ajustes") return t("nav.settings");
  if (pathname === "/design") return t("nav.design");
  if (pathname === "/treino/quiz") return t("nav.trainingQuiz");
  if (pathname === "/treino/estudo") return t("nav.trainingStudy");
  if (pathname.startsWith("/tarefa/")) {
    const id = Number(pathname.split("/")[2]);
    return items.find((x) => x.id === id)?.title ?? t("app.activityFallback");
  }
  return t("nav.now");
}

function PaletteButton() {
  const { setOpen } = useCommandPalette();
  const { t } = useT();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1.5 text-muted-foreground"
      onClick={() => setOpen(true)}
      title={t("header.searchTitle")}
      aria-label={t("header.searchAria")}
    >
      <Command />
      <kbd className="hidden font-mono text-[10px] font-medium tracking-widest sm:inline">Ctrl K</kbd>
    </Button>
  );
}

function Shell() {
  const { items, cfg, error, reload, loading } = useAppData();
  const { state: refreshState, start: startRefresh } = usePortalRefresh();
  const location = useLocation();
  const { t } = useT();
  const title = pageTitle(location.pathname, items, t);
  const showError = Boolean(error) && items.length === 0 && !loading;

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
            <Link
              to="/ajustes"
              title={t("header.settingsAria")}
              aria-label={t("header.settingsAria")}
              className={buttonVariants({ variant: "ghost", size: "icon" })}
            >
              <Settings2 />
            </Link>
            <ContentRefreshButton state={refreshState} onStart={startRefresh} />
            <LanguageToggle />
            <ThemeToggle />
          </header>
          <ContentRefreshBanner state={refreshState} />

          {showError ? (
            <div className="flex min-h-[60svh] items-center justify-center p-4">
              <ErrorState error={error ?? ""} onRetry={reload} />
            </div>
          ) : loading && items.length === 0 ? (
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
            <TrainingProvider>
              <Routes>
                <Route path="/" element={<AgoraPage />} />
                <Route path="/tarefas" element={<TarefasPage />} />
                <Route path="/progresso" element={<ProgressoPage />} />
                <Route path="/tarefa/:id" element={<ExercisePage />} />
                <Route path="/treino/quiz" element={<TrainingQuizPage />} />
                <Route path="/treino/estudo" element={<TrainingStudyPage />} />
                <Route path="/ajustes" element={<SettingsPage />} />
                <Route path="/design" element={<DesignPage />} />
                <Route path="*" element={<AgoraPage />} />
              </Routes>
            </TrainingProvider>
          )}
        </SidebarInset>
        <CommandPalette />
      </SidebarProvider>
    </CommandPaletteProvider>
  );
}

function ShellWithRefresh() {
  const { reload } = useAppData();
  return (
    <RefreshProvider onDone={reload}>
      <Shell />
    </RefreshProvider>
  );
}

export default function App() {
  return (
    <LangProvider>
      <ThemeProvider>
        <AppProviders>
          <ShellWithRefresh />
        </AppProviders>
      </ThemeProvider>
    </LangProvider>
  );
}
