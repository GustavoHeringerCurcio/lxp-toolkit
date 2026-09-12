import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ListChecks, Upload, CircleCheckBig, MessagesSquare } from "lucide-react";
import { TONE_CLS, type Tone } from "@/lib/status";
import { KIND_META } from "@/lib/kind";
import { useT, type TranslateFn } from "@/lib/i18n";

function toneLabel(tone: Tone, t: TranslateFn): string {
  switch (tone) {
    case "ok":
      return t("status.done");
    case "late":
      return t("status.lateDays", { n: 2 });
    case "soon":
      return t("status.dueTomorrow");
    case "coming":
      return t("status.dueIn", { n: 5 });
    case "none":
      return t("status.noDeadline");
  }
}

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
  const { t } = useT();
  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 p-4 sm:p-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{t("design.system")}</p>
        <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight">{t("design.folio")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("design.intro")} <code className="font-mono text-xs">DESIGN.md</code> {t("design.introAfter")}{" "}
          <code className="font-mono text-xs">src/index.css</code>.
        </p>
      </header>

      <Section title={t("design.palette")}>
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

      <Section title={t("design.typography")}>
        <Card>
          <CardContent className="space-y-4">
            <div>
              <div className="font-heading text-3xl font-semibold tracking-tight">Fraunces — display</div>
              <div className="mt-1 font-mono text-[10px] text-muted-foreground">font-heading · opsz auto</div>
            </div>
            <div>
              <div className="text-base">{t("design.typographyBody")}</div>
              <div className="mt-1 font-mono text-[10px] text-muted-foreground">font-sans · 14px base</div>
            </div>
            <div>
              <div className="font-mono text-lg tabular-nums">3d 04h · 12.345 · 2026-09-12</div>
              <div className="mt-1 font-mono text-[10px] text-muted-foreground">{t("design.monoBody")}</div>
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section title={t("design.buttons")}>
        <Card>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Button>{t("design.btnPrimary")}</Button>
            <Button variant="secondary">{t("design.btnSecondary")}</Button>
            <Button variant="outline">{t("design.btnOutline")}</Button>
            <Button variant="ghost">{t("design.btnGhost")}</Button>
            <Button variant="destructive">{t("design.btnDestructive")}</Button>
            <Button variant="link">{t("design.btnLink")}</Button>
            <Button disabled>{t("design.btnDisabled")}</Button>
            <Button size="sm">{t("design.btnSmall")}</Button>
            <Button size="xs">{t("design.btnXSmall")}</Button>
          </CardContent>
        </Card>
      </Section>

      <Section title={t("design.badges")}>
        <Card>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(TONE_CLS) as Tone[]).map((tone) => (
                <span
                  key={tone}
                  className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${TONE_CLS[tone]}`}
                >
                  {toneLabel(tone, t)}
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
                    {t(`kind.${k}.short`)}
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

      <Section title={t("design.fields")}>
        <Card>
          <CardContent className="grid max-w-md gap-3">
            <Input placeholder={t("design.fieldText")} aria-label={t("design.fieldText")} />
            <Textarea placeholder={t("design.fieldArea")} rows={3} aria-label={t("design.fieldArea")} />
          </CardContent>
        </Card>
      </Section>

      <Section title={t("design.icons")}>
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

      <Section title={t("design.motion")}>
        <Card>
          <CardHeader>
            <CardTitle>{t("design.motionTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {t("design.motionBody")} <code className="font-mono text-xs">ease-soft</code>. {t("design.motionBody2")}{" "}
            <code className="font-mono text-xs">prefers-reduced-motion</code> {t("design.motionBody3")}
          </CardContent>
        </Card>
      </Section>
    </div>
  );
}
