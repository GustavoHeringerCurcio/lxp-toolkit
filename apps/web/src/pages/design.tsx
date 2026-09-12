import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ListChecks, Upload, CircleCheckBig, MessagesSquare } from "lucide-react";
import { TONE_CLS, type Tone } from "@/lib/status";
import { KIND_META } from "@/lib/kind";

const TONE_LABEL: Record<Tone, string> = {
  ok: "Concluída",
  late: "Atrasada 2d",
  soon: "Vence amanhã",
  coming: "Vence em 5d",
  none: "Sem prazo",
};

function Swatch({ name, varName, dark }: { name: string; varName: string; dark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={dark ? "size-8 shrink-0 rounded-lg border" : "size-8 shrink-0 rounded-lg border"}
        style={{ background: `var(${varName})` }}
      />
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium">{name}</span>
        <span className="block truncate font-mono text-[10px] text-muted-foreground">{varName}</span>
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-heading text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

/** Living style guide — tokens, type ramp and component states (DESIGN.md §8-9). */
export function DesignPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 p-4 sm:p-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Sistema</p>
        <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight">Design · Folio</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Guia vivo do design system. A fonte da verdade é <code className="font-mono text-xs">DESIGN.md</code> e{" "}
          <code className="font-mono text-xs">src/index.css</code>.
        </p>
      </header>

      <Section title="Paleta — superfícies">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card size="sm">
            <CardContent className="grid gap-2.5">
              <Swatch name="Background" varName="--background" />
              <Swatch name="Card" varName="--card" />
              <Swatch name="Muted" varName="--muted" />
              <Swatch name="Border" varName="--border" />
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent className="grid gap-2.5">
              <Swatch name="Primary" varName="--primary" />
              <Swatch name="Primary fg" varName="--primary-foreground" />
              <Swatch name="Brand" varName="--brand" />
              <Swatch name="Info" varName="--info" />
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent className="grid gap-2.5">
              <Swatch name="Ok" varName="--ok" />
              <Swatch name="Late" varName="--late" />
              <Swatch name="Soon" varName="--soon" />
              <Swatch name="Coming" varName="--coming" />
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent className="grid gap-2.5">
              <Swatch name="Chart 1" varName="--chart-1" />
              <Swatch name="Chart 2" varName="--chart-2" />
              <Swatch name="Chart 3" varName="--chart-3" />
              <Swatch name="Chart 4" varName="--chart-4" />
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="Tipografia">
        <Card>
          <CardContent className="space-y-4">
            <div>
              <div className="font-heading text-3xl font-semibold tracking-tight">Fraunces — display</div>
              <div className="mt-1 font-mono text-[10px] text-muted-foreground">font-heading · opsz auto</div>
            </div>
            <div>
              <div className="text-base">Inter — corpo da interface. A raposa marrom salta sobre o cão preguiçoso.</div>
              <div className="mt-1 font-mono text-[10px] text-muted-foreground">font-sans · 14px base</div>
            </div>
            <div>
              <div className="font-mono text-lg tabular-nums">3d 04h · 12.345 · 2026-09-12</div>
              <div className="mt-1 font-mono text-[10px] text-muted-foreground">font-mono · dados e contagens</div>
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section title="Botões">
        <Card>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Button>Primário</Button>
            <Button variant="secondary">Secundário</Button>
            <Button variant="outline">Contorno</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destrutivo</Button>
            <Button variant="link">Link</Button>
            <Button disabled>Desabilitado</Button>
            <Button size="sm">Small</Button>
            <Button size="xs">XSmall</Button>
          </CardContent>
        </Card>
      </Section>

      <Section title="Badges de status e tipo">
        <Card>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(TONE_LABEL) as Tone[]).map((t) => (
                <span
                  key={t}
                  className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${TONE_CLS[t]}`}
                >
                  {TONE_LABEL[t]}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {(["quiz", "upload", "mark", "other"] as const).map((k) => {
                const meta = KIND_META[k];
                const Icon = meta.icon;
                return (
                  <span
                    key={k}
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${meta.badgeClass}`}
                  >
                    <Icon className="size-3" aria-hidden />
                    {meta.short}
                  </span>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>default</Badge>
              <Badge variant="secondary">secondary</Badge>
              <Badge variant="outline">outline</Badge>
              <Badge variant="destructive">destructive</Badge>
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section title="Campos">
        <Card>
          <CardContent className="grid max-w-md gap-3">
            <Input placeholder="Campo de texto" aria-label="Campo de texto" />
            <Textarea placeholder="Área de texto" rows={3} aria-label="Área de texto" />
          </CardContent>
        </Card>
      </Section>

      <Section title="Ícones de tipo">
        <Card>
          <CardContent className="flex flex-wrap gap-4">
            {(
              [
                ["quiz", ListChecks],
                ["upload", Upload],
                ["mark", CircleCheckBig],
                ["other", MessagesSquare],
              ] as const
            ).map(([k, Icon]) => (
              <span key={k} className={`grid size-10 place-items-center rounded-lg ${KIND_META[k].tileClass}`}>
                <Icon className="size-4" aria-hidden />
              </span>
            ))}
          </CardContent>
        </Card>
      </Section>

      <Section title="Movimento">
        <Card>
          <CardHeader>
            <CardTitle>Restrito por padrão</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Durações 120 / 200 / 320 ms, easing <code className="font-mono text-xs">ease-soft</code>. O movimento
            confirma ações — nunca decora. <code className="font-mono text-xs">prefers-reduced-motion</code> sempre
            respeitado.
          </CardContent>
        </Card>
      </Section>
    </div>
  );
}
