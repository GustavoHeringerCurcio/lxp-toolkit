# LXP Homework — Crimson skin: refactor plan (ordered)

Apply the Grupoa crimson skin from [`DESIGN.md`](DESIGN.md) to `assistant/web/`. Adapted from the
deleted legacy `web/PLAN.md` — the assistant already has the full shadcn/Base-UI + Tailwind v4 +
`lucide-react` foundation the old plan was trying to replicate, so most "toolchain" phases are
already green. Data model (`types.ts`, `src/api.ts`, `server/`) is untouched.

Legend: `[x]` done · `[ ]` pending.

## Phase 0 — Baseline (already true)

- [x] `assistant/web` exists with Tailwind v4 + shadcn (base-nova/Base UI) + `lucide-react` +
      `cn` + `@` alias (`vite.config.ts`, `tsconfig.json`).
- [x] All colors flow through CSS vars in `src/index.css`; components use semantic utilities.
- [x] UI copy is pt-BR (`deadlineInfo`, labels, empty/error states).
- [x] Status tone model (`src/lib/status.ts`: `ok | late | soon | coming | none`).

## Phase 1 — Skin & docs (DONE this session)

- [x] `src/index.css` — Grupoa crimson tokens (light `:root` + dark `.dark`), ink surfaces, status
      `*-bg` tints, brand/teal tokens, chart palette.
- [x] Typography — Poppins (headings) + Lato (body) via `@fontsource/*` latin subsets; Geist removed.
- [x] `components.json` unchanged (already base-nova).
- [x] `index.html` — keep `lang="pt-BR" class="dark"`.
- [x] `DESIGN.md` + `PLAN.md` added under `assistant/web/`.

## Phase 2 — Component accents (DONE this session)

- [x] `status-badges.tsx` — `TypeBadge` off violet/sky onto **teal (Quiz) + neutral (Tarefa)** with
      `ListChecks`/`Upload` icons (no emojis).
- [x] `section-cards.tsx` — `NextCard` emoji → `Target` icon; Poppins on hero label + title.
- [x] `app-sidebar.tsx` — brand mark 🎓 → `GraduationCap`; Poppins wordmark.
- [x] `activity-detail.tsx` — question-index chip `bg-primary/20 text-primary` → `bg-brand/20
      text-brand` (legible crimson on ink); Poppins activity title; file row 📎 → `Paperclip`.
- [x] `App.tsx` — "Minhas tarefas" header in Poppins.

## Phase 3 — Verify dark ship

- [ ] `npm --prefix web run build` (Vite production build) green.
- [ ] `npx tsc -p web/tsconfig.json --noEmit` (Vite doesn't typecheck).
- [ ] `npm run web` (from `assistant/`) → `http://localhost:4174`:
  - dark renders with crimson brand, ink surfaces (`#0F171D` / `#1B2731`), teal quiz chips;
  - Poppins on titles, Lato body; no FOUT gaps beyond webfont load;
  - tone pills legible: Concluída (green) / Atrasada (crimson) / Vence em Nd (amber / teal) /
    Sem prazo (gray);
  - `/scraped/…` file links + `/api/export` still resolve.

## Phase 4 — Polish pass

- [ ] Review every leftover emoji in `src/`; replace remaining decorative glyphs with lucide.
- [ ] Add `font-heading` to any remaining display/headline text that still reads Lato (sidebar
      group labels, "Próxima" eyebrow if needed, stat numerals if wanted).
- [ ] Tune `--brand`/`--brand-2` hover states on buttons (crimson needs a perceptible darken).
- [ ] Re-check contrast of `--muted-foreground`, `--none` on both ink surfaces.

## Phase 5 — Light theme + toggle (follow-up, out of current dark-first scope)

- [ ] `index.html` — inline no-flash theme script (`localStorage["lxp-theme"]` →
      `prefers-color-scheme` fallback), remove hard-coded `class="dark"`.
- [ ] Header `Sun`/`Moon` toggle (lucide) next to refresh; icon-only with `aria-label`.
- [ ] Validate light `:root` tokens render correctly (surfaces `#F8F9FB`/white, crimson `#BB243E`
      primary, `--none #6B7280`).
- [ ] A11y pass in both themes (4.5:1 text, visible focus, `color-scheme` meta).

## Phase 6 — Docs & parity

- [ ] Update `assistant/README.md` "Web" section to mention the Grupoa crimson skin (optional).
- [ ] Cross-check this skin vs the removed legacy `web/` crimson dashboard (git `b2c6dce~1`) for
      any intended visual that did not carry over (status pill shapes, teal accents).

## Notes / risks

- The legacy `web/` tree (with its DESIGN.md/PLAN.md) was deleted in `b2c6dce`; recoverable any
  time via `git show 9e739cf:web/DESIGN.md` / `git show 9e739cf:web/PLAN.md`.
- shadcn "base-nova" uses `@base-ui/react` — do not regenerate `components/ui/`; keep vendored.
- `--primary` in dark is `#C43351` (not the lighter `#E05570` accent) so white text on filled
  controls keeps ≥ 4.5:1; use `--brand` for accent text/ring instead.
