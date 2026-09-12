# Pauta — Design System ("Folio" skin) — v2

Design specification for `apps/web/` (the Pauta web app, `npm run web` from the repo root).
This document is the **single source of truth** for brand, tokens, typography, shape, motion,
and component contracts. Implementation phases live in the rebrand plan (2026-09).

v2 is a **full rebrand**: the previous "Grupoa crimson skin" (crimson on blue-ink, Poppins/Lato,
dark-only) is retired. Everything below replaces it.

## 1. Brand

| | |
|---|---|
| Product | **Pauta** — pt-BR for the student's agenda/planner |
| Platform | **LXP ToolKit** (repo/monorepo name; appears as a small sub-label, never as the product name) |
| Positioning | *Copiloto de estudos* — organization + deadlines first; AI drafts, the student reviews and owns |
| Voice | pt-BR, calm, direct, adult. Never autopilot language ("entregue pra você") |

**Co-pilot copy rules (enforced):**
- Generation = **"rascunho"** ("Gerar rascunho", "Salvar rascunho", "Novo rascunho") — never "resposta pronta".
- Sending to the portal keeps factual, high-friction language ("Enviar no portal", confirm checkbox).
- AI always framed as draft aid: *revise antes de enviar*, *você decide o que envia*.

## 2. Direction — "Folio"

Warm-paper editorial. Light-first; dark mode is a **warm espresso**, not blue-ink (deliberate
break from the old app's `#0F171D`). Sienna brand. Serif display. Calm density with generous
whitespace; the app's core job is *reading* (enunciados, rascunhos).

## 3. Color tokens

All decisions live in `src/index.css` under `:root` (light) and `.dark` (dark). oklch everywhere;
tints via `color-mix(in oklab, …)`. Tailwind utilities come from the `@theme inline` block.

### 3.1 Semantic pairs (shadcn contract)

| Token | Light | Dark | Role |
|---|---|---|---|
| `--background` | warm paper `oklch(.977 .007 85)` | near-black espresso `oklch(.165 .012 60)` | page |
| `--card` | `oklch(.995 .003 85)` | `oklch(.205 .013 60)` | raised surfaces |
| `--popover` | = card | `oklch(.215 .013 60)` | overlays |
| `--primary` | sienna `oklch(.52 .125 42)` | sienna bright `oklch(.71 .145 48)` | CTA fill, active nav |
| `--secondary` / `--muted` / `--accent` | warm greys | warm greys | support surfaces |
| `--border` / `--input` | `oklch(.89 .013 78)` | `white / 12–16%` | lines, inputs |
| `--ring` | = primary | = primary | focus |
| `--destructive` | red `oklch(.51 .17 25)` | `oklch(.67 .18 25)` | errors |

Note (dark): `--primary` is bright with **dark** `--primary-foreground` — dark-on-sienna buttons.
**Contrast pass:** dark surfaces sit at L .165–.215 (near-black), foreground at .95, and all accents
carry high chroma (C .11–.18) — the palette must never read "greyed". When adding tokens, keep
text ≥ .74 L and accents ≥ .10 C in dark.

### 3.2 Brand / accents

| Token | Light | Dark | Role |
|---|---|---|---|
| `--brand` | = primary light | `oklch(.71 .145 48)` | sienna accent — links, tint text, chips |
| `--brand-2` | `oklch(.6 .125 46)` | `oklch(.78 .13 52)` | hover/edge variant |
| `--info` | `oklch(.5 .095 245)` dusty blue | `oklch(.725 .11 245)` | quiz-type chip, informational |

### 3.3 Status tones (semantics preserved from v1)

| Tone | State | Label (pt-BR) | Token (light → dark) |
|---|---|---|---|
| ok | done | `Concluída` | green `oklch(.51 .12 150)` → `oklch(.72 .155 150)` |
| late | expired | `Atrasada / Atrasada Nd` | red `oklch(.51 .17 25)` → `oklch(.67 .175 25)` |
| soon | due ≤ 3d | `Vence hoje/amanhã/em Nd` | amber `oklch(.55 .125 75)` → `oklch(.775 .14 80)` |
| coming | open, > 3d | `Vence em Nd` | dusty blue `oklch(.5 .095 245)` → `oklch(.725 .11 245)` |
| none | no deadline | `Sem prazo` | grey `oklch(.55 .015 75)` → `oklch(.68 .014 78)` |

Each tone exposes `--{tone}-bg` (`color-mix` 13–18%). `TONE_CLS` in `lib/status.ts` maps tone → pill
classes. Status is **never color-only** (icon + label always).

### 3.4 Charts

`--chart-1..5` = brand → info → ok → soon → none. Progresso view uses these for module/type bars.

## 4. Typography

Self-hosted via `@fontsource-variable/*` (no runtime Google Fonts):

| Use | Font | Token |
|---|---|---|
| Display / headings / wordmark | **Fraunces Variable** (opsz axis on, `font-optical-sizing: auto` on `html`) | `font-heading` |
| Body / UI | **Inter Variable** (tabular numerals via `tabular-nums` for deadlines/counts) | `font-sans` |
| Data accents (countdowns, counts, matrícula, version chips) | **JetBrains Mono Variable** | `font-mono` |

- Body baseline `text-sm` (14px); meta `text-xs`/`text-[11px]`; page hero `text-2xl–3xl font-heading`.
- Multi-line headings use `text-balance`.

## 5. Shape, elevation, motion

- `--radius: 0.75rem`; cards `rounded-xl`; pills `rounded-full`; primitives derive `radius-sm..4xl`.
- Elevation: borders first; shadows soft and rare (`shadow-md` on brand tile only).
- Motion tokens (restrained):
  - Durations: `120ms` (micro) / `200ms` (default) / `320ms` (overlays)
  - Easing: `--ease-soft: cubic-bezier(.22, 1, .36, 1)` → `ease-soft` utility
  - Motion confirms actions, never decorates. `prefers-reduced-motion` respected via `tw-animate-css`.

## 6. Icon mapping (lucide-react)

| Context | Icon |
|---|---|
| Brand monogram | serif "P" tile (favicon.svg; sidebar tile uses text, not an icon) |
| Nav — Agora | `Sunrise` |
| Nav — Tarefas | `ListChecks` |
| Nav — Progresso | `ChartColumn` |
| Nav — Ajustes | `SlidersHorizontal` |
| Nav — Design | `Palette` |
| Command palette | `Command` |
| Theme toggle | `Sun` / `Moon` |
| Activity type — quiz | `ListChecks` (info chip) |
| Activity type — upload | `Upload` (brand chip) |
| Activity type — mark | `CircleCheckBig` (ok chip) |
| Activity type — other | `MessagesSquare` (neutral chip) |
| Focus mode | `Maximize2` / `Minimize2` |

## 7. Professor accent chips

`AccChips` + `lib/prof.ts`: deterministic accent per professor. The palette values are **data, not
theme tokens** — the one documented exception to the "no raw hex" rule (they must stay stable and
distinguishable across themes). Folio palette: terracotta / olive / teal / plum / rose, chosen to
sit harmoniously on warm paper.

## 8. IA (information architecture) — 6 routes

| Route | Page | Content |
|---|---|---|
| `/` | **Agora** | greeting, next-task hero with live countdown, today's queue, overall progress ring, module mini-bars |
| `/tarefas` | **Tarefas** | scope tabs (Abertas/Atrasadas/Concluídas/Todas) + module/type chips + list |
| `/progresso` | **Progresso** | per-module progress bars, status/type distribution (CSS bars, `chart-*` tokens) |
| `/tarefa/:id` | **Atividade** | reading column (prose width) + sticky workbench; focus mode; version timeline; 3-step send flow |
| `/ajustes` | **Ajustes** | IA config, generation params, preview |
| `/design` | **Design** | living style guide: tokens, type ramp, components, states |

Global: **⌘K / Ctrl+K command palette** — navigate, jump to any tarefa, filter by module, toggle
theme, refresh content.

State shared across routes (scope, module/type filter) lives in `lib/app-state.tsx`.

## 9. Component contract (vibecoding rules)

1. **Tokens-first.** Zero raw hex/oklch in TSX — semantic utilities only (`bg-primary`,
   `text-muted-foreground`, …). Exception: professor accent data (§7).
2. **Primitives** live only in `components/ui/` (shadcn `base-nova` style). Semantic components
   compose them; pages never restyle primitives ad hoc.
3. **States matrix.** Every interactive component documents/handles:
   hover · focus-visible · active · disabled · loading · empty · error.
4. **Copy** in pt-BR, co-pilot framing (§1). New strings follow the voice rules.
5. **Pipeline per phase:** DESIGN.md → tokens → primitives → semantic components → pages →
   `npm run typecheck`.
6. Both themes are first-class: every new surface is checked in light **and** dark.

## 10. Theme mechanism

- `<html lang="pt-BR">` (no hardcoded class) + inline no-flash script resolving `pauta-theme`
  (`light` / `dark` / `system`, default `system`) before first paint.
- `lib/theme.tsx` — `ThemeProvider` + `useTheme()`; header icon toggle (light↔dark);
  system preference changes tracked while in `system` mode.

## 11. Accessibility

- Status rendered as colored pill **+ icon + label** (never color-only).
- Icon-only buttons carry `aria-label` (theme toggle, refresh, palette, focus mode).
- Visible focus (`outline-ring/50`, `ring-ring/50`); `prefers-reduced-motion` respected.
- Contrast: `--primary-foreground` on `--primary` ≥ 4.5:1 in both themes (dark-on-sienna in dark).
- `lang="pt-BR"` set in `index.html`.

## History

- **v2.1 (2026-09):** contrast pass — dark surfaces dropped to near-black (L .165), foreground
  raised to .95, all accent/status chroma lifted (+20–40%) so nothing reads grey; light-mode ink
  darkened to match. Brand and semantics unchanged.
- **v2 (2026-09):** full rebrand to "Folio" (warm paper / sienna / Fraunces–Inter–JetBrains Mono),
  product named **Pauta** (by LXP ToolKit), light+dark day one, motion tokens, command palette,
  6-route IA, /design showcase. Retired: crimson-on-ink skin, Poppins/Lato, dark-only hardcode.
- v1 (2026-09-05): Grupoa crimson skin spec (removed).
