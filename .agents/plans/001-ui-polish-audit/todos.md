# UI Polish Audit Todos

## Findings

- [ ] Finding 1: Screenshot baseline is not trustworthy.
  - [ ] Choose resolution option.
  - [ ] Regenerate real desktop/tablet/mobile screenshots.
  - [ ] Confirm no capture overlays or duplicate sticky artifacts pollute baseline.
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
- [ ] Finding 4: Button hierarchy is incoherent.
  - [ ] Choose resolution option (recommended: Option 2 — normalize shared variants).
  - [ ] Audit existing button usage across routes.
  - [ ] Replace route-level inline CTA styling (e.g. `UnifiedPlanInput` submit) with shared variants.
- [ ] Finding 5: App layout wastes space.
  - [ ] Choose resolution option (recommended: Option 2 — define layout grid rules).
  - [ ] Define product page spacing/grid rules (header height, section gap, content max-width).
  - [ ] Apply to dashboard, plans, settings, and analytics.
- [ ] Finding 6: Typography scale is uneven.
  - [ ] Choose resolution option (recommended: Option 3 primary — shared `PageHeader` enforces existing scales).
  - [ ] Build shared `PageHeader` to own title/subtitle sizing.
  - [ ] Review/refine existing type scales in `globals.css` (already defined, minor pass).
  - [ ] Fix Settings page inline `text-3xl font-bold` override.
- [ ] Finding 7: Locked and coming-soon states have weak contrast.
  - [ ] Choose resolution option (recommended: Option 2 — extract locked card + restyle `ComingSoonAlert`).
  - [ ] Extract duplicated locked card pattern (usage + achievements) into `LockedFeatureCard`.
  - [ ] Restyle existing `ComingSoonAlert` for product context (strip marketing glass).
  - [ ] Raise text contrast: replace `opacity-50` with readable alternative.
- [ ] Finding 8: Navigation is unclear.
  - [ ] Choose resolution option (recommended: Options 1+2 — fix tablet breakpoint + add labels).
  - [ ] Extend visible nav links down to `md` breakpoint (768px) to close tablet hamburger gap.
  - [ ] Add tooltips/labels to icon buttons and normalize sizing.
  - [ ] Let F2's layout separation handle nav visual style.
- [ ] Finding 9: Auth screens are clean but generic.
  - [ ] Choose resolution option (recommended: Option 2 — product-styled auth wrapper).
  - [ ] Wrap `AuthView` in product-styled container (replace generic centering).
  - [ ] Check NeonAuth customization APIs for copy/theme hooks.
- [ ] Finding 10: Create-plan page feels clever but not serious enough.
  - [ ] Choose resolution option (recommended: Option 2 — cleaner product panel).
  - [ ] Strip marketing chrome: glassmorphism, gradient glow, `MouseGlow.tsx`.
  - [ ] Switch submit button to shared `cta` variant (remove inline custom classes).
  - [ ] Strengthen disabled CTA contrast.

## Cross-Cutting Decisions

- [ ] Decide whether app shell uses sidebar-first desktop navigation or visible top navigation (current: visible top nav at lg+; F8 recommends extending to md+).
- [ ] Decide whether pricing remains marketing-styled or moves closer to product-styled billing.
- [ ] Decide whether landing/about visual style stays expressive after product shell cleanup.
- [ ] Decide visual baseline storage and naming convention.

## Validation

- [ ] Capture fresh screenshots after cleanup.
- [ ] Verify desktop/tablet/mobile dimensions differ.
- [ ] Review screenshots against each finding.
- [ ] Run targeted UI/accessibility checks for updated routes.
- [ ] Run `pnpm test:changed`.
- [ ] Run `pnpm check:full`.

## Review Notes

- 2026-04-27: Initial audit package created from `screenshots/frontend-baseline-2026-04-27/`. No UI implementation performed.
- 2026-04-27: Codebase verification pass. Corrected evidence/recommendations for F6 (type scales already exist — shifted to enforcement), F8 (desktop already has visible nav — corrected evidence, reduced recommendation scope), F9 (acknowledged third-party NeonAuth constraints), F10 (placeholder grammar is fine — corrected evidence). Updated F3 and F7 to acknowledge existing components (`Empty` family, `ComingSoonAlert`).
- 2026-04-27: Finding 2 implemented — route groups `(marketing)` / `(auth)` / `(app)` with `(marketing)/layout.tsx` (header + footer), `(auth)` + `(app)` layouts (header, no `SiteFooter`). Root [`src/app/layout.tsx`](src/app/layout.tsx) providers-only. URLs unchanged. Import aliases updated to `@/app/(…)/*`. Validation: `pnpm test:changed`, `pnpm check:full` pass. Local `pnpm check:type` needed `rm -rf .next` once to drop stale `.next/dev/types/validator.ts` paths after the move.
- 2026-04-27: Finding 3 implemented — `globals.css` panel/warning/disabled tokens; `PageShell`, `PageHeader`, `Surface`, `MetricCard` in `src/components/ui/`; app pages + dashboard/plan module surfaces migrated; `Badge` `product` variant, default `outline` for app drift reduction; `docs/styles/style-guide.md` product-surface section.
