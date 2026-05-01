# UI Polish Audit Todos

## Findings

- [x] Finding 1: Screenshot baseline is not trustworthy.
  - [x] Choose resolution option (Option 2 — fixed viewports 1440×1000 / 834×1112 / 390×844; `viewport` + `fullPage` variants; `manifest.json` + dimension checks).
  - [x] Regenerate real desktop/tablet/mobile screenshots — `screenshots/frontend-baseline-2026-04-27/` + `manifest.json` (2026-04-27; `pnpm ui:capture-baseline -- --out=screenshots/frontend-baseline-2026-04-27`; gitignored).
  - [x] Confirm no capture overlays or duplicate sticky artifacts pollute baseline (manual review of PNGs).
- [x] Finding 2: Marketing chrome leaks into product app.
  - [x] Choose resolution option (recommended: Option 3 — route group layout separation).
  - [x] Split route groups into `MarketingLayout`, `AuthLayout`, and `AppLayout`.
  - [x] Move `SiteHeader`/`SiteFooter` out of root layout; keep providers in root.
  - [x] Remove marketing footer from authenticated app routes.
- [x] Finding 3: Visual system is too soft and inconsistent.
  - [x] Choose resolution option (Options 2+3 — extend existing tokens + add primitives). Scope: `src/app/(app)/**` only; no legacy `src/app/dashboard` route tree.
  - [x] Extend existing token foundation with product-surface tokens (panel, disabled, warning).
  - [x] Add shared `PageShell`, `PageHeader`, `Surface`, `MetricCard` primitives (complement existing `Empty` family).
  - [x] Migrate product pages to new primitives (dashboard, analytics, settings index, plans list; high-drift surfaces in plan detail/module; badge product variant + style guide).
- [x] Finding 4: Button hierarchy is incoherent.
  - [x] Choose resolution option (Option 2 — normalize shared variants).
  - [x] Audit existing button usage across routes.
  - [x] Replace route-level inline CTA styling (e.g. `UnifiedPlanInput` submit) with shared variants.
- [x] Finding 5: App layout wastes space.
  - [x] Choose resolution option (recommended: Option 2 — define layout grid rules).
  - [x] Define product page spacing/grid rules (header height, section gap, content max-width).
  - [x] Apply to dashboard, plans, settings, and analytics.
- [x] Finding 6: Typography scale is uneven.
  - [x] Choose resolution option (recommended: Option 3 primary — shared `PageHeader` enforces existing scales).
  - [x] Build shared `PageHeader` to own title/subtitle sizing.
  - [x] Review/refine existing type scales in `globals.css` (already defined, minor pass).
  - [x] Fix Settings page inline `text-3xl font-bold` override.
- [x] Finding 7: Locked and coming-soon states have weak contrast.
  - [x] Choose resolution option (recommended: Option 2 — extract locked card + restyle `ComingSoonAlert`).
  - [x] Extract duplicated locked card pattern (usage + achievements) into `LockedFeatureCard`.
  - [x] Restyle existing `ComingSoonAlert` for product context (strip marketing glass).
  - [x] Raise text contrast: replace `opacity-50` with readable alternative.
- [x] Finding 8: Navigation is unclear.
  - [x] Choose resolution option (recommended: Options 1+2 — fix tablet breakpoint + add labels).
  - [x] Extend visible nav links down to `md` breakpoint (768px) to close tablet hamburger gap.
  - [x] Add tooltips/labels to icon buttons and normalize sizing.
  - [x] Let F2's layout separation handle nav visual style.
- [x] Finding 9: Auth screens are clean but generic.
  - [x] Choose resolution option (recommended: Option 2 — product-styled auth wrapper).
  - [x] Wrap `AuthView` in product-styled container (replace generic centering).
  - [x] Check NeonAuth customization APIs for copy/theme hooks (see review note — copy not changed).
- [x] Finding 10: Create-plan page feels clever but not serious enough.
  - [x] Choose resolution option (Option 2 — cleaner product panel).
  - [x] Strip marketing chrome: glassmorphism, gradient glow, `MouseGlow.tsx`.
  - [x] Switch submit button to shared `cta` variant (remove inline custom classes).
  - [x] Strengthen disabled CTA contrast.

## Cross-Cutting Decisions

- [x] Decide whether app shell uses sidebar-first desktop navigation or visible top navigation (current: visible top nav from `md` up; aligns with F8).
- [ ] Decide whether pricing remains marketing-styled or moves closer to product-styled billing.
- [ ] Decide whether landing/about visual style stays expressive after product shell cleanup.
- [x] Decide visual baseline storage and naming convention — **default** output dir `screenshots/frontend-baseline-<YYYY-MM-DD>/`, filenames `{route}--{anon|auth}--{desktop|tablet|mobile}--{viewport|fullPage}.png`, plus `manifest.json`; repo already gitignores `screenshots/`. Command: [`docs/testing/ui-baseline-capture.md`](../../../docs/testing/ui-baseline-capture.md).

## Validation

- [ ] Capture fresh screenshots after cleanup.
- [x] Verify desktop/tablet/mobile dimensions differ — enforced by `scripts/ui/capture-baseline.ts` (`validateViewportDimensionsDistinct` + viewport PNG size checks).
- [ ] Review screenshots against each finding.
- [ ] Run targeted UI/accessibility checks for updated routes.
- [ ] Run `pnpm test:changed`.
- [x] Run `pnpm check:full`.

## Review Notes

- 2026-04-27: Initial audit package created from `screenshots/frontend-baseline-2026-04-27/`. No UI implementation performed.
- 2026-04-27: Codebase verification pass. Corrected evidence/recommendations for F6 (type scales already exist — shifted to enforcement), F8 (desktop already has visible nav — corrected evidence, reduced recommendation scope), F9 (acknowledged third-party NeonAuth constraints), F10 (placeholder grammar is fine — corrected evidence). Updated F3 and F7 to acknowledge existing components (`Empty` family, `ComingSoonAlert`).
- 2026-04-27: Finding 2 implemented — route groups `(marketing)` / `(auth)` / `(app)` with `(marketing)/layout.tsx` (header + footer), `(auth)` + `(app)` layouts (header, no `SiteFooter`). Root [`src/app/layout.tsx`](src/app/layout.tsx) providers-only. URLs unchanged. Import aliases updated to `@/app/(…)/*`. Validation: `pnpm test:changed`, `pnpm check:full` pass. Local `pnpm check:type` needed `rm -rf .next` once to drop stale `.next/dev/types/validator.ts` paths after the move.
- 2026-04-27: Finding 3 implemented — `globals.css` panel/warning/disabled tokens; `PageShell`, `PageHeader`, `Surface`, `MetricCard` in `src/components/ui/`; app pages + dashboard/plan module surfaces migrated; `Badge` `product` variant, default `outline` for app drift reduction; `docs/styles/style-guide.md` product-surface section.
- 2026-04-27: Finding 1 baseline regenerated locally — `pnpm ui:capture-baseline -- --out=screenshots/frontend-baseline-2026-04-27` exit 0; manifest shows viewport widths **1440 / 834 / 390**. Fixes this session: smoke migrations via `node …/drizzle-kit/bin.cjs migrate` (PATH without `pnpm`); `fullPage` width allows ≤24px gutter vs viewport; screenshots use `scale: 'css'`.
- 2026-04-27: Finding 1 manual screenshot review completed after hiding Next dev indicator in `scripts/ui/capture-baseline.ts` (`nextjs-portal` / `data-nextjs-dev-tools-button` screenshot-only CSS). Re-ran `pnpm ui:capture-baseline -- --out=screenshots/frontend-baseline-2026-04-27` successfully; sampled landing/about long captures and product route captures show no dev overlay and no duplicated sticky/nav/hero artifact.
- 2026-04-27: Finding 4 implemented — `Button` now owns `cta`, `soft-primary`, `success`, and less washed-out disabled opacity; migrated high-signal app CTAs from inline `bg-primary`/`shadow-primary` link styles to shared variants (`UnifiedPlanInput`, dashboard resume/sidebar CTAs, module completion/error actions, timeline "View Full Module"). Validation: `pnpm exec vitest run --project unit tests/unit/app/plans/new/page.spec.tsx`, `pnpm check:lint:changed`, `pnpm check:type` pass. React Doctor via `pnpm dlx react-doctor@latest . --verbose --diff` scored 94/100; reported existing out-of-scope issues in ThemeToggle/model selector/RegenerateButton/MouseGlow/marketing metadata.
- 2026-04-27: Finding 9 — Auth route [`src/app/(auth)/auth/[path]/page.tsx`](src/app/(auth)/auth/[path]/page.tsx) wraps `AuthView` in shared `PageShell` + `Surface` (`max-w-md`, panel tokens); removed duplicate nested `<main>` (layout `(auth)/layout.tsx` already provides `<main>`). **Neon customization:** `@neondatabase/auth@0.2.0-beta.1` re-exports UI types from `@neondatabase/auth-ui`; typings are bundled/minified. Package exports suggest `NeonAuthUIProvider`-level hooks (`AuthLocalization`, `authLocalization`) and `AuthViewClassNames` — full string copy override not confirmed without auth-ui source/docs; no copy/theme changes in app. Root [`NeonAuthUIProvider`](src/app/layout.tsx) unchanged. Validation: `pnpm check:lint:changed` (warning: unused tooltip imports in `AuthControls.tsx` — pre-existing changed file, not this task), `pnpm check:type` pass; `pnpm dlx react-doctor@latest . --verbose --diff` → 94/100, no new auth-page diagnostics.
- 2026-04-27: Finding 8 implemented — `DesktopHeader` / `MobileHeader` breakpoint aligned at `md` (`md:grid` / `md:hidden`) so tablet sees inline nav; `DesktopNavigation` already `md:flex`. Added `@radix-ui/react-tooltip`, `src/components/ui/tooltip.tsx`, `TooltipProvider` in `ThemeProvider`. Icon-only controls: mobile menu (`MobileNavigation`), new-plan plus (`MobileHeader`), `ThemeToggle` (`withTooltip`), `AuthControls` account (`UserButton`) wrapped with tooltips; tier badge visibility `lg`→`md`; menu trigger normalized to `size="icon-sm"` vs adjacent icons. Validation: `pnpm check:lint:changed`, `pnpm check:type`, `pnpm dlx react-doctor@latest . --verbose --diff`.
- 2026-04-27: Finding 7 implemented — [`LockedFeatureCard`](../../../src/components/ui/locked-feature-card.tsx) (usage + achievements grids); [`ComingSoonAlert`](../../../src/components/shared/ComingSoonAlert.tsx) restyled with `Surface` `muted` + panel-bordered icon chip (no glass/glow); locked previews use `text-foreground` / `text-muted-foreground`, dashed card edge, lock glyph — removed whole-card `opacity-50`. Notifications page inherits alert styling automatically. Validation: `pnpm check:lint:changed`, `pnpm check:type`, `pnpm dlx react-doctor@latest . --verbose --diff` → **94/100** (same pre-existing diagnostics as F4 note; none in touched files).
- 2026-04-27: Finding 5 implemented in parent pass — `PageShell`/`PageHeader` spacing and page density tightened across dashboard, plans, settings, analytics. Parent validation: `pnpm exec vitest run --project unit tests/unit/components/ui/page-shell.spec.tsx tests/unit/components/ui/page-header.spec.tsx`, `pnpm check:lint:changed`, `pnpm check:type`, `pnpm dlx react-doctor@latest . --verbose --diff` pass; React Doctor remained 94/100 with existing out-of-scope findings.
- 2026-04-27: Finding 6 implemented — `PageHeader` now owns product title/subtitle typography via semantic product classes in `globals.css`; settings error boundaries use `PageHeader` instead of inline `text-3xl font-bold`; current search shows no remaining settings `text-3xl font-bold` override. Validation: `pnpm exec vitest run --project unit tests/unit/components/ui/page-header.spec.tsx`, `pnpm check:lint:changed`, `pnpm check:type` pass. React Doctor via `pnpm dlx react-doctor@latest . --verbose --diff` scored 94/100; remaining findings are existing out-of-scope issues in ThemeToggle/model selector/RegenerateButton/MouseGlow/marketing metadata.
- 2026-04-27: Finding 10 implemented — create-plan page stripped of marketing chrome. [`page.tsx`](../../../src/app/(app)/plans/new/page.tsx) drops `MouseGlowContainer`, fixed-inset gradient orbs, and `bg-linear-to-br` background; layout already supplies `PageShell`. [`UnifiedPlanInput.tsx`](../../../src/app/(app)/plans/new/components/plan-form/UnifiedPlanInput.tsx) now uses `Surface` panel (no `backdrop-blur-xl`, `shadow-2xl`, `rounded-3xl`, decorative gradient glow); Sparkles icon chip uses panel-tinted `bg-primary/10` border instead of `from-primary to-accent` gradient; submit `Button` uses shared `cta` variant + `size="lg"` (no inline `h-auto px-5 py-2.5` overrides); disabled state adds visible "Enter a learning goal to continue." hint wired via `aria-describedby` when topic is empty. [`CreatePlanPageClient.tsx`](../../../src/app/(app)/plans/new/components/CreatePlanPageClient.tsx) drops inline `text-3xl font-bold` + `gradient-text-symmetric` for `product-page-title`/`product-page-subtitle` semantic classes. Removed `MouseGlow.tsx` and `useMouseGlow.ts` (no remaining consumers). Validation: `pnpm exec vitest run --project unit tests/unit/app/plans/new/page.spec.tsx` (10 pass), `pnpm check:lint:changed`, `pnpm check:type` pass.
