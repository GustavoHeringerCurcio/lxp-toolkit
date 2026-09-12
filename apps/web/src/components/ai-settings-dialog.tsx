import { useEffect, useState, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Loader2, Save, SlidersHorizontal, UserRound } from "lucide-react";
import { saveProfile } from "@/api";
import { useAppData } from "@/lib/app-state";
import { useT } from "@/lib/i18n";
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
import { Separator } from "@/components/ui/separator";
import type { AiProfile } from "@/types";

export function AiSettingsDialog({ trigger }: { trigger: ReactElement }) {
  const { cfg, patchConfig } = useAppData();
  const { t } = useT();
  const profile = cfg?.profile ?? { nome: "", matricula: "" };
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [matricula, setMatricula] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setNome(profile.nome ?? "");
    setMatricula(profile.matricula ?? "");
  }, [open, profile.nome, profile.matricula]);

  useEffect(() => {
    if (open) {
      setMsg(null);
      setErr(null);
    }
  }, [open]);

  const saveAll = async () => {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const p: AiProfile = { nome: nome.trim(), matricula: matricula.trim() };
      await saveProfile(p);
      patchConfig({ profile: p });
      setMsg(t("profile.saved"));
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={trigger} />
      <SheetContent className="w-full max-w-lg gap-5 overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <UserRound className="size-4 text-brand" aria-hidden />
            {t("profile.title")}
          </SheetTitle>
          <SheetDescription>{t("profile.desc")}</SheetDescription>
        </SheetHeader>

        <div className="space-y-5">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="ai-nome">{t("profile.name")}</Label>
              <Input id="ai-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder={t("profile.namePlaceholder")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ai-matricula">{t("profile.id")}</Label>
              <Input
                id="ai-matricula"
                value={matricula}
                onChange={(e) => setMatricula(e.target.value)}
                placeholder={t("profile.idPlaceholder")}
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{t("profile.otherScreens")}</p>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={() => {
                setOpen(false);
                navigate("/ajustes");
              }}
            >
              <SlidersHorizontal aria-hidden />
              {t("profile.moreSettings")}
            </Button>
          </div>

          {msg && (
            <p className="flex items-center gap-1.5 rounded-md border border-ok/30 bg-ok/10 px-2.5 py-1.5 text-xs text-ok">
              <Check className="size-3.5" aria-hidden /> {msg}
            </p>
          )}
          {err && <p className="text-xs text-destructive">{err}</p>}
        </div>

        <SheetFooter className="mt-auto">
          <SheetClose render={<Button variant="outline" size="sm" />}>
            {t("profile.close")}
          </SheetClose>
          <Button size="sm" onClick={saveAll} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
            {busy ? t("profile.saving") : t("profile.save")}
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
