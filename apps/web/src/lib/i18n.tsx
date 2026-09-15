import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { pt } from "./i18n/pt";
import { en } from "./i18n/en";

export type Lang = "pt" | "en";

export const LANGS: Lang[] = ["pt", "en"];
export const LOCALE: Record<Lang, string> = { pt: "pt-BR", en: "en-US" };

const KEY = "pauta-lang";
const DICTS: Record<Lang, Record<string, string>> = { pt, en };

export type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

/** Replace every `{{name}}` whose variable is provided; unknown tokens stay verbatim. */
export function interpolate(raw: string, vars?: Record<string, string | number>): string {
  if (!vars) return raw;
  return raw.replace(/\{\{(\w+)\}\}/g, (m, name: string) =>
    vars[name] == null ? m : String(vars[name]),
  );
}

/** Pure lookup — usable outside React (api.ts, non-component modules). */
export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  const raw = DICTS[lang][key] ?? DICTS.pt[key];
  return raw == null ? key : interpolate(raw, vars);
}

/** Plural lookup: `key.one` when n === 1, `key.other` otherwise (PT/EN share the rule). */
export function translatePlural(
  lang: Lang,
  key: string,
  n: number,
  vars?: Record<string, string | number>,
): string {
  return translate(lang, `${key}.${n === 1 ? "one" : "other"}`, { ...vars, n });
}

export function localeFor(lang: Lang): string {
  return LOCALE[lang];
}

function readStored(): Lang {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === "pt" || raw === "en") return raw;
  } catch {
    // storage unavailable — fall through to the browser language
  }
  return typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("pt")
    ? "pt"
    : "en";
}

/**
 * Server-provided strings (refresh steps) are translated client-side by
 * mapping the known PT messages to dictionary keys; unknown text passes
 * through untouched, so `t()` returns it as-is.
 */
const SERVER_STEP_KEYS: Record<string, string> = {
  "Buscando conteúdo novo no portal": "server.step.fetching",
  "Buscando notas, calendário e avisos": "server.step.surfaces",
  "Montando o índice de tarefas do portal": "server.step.portalIndex",
  "Montando a lista de atividades": "server.step.building",
  Concluído: "server.step.done",
  Falhou: "server.step.failed",
  "Aguardando você resolver o reCAPTCHA": "server.step.recaptcha",
};

export function serverStepKey(raw: string): string {
  return SERVER_STEP_KEYS[raw] ?? raw;
}

// Module-level mirror of the active language for non-React modules (api.ts).
let currentLang: Lang = readStored();

export function getLang(): Lang {
  return currentLang;
}

interface I18nValue {
  lang: Lang;
  locale: string;
  setLang: (l: Lang) => void;
  t: TranslateFn;
  /** `t` for `key.one` / `key.other` with `{{n}}` injected. */
  tn: (key: string, n: number, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStored);

  useEffect(() => {
    currentLang = lang;
    document.documentElement.lang = LOCALE[lang];
    document.title = translate(lang, "app.title");
  }, [lang]);

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      locale: LOCALE[lang],
      setLang: (l: Lang) => {
        try {
          localStorage.setItem(KEY, l);
        } catch {
          // storage indisponível — aplica só em memória
        }
        setLangState(l);
      },
      t: (key, vars) => translate(lang, key, vars),
      tn: (key, n, vars) => translatePlural(lang, key, n, vars),
    }),
    [lang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT fora de LangProvider");
  return ctx;
}
