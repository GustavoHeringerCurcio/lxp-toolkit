# LXP Toolkit - Design System ("Mono" skin) - v4.1

Design specification for `apps/web/` (the LXP Toolkit web app, `npm run web` from the repo root).
This document is the **single source of truth** for brand, tokens, typography, shape, motion,
and component contracts.

v4.1 is a **Grok-inspired warm-black rebrand**: layered near-black surfaces, alpha borders, an ink
primary, Grok blue for interactive details, and hue otherwise reserved for status. The previous
"Folio" skin (warm paper / sienna / Fraunces serif / warm espresso) is retired.

## 1. Brand

| | |
|---|---|
| Product | **LXP Toolkit** - the study toolkit on top of the Grupoa LXP platform |
| Mark | "Stacked X" - rounded ink tile, two offset diagonals (layers/toolkit); `BrandMark` + `public/favicon.svg` |
| Positioning | *Copiloto de estudos* - organization + deadlines first; AI drafts, the student reviews and owns |
| Voice | pt-BR, calm, direct, adult. Never autopilot language ("entregue pra voce") |
| Palette | Warm near-black / paper white / warm greys, with Grok blue for interactive details. Status keeps its semantic hue. |

**Co-pilot copy rules (enforced):**
- Generation = **"rascunho"** ("Gerar rascunho", "Salvar rascunho", "Novo rascunho") - never "resposta pronta".
- Sending to the portal keeps factual, high-friction language ("Enviar no portal"). It happens in a
  confirmation **modal** whose single explicit "Confirmar e enviar" CTA *is* the confirmation - no
  separate checkbox.
- AI always framed as draft aid: *revise antes de enviar*, *voce decide o que envia*.

## 2. Direction - "Mono"

Grok-inspired minimalism. Warm near-black chrome, layered dark surfaces, hairline borders, generous
whitespace, and an ink primary for actions. Light mode is warm paper (`#F9F8F7` / `#FEFEFC`) with
ink-black CTAs; dark mode moves through `#131211` (chrome), `#181716` (page) and `#201F1D` (cards)
with `#23211F` for elevated surfaces. No sienna, no decorative gradients.

Grok blue (`#1084FE`) is an **interactive detail**, not a brand wash: focus rings, text selection,
links, AI icons, selected states and chart accents. Primary buttons stay ink/paper. Light-mode blue
text is deepened to `#0B6FD8` so it keeps AA contrast on warm paper; dark-mode blue text uses
`#4B9BFF` for the same reason.

References: Grok's live app uses `#FEFEFC` / `#F9F8F7` in light, warm near-black panes in dark, ink
`#2C2C2B` / `#E6E5E3`, alpha-based borders, Inter/Universal Sans and a blue interactive accent.

## 3. Color tokens

All decisions live in `src/index.css` under `:root` (light) and `.dark` (dark). oklch everywhere;
tints via `color-mix(in oklab, ...)`. Tailwind utilities come from the `@theme inline` block.

### 3.1 Semantic pairs (shadcn contract)

| Token | Light | Dark | Role |
|---|---|---|---|
| `--background` | warm paper `oklch(.980 .002 67.8)` | `#181716` `oklch(.205 .003 67.7)` | page |
| `--card` | `oklch(.996 .003 106.4)` | `#201F1D` `oklch(.240 .004 84.6)` | raised surfaces |
| `--popover` | white `oklch(1 0 0)` | `#23211F` `oklch(.249 .005 67.6)` | overlays |
| `--primary` | ink `oklch(.293 .002 106.5)` | paper `oklch(.922 .003 84.6)` | CTA fill, active nav |
| `--primary-foreground` | `oklch(.996 .003 106.4)` | `#131211` `oklch(.183 .003 67.7)` | text on primary |
| `--secondary` / `--muted` | `oklch(.956 .005 78.3)` | `#201F1D` | support surfaces |
| `--muted-foreground` | `oklch(.526 .011 78.2)` | `oklch(.714 .011 81.8)` | secondary text |
| `--accent` | `oklch(.929 .006 75.4)` | `#23211F` | hover/focus wash |
| `--border` / `--input` | `oklch(.920 .007 80.7)` / `oklch(.865 .009 78.3)` | `warm white / 12-16%` | lines, inputs |
| `--ring` | Grok blue `oklch(.624 .204 255.6)` | Grok blue | focus |
| `--destructive` | red `oklch(.577 .215 27.3)` | `oklch(.711 .166 22.2)` | errors |

Note (dark): the surface stack is `#131211` sidebar -> `#181716` page -> `#201F1D` card ->
`#23211F` elevated. `--primary` is paper-white with a **dark** `--primary-foreground`. Borders are
warm white alpha layers, so the whole shell reads warm black rather than cold gray.

### 3.2 Brand / accents

| Token | Light | Dark | Role |
|---|---|---|---|
| `--brand` | `#0B6FD8` `oklch(.551 .181 255.7)` | `#4B9BFF` `oklch(.687 .167 255.4)` | blue accent - links, icons, chips |
| `--brand-2` | `#0066CC` `oklch(.522 .177 255.8)` | `#1084FE` `oklch(.624 .204 255.6)` | hover/edge + chart accent |
| `--info` | = brand | = brand | blue informational tone |

`#1084FE` is the Grok blue. It is used directly for focus rings and selection; text usages switch
to the AA-safe light/dark variants above. Primary buttons and the brand mark stay ink/paper.

### 3.3 Status tones (semantics preserved)

| Tone | State | Label (pt-BR) | Token (light -> dark) |
|---|---|---|---|
| ok | done | `Concluida` | green `oklch(.527 .137 150)` -> `oklch(.800 .182 152)` |
| late | expired | `Atrasada / Atrasada Nd` | red `oklch(.577 .215 27)` -> `oklch(.711 .166 22)` |
| soon | due <= 3d | `Vence hoje/amanha/em Nd` | gold `oklch(.681 .142 76)` -> `oklch(.837 .164 84)` |
| coming | open, > 3d | `Vence em Nd` | warm neutral `oklch(.450 .011 78)` -> `oklch(.800 .008 80)` |
| none | no deadline | `Sem prazo` | warm neutral `oklch(.526 .011 78.2)` -> `oklch(.714 .011 81.8)` |

Each tone exposes `--{tone}-bg` (`color-mix` 13-18%). `TONE_CLS` in `lib/status.ts` maps tone -> pill
classes. Status is **never color-only** (icon + label always). `coming` and `none` are gray on
purpose: open work should not compete with the red/gold urgency signals. `soon` uses gold for the
border, fill and icon but **foreground ink for its label**, so the dark gold never reads brown and
the text keeps its contrast.

### 3.4 Charts

`--chart-1..5` = brand blue -> brand-2 blue -> ok -> soon -> none. Progresso view uses a neutral
type ramp plus these tokens for module/type bars.

### 3.5 Identity color economy (v4.1)

**Status owns hue · type is monochrome · subject owns a warm neutral step · professor is neutral.**
The old 12-hue subject palette is retired; it made a reading-focused app feel louder than its
content. A warm grayscale ramp keeps cards calm while the monogram/domain icon carries recognition.

| Dimension | Encoding | Where |
|---|---|---|
| Status | semantic tone + icon + label | `TONE_CLS` / `StatusBadge` |
| Type | icon + label, monochrome (`border-border bg-muted/40 text-muted-foreground`) | `KIND_META.badgeClass`, `ActivityBadge` |
| Activity state | combined `type · state` badge (`Tarefa · Sem pergunta`); monochrome normally, **outline** red/yellow for anomalies - never filled | `lib/kind.ts::activityBadge`, `ActivityBadge` |
| Subject (module) | `--subject-1..12` neutral ramp + monogram/domain icon | `lib/subject.ts`, `lib/subject-colors.tsx`, `.subject-avatar` |
| Professor | neutral initials avatar, never colored | `lib/prof.ts`, `ProfessorTag` |

Subject ramp (tokens in `index.css`; no raw color in TSX):

| Token | Light | Dark |
|---|---|---|
| `--subject-1..12` | `oklch(.240 .004 70)` -> `oklch(.500 .004 70)` in 12 steps | `oklch(.640 .004 70)` -> `oklch(.900 .004 70)` in 12 steps |

A module maps to a slot deterministically (FNV-1a `subjectIndex`, with an optional pin map). Because
a bare hash can collide, `SubjectColorProvider` (`lib/subject-colors.tsx`) resolves the whole visible
module set through `assignSubjectIndices`, which keeps the hash as a starting point and probes
forward so every module gets a distinct step. Components read it via `useSubjectStyle` /
`useSubjectColorMap`, falling back to the hash outside a provider. The monogram is the leading anchor
of every activity card; the module name repeats the step as text (`SubjectLabel`). Light-mode steps
are capped at L `.50` so the 11px label stays above 4.5:1 contrast.

## 4. Typography

Self-hosted via `@fontsource-variable/*` (no runtime Google Fonts):

| Use | Font | Token |
|---|---|---|
| Display / headings / wordmark | **Inter Variable** | `font-heading` |
| Body / UI | **Inter Variable** (tabular numerals via `tabular-nums` for deadlines/counts) | `font-sans` |
| Data accents (countdowns, counts, matricula, version chips) | **JetBrains Mono Variable** | `font-mono` |

- Body baseline `text-sm` (14px); meta `text-xs`/`text-[11px]`; page hero `text-2xl-3xl font-heading`.
- Multi-line headings use `text-balance`.
- Fraunces is retired; headings now use the same geometric sans as Grok for a neutral, product-like
  voice. JetBrains Mono remains for the technical/data texture.

## 5. Shape, elevation, motion

- `--radius: 0.75rem`; cards `rounded-xl`; pills `rounded-full`; primitives derive `radius-sm..4xl`.
- Elevation: borders first; shadows soft and rare (`shadow-md` on brand tile only).
- Motion tokens (restrained):
  - Durations: `120ms` (micro) / `200ms` (default) / `320ms` (overlays)
  - Easing: `--ease-soft: cubic-bezier(.22, 1, .36, 1)` -> `ease-soft` utility
  - Motion confirms actions, never decorates. `prefers-reduced-motion` respected via `tw-animate-css`.

## 6. Icon mapping (lucide-react)

| Context | Icon |
|---|---|
| Brand mark | "Stacked X" tile (`BrandMark`; mirrors `favicon.svg`) |
| Nav - Agora | `Sunrise` |
| Nav - Tarefas | `ListChecks` |
| Nav - Progresso | `ChartColumn` |
| Nav - Ajustes | `SlidersHorizontal` |
| Nav - Notificacoes | `BellRing` |
| Nav - Treino de quiz | `GraduationCap` |
| Nav - Perguntar a IA | `Sparkles` |
| Nav - Resumo | `NotebookText` |
| Command palette | `Command` |
| Theme toggle | `Sun` / `Moon` |
| Activity type - quiz | `ListChecks` (monochrome chip) |
| Activity type - upload | `Upload` (monochrome chip) |
| Activity type - mark | `CircleCheckBig` (monochrome chip) |
| Activity type - other | `MessagesSquare` (monochrome chip) |
| Focus mode | `Maximize2` / `Minimize2` |

**Exception - send-flow icon set.** The send-confirmation modal does not use lucide. It draws from
one custom duotone family in `components/icons/send-icons.tsx` (24px grid, 1.5 stroke, round
caps/joins, `currentColor` + `fillOpacity .12` on body shapes): submit, warning, text / `.txt` /
`.pdf`, preview, download, close, check, spinner. Every other surface stays lucide.

**Exception - notification channel marks.** Ajustes -> Notificacoes uses inline monochrome brand
marks in `components/icons/notification-icons.tsx`: the Discord logo (filled `currentColor`) and a
bell mark for Bark. They follow the same `size-4`/`size-5` contract as lucide icons and never carry
their brand colors.

## 7. Subject identity & neutral professors

`SubjectAvatar` + `lib/subject.ts` + `lib/subject-colors.tsx` + `lib/subject-icon.ts`:
deterministic identity per **module** (the only per-card neutral, see 3.5). Color comes from the
`--subject-1..12` theme tokens, resolved collision-free per module set, so there is no raw color in
TSX. The tile shows a domain pictogram derived automatically from the module name
(`subjectIcon`, accent-insensitive whole-phrase keywords; e.g. "Banco de Dados" -> `Database`,
"Arquitetura de Software" -> `Network`), falling back to the 2-letter monogram (`subjectInitials`)
when nothing matches. A small monochrome type icon sits in the corner as a badge. `SubjectLabel`
repeats the neutral step on the module name.

`SubjectAvatar` also accepts an optional `imageUrl` - the professor's photo from the hardcoded
organization directory or a per-professor override (Ajustes -> Organizacao). When present it fills
the tile (`object-cover`) while the neutral subject frame and the type badge stay; a broken/failed
image falls back to the pictogram, then the monogram.

`ProfessorTag` + `lib/prof.ts`: professors are secondary identity. A neutral initials avatar + name
(optionally the configured photo), never a competing color. The sidebar "Professores" list uses the
same neutral treatment.

## 8. IA (information architecture) - 8 routes

| Route | Page | Content |
|---|---|---|
| `/` | **Agora** | combined status line (merged done/late/open bar + overall ring, disclosing per-module bars), greeting, next-task hero with live countdown, urgency-grouped open queue |
| `/tarefas` | **Tarefas** | scope tabs (Abertas/Atrasadas/Concluidas/Todas) + module/type chips + list |
| `/progresso` | **Progresso** | per-module progress bars, status/type distribution (CSS bars, `chart-*` tokens) |
| `/tarefa/:id` | **Atividade** | reading column (prose width) + sticky workbench; focus mode; version timeline; send-confirmation modal |
| `/treino/quiz` | **Treino de quiz** | gamified practice quiz (AI-generated or portal-sourced), one question at a time with feedback, score + readiness verdict + history |
| `/treino/estudo` | **Perguntar a IA** | free-text study Q&A scoped to the selected subject; streamed markdown |
| `/treino/resumo` | **Resumo** | saved AI study summary of a subject (PDFs + readings + quiz bank): key topics + likely exam questions, streamed and regenerable |
| `/ajustes` | **Ajustes** | hub with pill tabs (Pessoal / Notificacoes / IA / Provas / Avancado / Organizacao): profile + appearance, Discord/Bark alerts, IA voice/format/rules/content, exam phases (dates + subject->exam mapping), generation params + preview, institution + professor directory |

Global: **Cmd-K / Ctrl+K command palette** - navigate, jump to any tarefa, filter by module, toggle
theme, refresh content.

State shared across routes (scope, module/type filter) lives in `lib/app-state.tsx`.

**Training pattern.** Both Treino routes share `TrainingSubjectPicker` + `lib/training-state.tsx`
(persisted course/module = the "switch the data" that scopes the AI's knowledge pack). The pack is
built server-side from Postgres - catalog + question bank + the **precomputed `content_text`**
(material extracted once at index time, since the portal exposes very few quizzes and reading
`html` is empty). Quiz practice is **material-first**: `ai` writes new questions from the material;
`mixed` uses the real portal questions that exist and fills the rest with AI (never errors when a
module has none). It is gamified: one question at a time, immediate correct/wrong reveal with
rationale, then a score ring and a 3-tier **self-check** verdict (`lib/training.ts`); sessions and
scores persist in Postgres (`training_quiz`/`training_question`/`training_answer`). Ask AI is
free-text and streams markdown.

**Provas pattern (v3.6).** All three study surfaces (Resumo, Treino de quiz, Perguntar a IA) share a
**Prova** selector (`ExamPicker`, `components/exams.tsx`): `Tudo` plus the course's exam phases
(AVD1/AVD2/Sub). Phases are defined by a manual **end date** (inline editor + Ajustes -> Provas),
because most material (PDFs/readings) has no per-item date. `exams.ts` classifies each content item
(manual override -> keyword "1o/2o Bimestre" -> gradebook category -> deadline -> sibling majority;
neutral is always included) and `buildSubjectContext` drops material from earlier exams - so the
second exam never re-sends the first exam's content. Unclassified items default to neutral and are
surfaced with a bulk-assign action in Ajustes.

**Resumo pattern (v3.7).** The Resumo page has a **size control** (Pequeno / Medio / Grande / Extra)
and keeps one saved summary **per size** per scope; the prompt and final `max_tokens` scale with the
size. It also shows **transparency**: an "Itens usados" disclosure (`SummarySources`) lists every
source item grouped by subject -> section with a monochrome kind icon, attachment names and question
counts, plus a kind breakdown. A `GET /api/summary/items` preview shows the same list before
generating. Download is **PDF** (`POST /api/summary/pdf` -> `answerToPdf`, LibreOffice-backed with a
built-in renderer fallback).

**Agora progress pattern.** `ProgressSummary` is the page's top line: a single segmented bar
(`ok`/`late`/`coming`) with the overall `ProgressRing` on the right, a labelled legend, and a
chevron disclosure that expands to one stacked bar per module. The disclosure state persists
(`lxp.agora.progress.modules`). The ring is the percentage, the bar is the composition - they share
one row and are never redundant. The whole card is a click target (module rows stop propagation and
filter `/tarefas`). On expand the merged bar shrinks to a stub while the ring grows (`ease-soft`,
500ms) and the module list reveals via a `0fr -> 1fr` grid; module rows are `tabIndex -1` and the
panel `aria-hidden` while collapsed.

## 9. Component contract (vibecoding rules)

1. **Tokens-first.** Zero raw hex/oklch in TSX - semantic utilities only (`bg-primary`,
   `text-muted-foreground`, ...). Identity comes from the `--subject-*` tokens via
   `lib/subject.ts` (3.5, 7).
2. **Primitives** live only in `components/ui/` (shadcn `base-nova` style). Semantic components
   compose them; pages never restyle primitives ad hoc.
3. **States matrix.** Every interactive component documents/handles:
   hover / focus-visible / active / disabled / loading / empty / error.
4. **Copy** in pt-BR, co-pilot framing (1). New strings follow the voice rules.
5. **Pipeline per phase:** DESIGN.md -> tokens -> primitives -> semantic components -> pages ->
   `npm run typecheck`.
6. Both themes are first-class: every new surface is checked in light **and** dark.

## 10. Theme mechanism

- `<html lang="pt-BR">` (no hardcoded class) + inline no-flash script resolving `pauta-theme`
  (`light` / `dark` / `system`, default `system`) before first paint. `pauta-theme` / `pauta-lang`
  are **legacy storage keys kept on purpose** so existing users do not lose their theme/language.
- `lib/theme.tsx` - `ThemeProvider` + `useTheme()`; header icon toggle (light<->dark);
  system preference changes tracked while in `system` mode.

## 11. Accessibility

- Status rendered as colored pill **+ icon + label** (never color-only).
- Icon-only buttons carry `aria-label` (theme toggle, refresh, palette, focus mode).
- Visible focus (`outline-ring/50`, `ring-ring/50`); `prefers-reduced-motion` respected.
- Contrast: `--primary-foreground` on `--primary` >= 4.5:1 in both themes (paper-on-ink in light,
  ink-on-paper in dark). Muted text, blue links (`#0B6FD8` light / `#4B9BFF` dark) and subject
  labels also stay >= 4.5:1.
- `lang="pt-BR"` set in `index.html`.

## History

- **v4.1 (2026-10):** Grok warm-black pass - layered `#131211` / `#181716` / `#201F1D` / `#23211F`
  dark surfaces, warm paper light surfaces, warm-neutral subject ramp, and Grok blue `#1084FE` for
  focus/selection/links/icons. Primary buttons stay ink/paper.
- **v4 (2026-10):** Mono skin - Grok-inspired black/white chrome, neutral grayscale subject ramp,
  Inter display (Fraunces retired), status-only hue (ok/late/soon + neutral coming/none). Retired
  Folio warm paper, sienna brand, and warm espresso dark mode.
- **v3.5 (2026-09):** always-on `ActivityBadge` (`type · state`) with a generalized anomaly model
  (`ghost`/`print` today); anomalies tint the chip via outline red/yellow (bounded 3.5 exception).
  Replaces the standalone `TypeBadge`/`FlavorBadge`.
- **v3.4 (2026-09):** subject palette widened to 12 clearly distinct hues (adjacent slots ~150deg
  apart) and made collision-free: `SubjectColorProvider` assigns each module a unique slot for the
  visible set, so modules that used to share a color no longer do.
- **v3.3 (2026-09):** subject tiles show an automatic domain pictogram (`lib/subject-icon.ts`,
  monogram fallback); professor photos come from a hardcoded organization directory
  (`apps/server/config/organizations.json`) or a per-professor LinkedIn override, loaded by the
  browser straight from unavatar (no server download/cache), shown on the subject tile and
  `ProfessorTag`; managed in Ajustes -> Organizacao and the card ... menu.
- **v3.2 (2026-09):** send modal decluttered to a minimal confirm (title + one warning line + one
  action line); format becomes a segmented control; all modal icons replaced by the custom duotone
  `send-icons` family.
- **v3.1 (2026-09):** send flow moved from an inline block to a centered confirmation modal
  (Base UI `Dialog`); checkbox dropped for a single explicit CTA; custom submission-format icon
  family added.
- **v3 (2026-09):** rebrand **Pauta -> LXP Toolkit** ("Stacked X" mark); identity color economy
  (status = semantic, type = monochrome icon, subject = `--subject-1..12` identity, professor =
  neutral); activity cards reworked around the subject monogram; raw-hex exception retired.
- **v2.1 (2026-09):** contrast pass - dark surfaces dropped to near-black (L .165), foreground
  raised to .95, all accent/status chroma lifted (+20-40%) so nothing reads grey; light-mode ink
  darkened to match. Brand and semantics unchanged.
- **v2 (2026-09):** full rebrand to "Folio" (warm paper / sienna / Fraunces-Inter-JetBrains Mono),
  product named **Pauta** (by LXP ToolKit), light+dark day one, motion tokens, command palette,
  6-route IA, /design showcase. Retired: crimson-on-ink skin, Poppins/Lato, dark-only hardcode.
- v1 (2026-09-05): Grupoa crimson skin spec (removed).
