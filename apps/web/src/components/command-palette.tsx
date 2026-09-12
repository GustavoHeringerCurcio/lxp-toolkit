import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChartColumn,
  ListChecks,
  Moon,
  Palette,
  RefreshCw,
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
import { useTheme } from "@/lib/theme";

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
  const { setModuleFilter } = useScopePrefs();
  const { resolved, setTheme } = useTheme();

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
      title="Navegação"
      description="Ir para uma página, tarefa ou ação"
    >
      <CommandInput placeholder="Buscar páginas, ações e tarefas…" />
      <CommandList>
        <CommandEmpty>Nada encontrado.</CommandEmpty>
        <CommandGroup heading="Páginas">
          <CommandItem onSelect={() => go("/")}>
            <Sunrise />
            Agora
          </CommandItem>
          <CommandItem onSelect={() => go("/tarefas")}>
            <ListChecks />
            Tarefas
          </CommandItem>
          <CommandItem onSelect={() => go("/progresso")}>
            <ChartColumn />
            Progresso
          </CommandItem>
          <CommandItem onSelect={() => go("/ajustes")}>
            <SlidersHorizontal />
            Ajustes
          </CommandItem>
          <CommandItem onSelect={() => go("/design")}>
            <Palette />
            Design · guia do sistema
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Ações">
          <CommandItem
            onSelect={() => {
              setOpen(false);
              setTheme(resolved === "dark" ? "light" : "dark");
            }}
          >
            {resolved === "dark" ? <Sun /> : <Moon />}
            Alternar tema
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setOpen(false);
              void refresh();
            }}
          >
            <RefreshCw />
            Atualizar conteúdo do portal
          </CommandItem>
        </CommandGroup>
        {items.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Tarefas">
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
