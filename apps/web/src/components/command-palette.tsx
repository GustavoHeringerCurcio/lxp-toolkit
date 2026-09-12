import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChartColumn,
  Languages,
  ListChecks,
  Moon,
  Palette,
  RefreshCw,
  RotateCw,
  SlidersHorizontal,
  Sun,
  Sunrise,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useAppData, useScopePrefs } from "@/lib/app-state";
import { usePortalRefresh } from "@/components/content-refresh";
import { useTheme } from "@/lib/theme";
import { useT, type Lang } from "@/lib/i18n";

interface CommandPaletteValue {
  open: boolean;
  setOpen: (v: boolean) => void;
}

const CommandPaletteContext = createContext<CommandPaletteValue | null>(null);

export function useCommandPalette(): CommandPaletteValue {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) throw new Error("useCommandPalette fora de CommandPaletteProvider");
  return ctx;
}

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ open, setOpen }), [open]);
  return <CommandPaletteContext.Provider value={value}>{children}</CommandPaletteContext.Provider>;
}

export function CommandPalette() {
  const { open, setOpen } = useCommandPalette();
  const navigate = useNavigate();
  const { items, refresh } = useAppData();
  const { start: startRefresh } = usePortalRefresh();
  const { setModuleFilter } = useScopePrefs();
  const { resolved, setTheme } = useTheme();
  const { t, lang, setLang } = useT();

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key.toLowerCase() === "k" && (ev.metaKey || ev.ctrlKey)) {
        ev.preventDefault();
        setOpen(!open);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  const filterByModule = (moduleName: string) => {
    setModuleFilter(moduleName);
    go("/tarefas");
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title={t("palette.title")}
      description={t("palette.desc")}
    >
      <CommandInput placeholder={t("palette.placeholder")} />
      <CommandList>
        <CommandEmpty>{t("palette.empty")}</CommandEmpty>
        <CommandGroup heading={t("palette.pages")}>
          <CommandItem onSelect={() => go("/")}>
            <Sunrise />
            {t("nav.now")}
          </CommandItem>
          <CommandItem onSelect={() => go("/tarefas")}>
            <ListChecks />
            {t("nav.tasks")}
          </CommandItem>
          <CommandItem onSelect={() => go("/progresso")}>
            <ChartColumn />
            {t("nav.progress")}
          </CommandItem>
          <CommandItem onSelect={() => go("/ajustes")}>
            <SlidersHorizontal />
            {t("nav.settings")}
          </CommandItem>
          <CommandItem onSelect={() => go("/design")}>
            <Palette />
            {t("nav.designGuide")}
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading={t("palette.actions")}>
          <CommandItem
            onSelect={() => {
              setOpen(false);
              setTheme(resolved === "dark" ? "light" : "dark");
            }}
          >
            {resolved === "dark" ? <Sun /> : <Moon />}
            {t("palette.toggleTheme")}
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setOpen(false);
              setLang((lang === "pt" ? "en" : "pt") as Lang);
            }}
          >
            <Languages />
            {t("palette.toggleLang")}
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setOpen(false);
              startRefresh();
            }}
          >
            <RefreshCw />
            {t("palette.refresh")}
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setOpen(false);
              void refresh();
            }}
          >
            <RotateCw />
            {t("palette.reload")}
          </CommandItem>
        </CommandGroup>
        {items.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t("palette.tasks")}>
              {items.slice(0, 60).map((t) => (
                <CommandItem key={t.id} value={`${t.title} ${t.moduleName} ${t.professor ?? ""}`} onSelect={() => go(`/tarefa/${t.id}`)}>
                  <ListChecks />
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  {t.moduleName && (
                    <span
                      role="button"
                      tabIndex={-1}
                      className="ml-auto max-w-32 truncate text-xs text-muted-foreground hover:text-foreground"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        filterByModule(t.moduleName);
                      }}
                    >
                      {t.moduleName}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
