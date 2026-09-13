# LXP Toolkit — Design System ("Folio" skin) — v3

Design specification for `apps/web/` (the LXP Toolkit web app, `npm run web` from the repo root).
This document is the **single source of truth** for brand, tokens, typography, shape, motion,
and component contracts. Implementation phases live in the rebrand plan (2026-09).

v2 is a **full rebrand**: the previous "Grupoa crimson skin" (crimson on blue-ink, Poppins/Lato,
dark-only) is retired. Everything below replaces it.

## 1. Brand

| | |
|---|---|
| Product | **LXP Toolkit** — the study toolkit on top of the Grupoa LXP platform |
| Mark | "Stacked X" — rounded sienna tile, two offset diagonals (layers/toolkit); `BrandMark` + `public/favicon.svg` |
| Positioning | *Copiloto de estudos* — organization + deadlines first; AI drafts, the student reviews and owns |
| Voice | pt-BR, calm, direct, adult. Never autopilot language ("entregue pra você") |

**Co-pilot copy rules (enforced):**
- Generation = **"rascunho"** ("Gerar rascunho", "Salvar rascunho", "Novo rascunho") — never "resposta pronta".
- Sending to the portal keeps factual, high-friction language ("Enviar no portal"). It happens in a
  confirmation **modal** whose single explicit "Confirmar e enviar" CTA *is* the confirmation — no
  separate checkbox.
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

### 3.5 Identity color economy (v3)

**Status owns semantic color · type is monochrome · subject owns identity color · professor is neutral.**
This rule prevents the overload that made type badges collide with status (blue = quiz *and* "due soon").

| Dimension | Encoding | Where |
|---|---|---|
| Status | semantic tone + icon + label | `TONE_CLS` / `StatusBadge` |
| Type | icon + label, monochrome (`border-border bg-muted/40 text-muted-foreground`) | `KIND_META.badgeClass`, `ActivityBadge` |
| Activity state | combined `type · state` badge (`Tarefa · Sem pergunta`); monochrome normally, **outline** red/amber for anomalies — never filled | `lib/kind.ts::activityBadge`, `ActivityBadge` |
| Subject (module) | `--subject-1..12` palette + monogram initials | `lib/subject.ts`, `lib/subject-colors.tsx`, `.subject-avatar` |
| Professor | neutral initials avatar, never colored | `lib/prof.ts`, `ProfessorTag` |

**Activity-state exception (v3.5).** `ActivityBadge` is always rendered and carries the coarse type
*plus* the answerability state for quiz/upload (`Com pergunta` / `Sem pergunta` / `Print`); every
other kind shows the type alone (`Fórum`, `Leitura`, `PDF`, …). An anomaly tints the chip with a
status hue (`error` → `--late`, `warn` → `--soon`) but **only as an outline** (`rounded-md`, no
fill), so it never reads as a second filled status pill on the same card. This is a deliberate,
bounded exception to "type is monochrome": the fill channel still belongs to status. The anomaly
model is a list (`anomalies: { code, severity }[]`), so new anomaly types reuse this chip without
new UI.

Subject palette (tokens in `index.css`, light + dark tuned; no raw color in TSX):

| Token | Hue |
|---|---|
| `--subject-1..12` | red · emerald · magenta · lime · indigo · orange · cyan · rose · green · violet · amber · blue (adjacent slots ~150° apart) |

A module maps to a slot deterministically (FNV-1a `subjectIndex`, with an optional pin map). Because a bare hash can collide — "Projeto" and "Desenvolvimento Back-end" both landed on slot 1 — `SubjectColorProvider` (`lib/subject-colors.tsx`) resolves the whole visible module set through `assignSubjectIndices`, which keeps the hash as a starting point and probes forward so every module gets a distinct color. Components read it via `useSubjectStyle` / `useSubjectColorMap`, falling back to the hash outside a provider. The monogram is the leading anchor of every activity card; the module name repeats the color as text (`SubjectLabel`).

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
| Brand mark | "Stacked X" tile (`BrandMark`; mirrors `favicon.svg`) |
| Nav — Agora | `Sunrise` |
| Nav — Tarefas | `ListChecks` |
| Nav — Progresso | `ChartColumn` |
| Nav — Ajustes | `SlidersHorizontal` |
| Nav — Design | `Palette` |
| Nav — Treino de quiz | `GraduationCap` |
| Nav — Perguntar à IA | `Sparkles` |
| Command palette | `Command` |
| Theme toggle | `Sun` / `Moon` |
| Activity type — quiz | `ListChecks` (monochrome chip) |
| Activity type — upload | `Upload` (monochrome chip) |
| Activity type — mark | `CircleCheckBig` (monochrome chip) |
| Activity type — other | `MessagesSquare` (monochrome chip) |
| Focus mode | `Maximize2` / `Minimize2` |

**Exception — send-flow icon set.** The send-confirmation modal does not use lucide. It draws from
one custom duotone family in `components/icons/send-icons.tsx` (24px grid, 1.5 stroke, round
caps/joins, `currentColor` + `fillOpacity .12` on body shapes): submit, warning, text / `.txt` /
`.pdf`, preview, download, close, check, spinner. Every other surface stays lucide.

## 7. Subject identity & neutral professors

`SubjectAvatar` + `lib/subject.ts` + `lib/subject-colors.tsx` + `lib/subject-icon.ts`:
deterministic identity per **module** (the only per-card color, see §3.5). Color comes from the
`--subject-1..12` theme tokens, resolved collision-free per module set, so there is
no raw color in TSX and the old "no raw hex" exception is retired. The tile shows a domain pictogram
derived automatically from the module name (`subjectIcon`, accent-insensitive whole-phrase keywords;
e.g. "Banco de Dados" → `Database`, "Arquitetura de Software" → `Network`), falling back to the
2-letter monogram (`subjectInitials`) when nothing matches. A small monochrome type icon sits in the
corner as a badge. `SubjectLabel` repeats the color on the module name.

`SubjectAvatar` also accepts an optional `imageUrl` — the professor's photo from the hardcoded
organization directory or a per-professor override (Ajustes → Organização). When present it fills
the tile (`object-cover`) while the subject-colored frame and the type badge stay; a broken/failed
image falls back to the pictogram, then the monogram.

`ProfessorTag` + `lib/prof.ts`: professors are secondary identity. A neutral initials avatar + name
(optionally the configured photo), never a competing color. The sidebar "Professores" list uses the
same neutral treatment.

## 8. IA (information architecture) — 8 routes

| Route | Page | Content |
|---|---|---|
| `/` | **Agora** | combined status line (merged done/late/open bar + overall ring, disclosing per-module bars), greeting, next-task hero with live countdown, urgency-grouped open queue |
| `/tarefas` | **Tarefas** | scope tabs (Abertas/Atrasadas/Concluídas/Todas) + module/type chips + list |
| `/progresso` | **Progresso** | per-module progress bars, status/type distribution (CSS bars, `chart-*` tokens) |
| `/tarefa/:id` | **Atividade** | reading column (prose width) + sticky workbench; focus mode; version timeline; send-confirmation modal |
| `/treino/quiz` | **Treino de quiz** | gamified practice quiz (AI-generated or portal-sourced), one question at a time with feedback, score + readiness verdict + history |
| `/treino/estudo` | **Perguntar à IA** | free-text study Q&A scoped to the selected subject; streamed markdown |
| `/ajustes` | **Ajustes** | hub with pill tabs (Pessoal · IA · Avançado · Organização): profile + appearance, IA voice/format/rules/content, generation params + preview, institution + professor directory |
| `/design` | **Design** | living style guide: tokens, type ramp, components, states |

Global: **⌘K / Ctrl+K command palette** — navigate, jump to any tarefa, filter by module, toggle
theme, refresh content.

State shared across routes (scope, module/type filter) lives in `lib/app-state.tsx`.

**Training pattern.** Both Treino routes share `TrainingSubjectPicker` + `lib/training-state.tsx`
(persisted course/module = the "switch the data" that scopes the AI's knowledge pack). The pack is
built server-side from Postgres — catalog + question bank + the **precomputed `content_text`**
(material extracted once at index time, since the portal exposes very few quizzes and reading
`html` is empty). Quiz practice is **material-first**: `ai` writes new questions from the material;
`mixed` uses the real portal questions that exist and fills the rest with AI (never errors when a
module has none). It is gamified: one question at a time, immediate correct/wrong reveal with
rationale, then a score ring and a 3-tier **self-check** verdict (`lib/training.ts`); sessions and
scores persist in Postgres (`training_quiz`/`training_question`/`training_answer`). Ask AI is
free-text and streams markdown.

**Agora progress pattern.** `ProgressSummary` is the page's top line: a single segmented bar
(`ok`/`late`/`coming`) with the overall `ProgressRing` on the right, a labelled legend, and a
chevron disclosure that expands to one stacked bar per module. The disclosure state persists
(`lxp.agora.progress.modules`). The ring is the percentage, the bar is the composition — they
share one row and are never redundant. The whole card is a click target (module rows stop
propagation and filter `/tarefas`). On expand the merged bar shrinks to a stub while the ring
grows (`ease-soft`, 500ms) and the module list reveals via a `0fr → 1fr` grid; module rows are
`tabIndex -1` and the panel `aria-hidden` while collapsed.

## 9. Component contract (vibecoding rules)

1. **Tokens-first.** Zero raw hex/oklch in TSX — semantic utilities only (`bg-primary`,
   `text-muted-foreground`, …). Identity color comes from the `--subject-*` tokens via
   `lib/subject.ts` (§3.5, §7).
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
  (`light` / `dark` / `system`, default `system`) before first paint. `pauta-theme` / `pauta-lang`
  are **legacy storage keys kept on purpose** so existing users do not lose their theme/language.
- `lib/theme.tsx` — `ThemeProvider` + `useTheme()`; header icon toggle (light↔dark);
  system preference changes tracked while in `system` mode.

## 11. Accessibility

- Status rendered as colored pill **+ icon + label** (never color-only).
- Icon-only buttons carry `aria-label` (theme toggle, refresh, palette, focus mode).
- Visible focus (`outline-ring/50`, `ring-ring/50`); `prefers-reduced-motion` respected.
- Contrast: `--primary-foreground` on `--primary` ≥ 4.5:1 in both themes (dark-on-sienna in dark).
- `lang="pt-BR"` set in `index.html`.

## History

- **v3.5 (2026-09):** always-on `ActivityBadge` (`type · state`) with a generalized anomaly model
  (`ghost`/`print` today); anomalies tint the chip via outline red/amber (bounded §3.5 exception).
  Replaces the standalone `TypeBadge`/`FlavorBadge`.
- **v3.4 (2026-09):** subject palette widened to 12 clearly distinct hues (adjacent slots ~150°
  apart) and made collision-free: `SubjectColorProvider` assigns each module a unique slot for the
  visible set, so modules that used to share a color (e.g. "Projeto" and "Desenvolvimento
  Back-end") no longer do.
- **v3.3 (2026-09):** subject tiles show an automatic domain pictogram (`lib/subject-icon.ts`,
  monogram fallback); professor photos come from a hardcoded organization directory
  (`apps/server/config/organizations.json`) or a per-professor LinkedIn override, loaded by the
  browser straight from unavatar (no server download/cache), shown on the subject tile and
  `ProfessorTag`; managed in Ajustes → Organização and the card ⋯ menu.
- **v3.2 (2026-09):** send modal decluttered to a minimal confirm (title + one warning line + one
  action line); format becomes a segmented control; all modal icons replaced by the custom duotone
  `send-icons` family.
- **v3.1 (2026-09):** send flow moved from an inline block to a centered confirmation modal
  (Base UI `Dialog`); checkbox dropped for a single explicit CTA; custom submission-format icon
  family added.
- **v3 (2026-09):** rebrand **Pauta → LXP Toolkit** ("Stacked X" mark); identity color economy
  (status = semantic, type = monochrome icon, subject = `--subject-1..12` identity, professor =
  neutral); activity cards reworked around the subject monogram; raw-hex exception retired.
- **v2.1 (2026-09):** contrast pass — dark surfaces dropped to near-black (L .165), foreground
  raised to .95, all accent/status chroma lifted (+20–40%) so nothing reads grey; light-mode ink
  darkened to match. Brand and semantics unchanged.
- **v2 (2026-09):** full rebrand to "Folio" (warm paper / sienna / Fraunces–Inter–JetBrains Mono),
  product named **Pauta** (by LXP ToolKit), light+dark day one, motion tokens, command palette,
  6-route IA, /design showcase. Retired: crimson-on-ink skin, Poppins/Lato, dark-only hardcode.
- v1 (2026-09-05): Grupoa crimson skin spec (removed).
