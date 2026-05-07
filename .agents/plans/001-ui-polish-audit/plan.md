# UI Polish Audit Plan

Date: 2026-04-27

Source screenshots: `screenshots/frontend-baseline-2026-04-27/`

## Goal

Turn the current UI from "polished demo surfaces with inconsistent product screens" into a professional, uniform SaaS interface. The hard line: marketing pages can be expressive; authenticated product workflows need to feel operational, trustworthy, and repeatable.

## Scope

- Landing, about, pricing, auth, dashboard, plans, create-plan, analytics, and settings surfaces visible in the screenshot baseline.
- Visual system decisions that affect app-wide consistency: navigation shell, typography, cards, buttons, badges, layout density, color, radius, shadow, disabled states, and screenshot QA.

## Non-Goals

- No implementation in this audit package.
- No product feature changes unless required to clarify UI state.
- No broad rewrite of business logic.

## Finding 1: Screenshot Baseline Is Not Trustworthy

Evidence:
- `manifest.json` says mobile-prefixed screenshots reused the same in-app browser viewport.
- Mobile and desktop files share 827px width.
- Long captures for landing/about show repeated nav/hero sections, so the baseline may include sticky/capture artifacts or actual layout duplication.

Cost:
- Any responsive design decision made from this set is guesswork.
- Cleanup can chase screenshot artifacts instead of real UI defects.

Resolution options:

1. Minimal: fix capture script to use explicit desktop/tablet/mobile viewport sizes and regenerate the same route set.
2. Better: add a visual baseline command that captures `1440x1000`, `834x1112`, and `390x844`, with full-page and first-viewport variants.
3. Strong: add screenshot metadata checks that fail when mobile and desktop dimensions match or when extension overlays appear.
4. Heavy: adopt Playwright visual regression snapshots and keep approved images under a dedicated baseline folder.

Recommended first move:
- Option 2. Regenerate trustworthy evidence before touching UI. Current "mobile" evidence is fake; building from it is comfort work, not engineering.

## Finding 2: Marketing Chrome Leaks Into Product App

Evidence:
- Dashboard, plans, analytics, settings, and auth all use a floating glass top nav and marketing footer.
- Product pages inherit soft gradients, high shadows, and large blank vertical spaces.

Cost:
- The app feels like a landing page, not a tool users can trust for repeated work.

Resolution options:

1. Minimal: keep current nav but remove marketing footer from authenticated routes and reduce nav shadow/glass treatment.
2. Better: create an `AppShell` for authenticated pages with restrained top nav or sidebar, page header, content max width, and no marketing footer.
3. Strong: split route groups into `MarketingLayout`, `AuthLayout`, and `AppLayout`, each with explicit visual rules.
4. Heavy: redesign global navigation IA around a persistent desktop sidebar and bottom/mobile nav.

Recommended first move:
- Option 3. Layout separation is the clean boundary. Styling around the current shared chrome will keep leaking.

## Finding 3: Visual System Is Too Soft And Inconsistent

Evidence:
- Screens rely on glass cards, rounded pills, soft blue gradients, floating elements, and strong shadows.
- Existing learning says cross-surface UI consistency should prefer semantic tokens in `src/app/globals.css` and shared components over ad-hoc Tailwind palette classes.
- `globals.css` already defines extensive tokens (colors, shadows, radius, sidebar, charts, success/destructive) and `@theme inline` mappings. The gap is product-surface-specific tokens (panel, disabled, warning) and missing layout primitives.
- `Empty` component family (`Empty`, `EmptyHeader`, `EmptyMedia`, `EmptyTitle`, `EmptyDescription`, `EmptyContent`) already exists in `src/components/ui/empty.tsx`.

Cost:
- UI looks pleasant but unserious. Professional SaaS needs fewer effects, clearer affordances, and more disciplined repetition.

Resolution options:

1. Minimal: lower card radius/shadow globally and reserve `rounded-full` for true pills.
2. Better: extend existing token foundation with product-surface tokens for panel, muted surface, disabled, and warning states.
3. Strong: add shared `PageShell`, `PageHeader`, `Surface`, and `MetricCard` primitives (complement existing `Empty` family), then migrate product pages.
4. Heavy: write a full visual system spec and enforce via lint/search checks for disallowed ad-hoc palette/radius classes.

Recommended first move:
- Options 2 and 3 together. Tokens without primitives still invite drift; primitives without tokens bake in another one-off style. Build on the existing token foundation and `Empty` component rather than starting from scratch.

## Finding 4: Button Hierarchy Is Incoherent

Evidence:
- Dashboard shows both blue and black primary CTAs.
- Pricing uses mixed full-width primary, outline, and muted controls.
- Disabled CTA states are so pale they read broken, not intentionally disabled.

Cost:
- Users cannot reliably tell what action matters most.

Resolution options:

1. Minimal: audit visible CTAs and map each to `primary`, `secondary`, `outline`, `ghost`, or `disabled`.
2. Better: update `Button` variants and replace custom route-level button classes with shared variants.
3. Strong: add route-level CTA rules: one primary per main region, destructive only for irreversible actions, disabled with text support.
4. Heavy: add visual tests for common button states across light/dark themes.

Recommended first move:
- Option 2. Shared variants fix the root cause faster than route-by-route color arguments.

## Finding 5: App Layout Wastes Space

Evidence:
- Dashboard/plans/settings have large empty vertical regions.
- Settings content is narrow and starts low.
- Plans empty state floats in a mostly blank page.

Cost:
- The product feels unfinished and low-information. Empty states should guide action, not create a museum wall.

Resolution options:

1. Minimal: reduce vertical padding and align page headers/content across app pages.
2. Better: define product layout grid rules: header height, section gap, two-column settings grid, empty-state max width, content max width.
3. Strong: build shared product page templates for list pages, settings pages, analytics pages, and empty-state pages.
4. Heavy: redesign dashboard/plans around a data-dense command center with sidebar activity, active plan, and usage summary.

Recommended first move:
- Option 2. Fix layout math before redesigning individual pages.

## Finding 6: Typography Scale Is Uneven

Evidence:
- Settings title uses inline `text-3xl font-bold` overriding the base `<h1>` scale (24px) defined in `globals.css`.
- Marketing H1s dominate the 827px viewport.
- Body text often has wide tracking and low contrast.
- `globals.css` already defines separate marketing (`marketing-h1` through `marketing-h4`) and product (`h1` through `h6`) type scales — the scales exist but enforcement is missing.

Cost:
- Inconsistent hierarchy makes the interface look assembled from separate experiments.

Resolution options:

1. Minimal: define product page title/subtitle/body classes and apply them to dashboard/plans/settings/analytics.
2. Better: review and refine the existing marketing and product type scales in `globals.css` (already partially defined).
3. Strong: make shared `PageHeader` own title/subtitle sizing so product pages stop improvising.
4. Heavy: audit all text contrast and type sizes against WCAG and professional SaaS density targets.

Recommended first move:
- Option 3 primarily. The type scales already exist in `globals.css`; the gap is enforcement. A shared `PageHeader` prevents pages from improvising inline overrides (e.g. Settings' `text-3xl font-bold`). Review existing scales (Option 2) as a secondary refinement.

## Finding 7: Locked And Coming-Soon States Have Weak Contrast

Evidence:
- Analytics and achievements cards use `opacity-50` on content — washes out text and icons to unreadable levels.
- `ComingSoonAlert` already exists as a shared component (`src/components/shared/ComingSoonAlert.tsx`) and is used on both pages, but it uses marketing-style glass treatment (`border-white/40`, `bg-white/30`, `backdrop-blur-xl`).
- The locked card pattern (Lock icon + `opacity-50` content + empty progress bar) is duplicated verbatim between usage and achievements pages.

Cost:
- Upcoming features look broken or unavailable, not intentionally previewed.

Resolution options:

1. Minimal: raise text contrast on locked cards (e.g. `opacity-70` or muted colors instead of `opacity-50`) and reduce glass styling on `ComingSoonAlert`.
2. Better: extract the duplicated locked card pattern into a `LockedFeatureCard` primitive with readable text and lock affordance. Restyle existing `ComingSoonAlert` to match product (not marketing) visual language.
3. Strong: add explicit "preview" vs "disabled" vs "unavailable" state language and styles.
4. Heavy: replace placeholder analytics pages with real empty states and timeline for availability.

Recommended first move:
- Option 2. Extract the duplicated locked card pattern and restyle `ComingSoonAlert` for product context. Foundation components already exist — this is refinement and extraction, not greenfield.

## Finding 8: Navigation Is Unclear

Evidence:
- Top-right `+`, theme toggle, and avatar are visually under-explained (desktop does label "New Plan" but mobile shows icon-only).
- Desktop (1024px+) already has visible horizontal nav links (Dashboard, Plans, Analytics, Settings) — not a hamburger. However, tablet range (768–1024px) falls to the mobile hamburger when users may expect visible links.
- Settings has a sidebar but other app areas do not.
- The glass/blur nav bar style is marketing-grade on authenticated routes (addressed by Finding 2).

Cost:
- Users lack a stable mental model for where product areas live, especially on medium screens.

Resolution options:

1. Minimal: add tooltips/labels to icon buttons and normalize sizing/states.
2. Better: extend visible nav links down to `md` breakpoint (768px) to eliminate the tablet hamburger gap.
3. Strong: define one authenticated navigation model: sidebar on desktop, compact bottom/top nav on mobile.
4. Heavy: run a full IA pass and reorganize dashboard/plans/analytics/settings around primary workflows.

Recommended first move:
- Options 1+2 together. Desktop nav already works with visible links; the real gap is the tablet breakpoint and icon-button labeling. Finding 2's layout separation handles the visual style. A full sidebar redesign (Option 3) is a worthwhile long-term target but too heavy as a first move given the actual state.

## Finding 9: Auth Screens Are Clean But Generic

Evidence:
- Forms are tidy but visually generic.
- Auth pages render `<AuthView>` from `@neondatabase/auth/react` — a third-party component with limited customization surface (theme, social providers, redirectTo, viewPaths). Internal form fields, spacing, and button hierarchy are owned by NeonAuth, not app code.
- Sign-up screen says "Sign in with Email Code" (NeonAuth copy, may not be directly fixable).
- Google button styling does not feel aligned with primary action hierarchy.

Cost:
- First trust moment feels templated. Bad copy on sign-up is a credibility hit.

Resolution options:

1. Minimal: wrap `AuthView` in a product-styled container and check if NeonAuth exposes copy/theme customization for the "Email Code" text.
2. Better: create a product-styled auth wrapper (replace generic `container mx-auto flex grow flex-col` with a branded container matching the app shell visual language).
3. Strong: distinguish sign-in/sign-up with clearer headings/branding around the NeonAuth component, and add product trust signals alongside the form.
4. Heavy: redesign auth as a split trust-building surface with product proof on desktop and compact NeonAuth form on mobile.

Recommended first move:
- Option 2. Wrapping in a product-styled container is the highest-leverage change given third-party constraints. Do not over-design auth before product shell is fixed. Check NeonAuth customization APIs for any copy or theme hooks.

## Finding 10: Create-Plan Page Feels Clever But Not Serious Enough

Evidence:
- Placeholder reads `"I want to learn TypeScript for React development..."` — grammatically correct, no fix needed.
- Large glass panel uses marketing-style chrome: `backdrop-blur-xl`, `shadow-2xl`, `rounded-3xl`, decorative gradient glow, and a `MouseGlow.tsx` effect.
- Submit button uses inline custom classes (`bg-primary hover:bg-primary/90 shadow-primary/25 ... shadow-xl ... rounded-2xl`) instead of the existing `cta` Button variant.
- Disabled state uses `disabled:opacity-50` (default), which is adequate but could be more communicative.

Cost:
- This is the core conversion workflow. If it feels like a demo, users will treat generated plans like a toy.

Resolution options:

1. Minimal: strengthen disabled CTA contrast, switch submit button to shared `cta` variant, and review keyboard hint treatment.
2. Better: keep sentence input but put it in a cleaner product panel — strip glassmorphism/gradient glow/MouseGlow, use product-surface tokens, and align with app shell visual language.
3. Strong: offer two modes: guided compact form and freeform prompt, with consistent CTA hierarchy.
4. Heavy: redesign generation as a multi-step workflow with goal, schedule, level, constraints, preview, and confirmation.

Recommended first move:
- Option 2. Preserve the distinct interaction, but make the frame serious and easier to trust. Strip marketing chrome; use product panel styling from Finding 3 tokens/primitives.

## Suggested Execution Order

1. Screenshot system: regenerate real baseline.
2. Layout boundaries: split marketing/auth/app layouts.
3. Product shell: navigation, footer removal, page header, content width.
4. Design tokens and primitives: buttons, cards, empty states, locked states, page header.
5. Route cleanup pass: dashboard, plans, settings, analytics.
6. Conversion/auth polish: create-plan, auth, pricing.
7. Marketing pass: landing/about duplication check, hero/media quality, pricing hierarchy.
8. Verification: desktop/tablet/mobile screenshots plus focused accessibility checks.

## Validation Gates

- Screenshot capture produces distinct viewport dimensions for desktop/tablet/mobile.
- No authenticated app route shows marketing footer.
- Product routes use shared page shell/header primitives.
- Primary CTA style is consistent across app routes.
- Locked/disabled states meet readable contrast.
- New baseline screenshots reviewed against this audit before marking done.
