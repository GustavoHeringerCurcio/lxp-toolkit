import { useEffect, useState, type ReactElement } from "react";
import { Check, Loader2, Save, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { saveAiDefault, saveProfile } from "@/api";
import { useAppData } from "@/lib/app-state";
import { tryParseAiRequest, resolvePlaceholders } from "@/lib/prompt-preview";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetClose,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import type { AiProfile } from "@/types";

const DEFAULT_DRAFT = JSON.stringify(
  {
    perfil: "",
    instrucoes: [
      "responda como um aluno de faculdade",
      "escreva como um humano, em português simples",
      "evite símbolos e formatações",
      "não pareça com uma i.a., não escreva de forma robótica",
    ],
    contexto: "",
  },
  null,
  2,
);

function PlaceholderChip({ token, onClick }: { token: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-brand/30 bg-brand/10 px-1.5 py-0.5 font-mono text-[11px] text-brand transition-colors hover:bg-brand/20"
      title="inserir marcador no texto"
    >
      {token}
    </button>
  );
}

export function AiSettingsDialog({ trigger }: { trigger: ReactElement }) {
  const { cfg, patchConfig, refresh } = useAppData();
  const profile = cfg?.profile ?? { nome: "", matricula: "" };

  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [matricula, setMatricula] = useState("");
  const [defaultJson, setDefaultJson] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setNome(profile.nome ?? "");
    setMatricula(profile.matricula ?? "");
    setDefaultJson(cfg?.ai_request_default ?? DEFAULT_DRAFT);
    setMsg(null);
    setErr(null);
  }, [open, profile.nome, profile.matricula, cfg?.ai_request_default]);

  const insertPlaceholder = (which: "nome" | "matricula") => {
    const token = which === "nome" ? "{nome}" : "{matricula}";
    setDefaultJson((prev) => {
      try {
        const parsed = JSON.parse(prev) as Record<string, unknown>;
        if (typeof parsed.perfil === "string") {
          parsed.perfil = parsed.perfil + (parsed.perfil ? " · " : "") + token;
          return JSON.stringify(parsed, null, 2);
        }
      } catch {
        /* keep raw */
      }
      return prev;
    });
  };

  const saveAll = async () => {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const parsed = tryParseAiRequest(defaultJson);
      if (!parsed) {
        setErr("O JSON padrão está inválido — corrija antes de salvar.");
        return;
      }
      const p: AiProfile = { nome: nome.trim(), matricula: matricula.trim() };
      await saveProfile(p);
      await saveAiDefault(defaultJson);
      patchConfig({ profile: p, ai_request_default: defaultJson });
      setMsg("Perfil e padrão de IA salvos.");
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  };

  const parsed = tryParseAiRequest(defaultJson);
  const preview = parsed ? resolvePlaceholders(parsed.perfil, { nome, matricula }) : "";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={trigger} />
      <SheetContent className="w-full max-w-lg gap-5 overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <UserRound className="size-4 text-brand" aria-hidden />
            Perfil & configuração de IA
          </SheetTitle>
          <SheetDescription>
            Seu nome/matrícula alimentam os marcadores <code className="font-mono">{"{nome}"}</code> e{" "}
            <code className="font-mono">{"{matricula}"}</code>. O JSON abaixo é o pedido padrão para novas respostas.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="ai-nome">Nome</Label>
                <Input id="ai-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ai-matricula">Matrícula</Label>
                <Input
                  id="ai-matricula"
                  value={matricula}
                  onChange={(e) => setMatricula(e.target.value)}
                  placeholder="Ex.: 2023XXXXX"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Pronto: a IA saberá quem é você. Também dá para escrever o nome/matrícula à mão em cada atividade.
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="ai-default" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Pedido padrão (JSON)
              </Label>
              <div className="flex items-center gap-1">
                <PlaceholderChip token="{nome}" onClick={() => insertPlaceholder("nome")} />
                <PlaceholderChip token="{matricula}" onClick={() => insertPlaceholder("matricula")} />
              </div>
            </div>
            <Textarea
              id="ai-default"
              value={defaultJson}
              onChange={(e) => setDefaultJson(e.target.value)}
              rows={13}
              spellCheck={false}
              className={cn(
                "font-mono text-xs leading-relaxed",
                parsed === null && "border-destructive/60 focus-visible:border-destructive",
              )}
            />
            {parsed === null ? (
              <p className="text-xs text-destructive">JSON inválido.</p>
            ) : (
              parsed.instrucoes.length > 0 && (
                <p className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Prévia do que a IA recebe:</span>{" "}
                  {preview || parsed.instrucoes[0]}
                </p>
              )
            )}
            {cfg?.model && (
              <p className="text-[11px] text-muted-foreground">Modelo atual: {cfg.model} · língua {cfg.language}</p>
            )}
            {msg && (
              <p className="flex items-center gap-1.5 rounded-md border border-ok/30 bg-ok/10 px-2.5 py-1.5 text-xs text-ok">
                <Check className="size-3.5" aria-hidden /> {msg}
              </p>
            )}
            {err && <p className="text-xs text-destructive">{err}</p>}
          </div>
        </div>

        <SheetFooter className="mt-auto">
          <SheetClose render={<Button variant="outline" size="sm" />}>
            Fechar
          </SheetClose>
          <Button size="sm" onClick={saveAll} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
            {busy ? "Salvando…" : "Salvar perfil & padrão"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function Label({ children, ...props }: React.ComponentProps<"label">) {
  return (
    <label {...props} className="block text-sm font-medium text-foreground/90">
      {children}
    </label>
  );
}
