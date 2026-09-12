# LXP Homework — Design System (Grupoa crimson skin)

Design specification for `assistant/web/` (the assistant's React dashboard, `npm run web` from
`assistant/`). This is the **skin**: brand, tokens, typography, icons, and component spec.
Implementation order lives in [`PLAN.md`](PLAN.md).

This document is the adapted successor of the removed `web/DESIGN.md` (legacy LXP dashboard). The
old spec was written against the legacy `web/` codebase; this one is re-mapped onto the assistant's
actual structure. See [history](#history) at the bottom.

## 1. Goals

- Give the assistant web the same visual identity the old legacy dashboard was building toward:
  the **Grupoa / +A Educação** platform skin, **crimson** on ink.
- Keep the existing shadcn/Base-UI + Tailwind v4 + `lucide-react` foundation (already token-driven).
- Ship **dark-first** (the app is currently `<html class="dark">`); a light theme + manual toggle is
  a documented follow-up (PLAN.md Phase 7), with tokens already defined for it.

## 2. Brand reference

Sourced from `grupoa.com.br` / `maisaedu.com.br` (HubSpot theme) on 2026-09-05, carried over from
the legacy DESIGN.md.

| Source | Value | Use |
|---|---|---|
| Edtech tag | `#BB243E` | **Primary** crimson |
| Saúde tag | `#00A0A6` | **Secondary** teal |
| Section bg | `rgb(15,23,29)` | Ink `#0F171D` (dark surface) |
| Section bg | `rgb(27,39,49)` | Ink-2 `#1B2731` (raised dark surface) |
| Light bg | `rgb(228,233,237)` | Light surface `#E4E9ED` |
| Fonts | Poppins + Lato | Headings + body |

## 3. Color tokens

All decisions live in `src/index.css` under `:root` (light) and `.dark` (shipped). Tailwind
utilities are generated from the `@theme inline` block (`bg-brand`, `text-ok`, `bg-ok-bg`, …).
The app ships dark; light values are pre-defined for the follow-up toggle.

### 3.1 Brand / semantic accents

| Token | Light | Dark | Role |
|---|---|---|---|
| `--brand` | `#BB243E` | `#E05570` | crimson accent — links, small text on tint, focus |
| `--brand-2` | `#C93B57` | `#F07C94` | lighter crimson hover/edge |
| `--primary` | `#BB243E` | `#C43351` | filled CTA / button / active nav / logo tile (white text, ≥ 4.5:1) |
| `--teal` | `#00A0A6` | `#2FD3D9` | teal — quiz-type chip, secondary accent |
| `--ok` | `#1F7A33` | `#34A853` | done / quiz-complete |
| `--late` | `#BB243E` | `#E05570` | expired / destructive (reuses brand red) |
| `--soon` | `#C9820A` | `#E8A33D` | due soon (≤ 3 days) |
| `--coming` | `#00A0A6` | `#2FD3D9` | open with a deadline in > 3 days |
| `--none` | `#6B7280` | `#9AA4B0` | neutral / no-deadline |

Each status token also exposes a `*-bg` (`--ok-bg`, `--late-bg`, …) derived via
`color-mix(in oklab, <token> 14–20%, transparent)` for tinted badge/pill fills. `--brand-bg` and
`--teal-bg` follow the same pattern.

> Deviation from the legacy doc: `--none` was darkened (`#6B7280` light / `#9AA4B0` dark) so the
> "sem prazo" text keeps ~4.5:1 contrast; legacy `#ADAAA9`/`#8A8786` was too faint.

### 3.2 Surfaces & text

| Token | Light | Dark |
|---|---|---|
| `--background` | `#F8F9FB` | `#0F171D` ink |
| `--foreground` | `#0F171D` | `#E6EBEF` |
| `--card` / `--card-foreground` | `#FFFFFF` / `#0F171D` | `#1B2731` / `#E6EBEF` |
| `--popover` / `-foreground` | `#FFFFFF` / `#0F171D` | `#1B2731` / `#E6EBEF` |
| `--secondary` / `-foreground` | `#E4E9ED` / `#0F171D` | `#24323E` / `#E6EBEF` |
| `--muted` / `--muted-foreground` | `#EEF1F5` / `#5A6B7A` | `#24323E` / `#9FB0BF` |
| `--accent` / `-foreground` | `#E4E9ED` / `#0F171D` | `#24323E` / `#E6EBEF` |
| `--border` | `#D8DEE5` | `rgb(255 255 255 / 10%)` |
| `--input` | `#D8DEE5` | `rgb(255 255 255 / 14%)` |
| `--ring` | `#BB243E` | `#E05570` |
| `--destructive` | `#BB243E` | `#E05570` |
| `--sidebar` | `#FFFFFF` | `#1B2731` (floating inset panel) |

`--chart-1..5` = brand → teal → ok → soon → none (reserved for future charts). Professor chips use
their own deterministic accents (see [§6.1](#61-professor-accent-chips)).

## 4. Typography

- **Headings / display:** Poppins (400/500/600/700) → `font-heading`
- **Body:** Lato (400/700) → `font-sans`
- Both self-hosted via `@fontsource/*` latin subsets (no runtime Google Fonts).
- Apply `font-heading` to page/card titles and the brand wordmark; everything else is Lato.
- Body `text-sm` (14px) baseline; `text-xs` (12px) meta; `text-xl` for the activity title.
- Headings use `text-wrap: balance` where multi-line (activity title).

## 5. Spacing & radius

- Tailwind 4px scale (`gap-*`, `space-y-*`). Cards `p-4`/`p-5`; list gap `gap-2`/`gap-4`.
- Radius: `--radius: 0.625rem` (10px). Cards `rounded-lg`; pills/badges `rounded-full`.

## 6. Status → tone mapping

`deadlineInfo()` in `src/lib/status.ts` derives label + tone; `TONE_CLS` maps tone → colored pill.

| Tone | State | Label (pt-BR) | Token |
|---|---|---|---|
| ok | done | `Concluída` | `--ok` |
| late | expired | `Atrasada` / `Atrasada Nd` | `--late` |
| soon | due today/tomorrow or ≤ 3d | `Vence hoje` / `Vence amanhã` / `Vence em Nd` | `--soon` |
| coming | open, due in > 3d | `Vence em Nd` | `--coming` (teal) |
| none | open, no deadline | `Sem prazo` | `--none` |

### 6.1 Professor accent chips

`AccChips` (`src/components/prof-chip.tsx`) renders per-professor + module chips. Colors are
deterministic per professor (`src/lib/prof.ts`), spread across the wheel so course professors stay
distinguishable — deliberately independent from the brand palette.

## 7. Icon mapping (lucide-react)

Activity type metadata (label, icon, classes, capabilities) lives in `src/lib/kind.ts`
(`KIND_META`), keyed by the four action buckets `quiz | upload | mark | other`.

| Context | lucide icon |
|---|---|
| Activity type — quiz | `ListChecks` (teal chip) |
| Activity type — upload | `Upload` (crimson chip) |
| Activity type — mark as completed | `CircleCheckBig` (green chip) |
| Activity type — other (forum) | `MessagesSquare` (neutral chip) |
| "Próxima" hero | `Target` |
| Brand mark (sidebar) | `GraduationCap` |
| Sidebar nav | `Clock3` / `CircleAlert` / `CheckCircle2` / `ListChecks` |
| Attached file row | `Paperclip` |
| Refresh | `RefreshCw` |

## 8. Component inventory

| Component | File | Role |
|---|---|---|
| `AppSidebar` | `components/app-sidebar.tsx` | inset nav: brand tile + wordmark, scope menu w/ counts, professor legend, Perfil & IA entry |
| `NextCard` | `components/section-cards.tsx` | hero: next assignment + deadline (clickable → detail) |
| `StatCards` | `components/section-cards.tsx` | open / expired / done counters with tone dots |
| `ActivityCard` | `components/activity-card.tsx` | list row: title, professor/module chips, type + status badges, quick-action overflow menu (mark-complete for `mark`) |
| `DashboardPage` | `pages/dashboard.tsx` | route `/` — hero, KPIs, module + type filter chips, scoped list |
| `ExercisePage` | `pages/exercise.tsx` | route `/tarefa/:id` — full detail; workbench varies by type (answer for quiz/upload, `MarkPanel` for mark, portal link for other) |
| `MarkPanel` / `PortalOnlyPanel` | `components/mark-panel.tsx` | right-column completion panel for `mark` items; read-only portal panel for `other` |
| `AiRequestPanel` | `components/ai-request-panel.tsx` | "O que a IA recebe": free-text extra instructions for this activity + compiled system/user preview |
| `AiSettingsDialog` | `components/ai-settings-dialog.tsx` | sheet: profile nome/matrícula (link to IA Ajustes) |
| `TypeBadge` / `StatusBadge` | `components/status-badges.tsx` | type chip (quiz/upload/mark/other) and tone pill |
| `lib/kind.ts` | `lib/kind.ts` | `KIND_META`: labels, icons, classes and capabilities per action bucket |
| `AccChips` | `components/prof-chip.tsx` | per-professor accent chips |
| `AppProviders` | `lib/app-state.tsx` | data + scope context shared by shell/pages |

shadcn primitives live under `components/ui/`.

## 9. Layout

- Sticky header (h-14, `backdrop-blur`): sidebar trigger, title ("Minhas tarefas" / "Atividade" +
  exercise title), model chip, Perfil & IA, refresh.
- **Dashboard** (`/`): `NextCard` + `StatCards` hero, module chips, then a responsive list of
  `ActivityCard` rows (cards navigate to the exercise detail route).
- **Exercise detail** (`/tarefa/:id`): two-column grid (`xl:grid-cols-[7fr_5fr]`) — left is the
  content (header card, enunciado, arquivos, questões, `AiRequestPanel`); right is a sticky
  answer workbench (`AnswerPanel`).
- Scope/module selection lives in `lib/app-state.tsx` so sidebar and dashboard stay in sync across
  routes.

## 10. Copy

All UI copy is already pt-BR (`Concluída`, `Atrasada`, `Vence em Nd`, `Sem prazo`, `Próxima`,
`Questões (N)`, `O que a IA recebe`, `Resposta`, `Gerar com IA`, `Perfil & IA`, `Histórico`,
…). Keep new strings in pt-BR.

## 11. Accessibility

- Status always rendered as **colored pill + text label** (never color-only).
- Icon-only buttons carry `title`/`aria-label` (theme toggle when added, refresh).
- Visible focus ring (`outline-ring/50`), `prefers-reduced-motion` respected via `tw-animate-css`.
- `primary-foreground` (white) on `primary` keeps ≥ 4.5:1 in both themes.
- `lang="pt-BR"` already set in `index.html`.

## 12. Theme mechanism

- Current: `<html lang="pt-BR" class="dark">` in `index.html` — the app is dark-first.
- Follow-up (PLAN Phase 7): inline no-flash script + `Sun`/`Moon` toggle writing `lxp-theme`,
  falling back to `prefers-color-scheme`. All color decisions are CSS vars; components reference
  Tailwind semantic utilities only, so the toggle is a pure CSS/`index.html` change.

## History

Adapted 2026-09-05 from the deleted legacy `web/DESIGN.md` (commit `9e739cf`, removed in
`b2c6dce`). Key changes: component names re-mapped to `assistant/web`; status tone set adapted from
the legacy 6-state model to the assistant's `deadlineInfo` 5-tone model; surfaces/`--primary` chosen
for contrast with white text; app ships dark-only.
