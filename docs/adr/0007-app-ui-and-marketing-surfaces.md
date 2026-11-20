# ADR 0007: App UI, navigation and marketing surfaces

- Status: Accepted
- Date: 2026-11-20
- Source: moved here from inline code comments when comments were banned in `src/` (see the `delete-comment` skill). Each entry is the original comment text, grouped by the file it sat in.

## Context

UI decisions that were recorded in comments next to the components, hooks and pages they affect: layout and motion constraints, React Compiler workarounds, neutral not-found copy, and navigation and CTA routing.

## Decisions

### `src/app/(app)/analytics/usage/usage-analytics-charts.tsx`

- `const POINT_LABEL_QUERY` — Tailwind's `sm` breakpoint (40rem); below it the pulse drops point labels.
- `const showsPointLabels` — Phones skip the per-point numbers; the tooltip still reads every value.

### `src/app/(app)/analytics/usage/usage-analytics-model.ts`

- `function yAxisTicksForMax` — Evenly spaced y-axis ticks from 0 that reach at least `maxValue`, about four steps. The last tick is the axis top, so the domain ends on a step.
- `let lastValue: number | null` — Values arrive highest first, so the last label is the only one this value can repeat or run into: every earlier label sits higher.

### `src/app/(app)/dashboard/components/ActivityCard.tsx`

- (file or block level) — The plan name is what tells similar task titles apart, so on phones the title wraps to two lines and the meta line wraps rather than truncating either.

### `src/app/(app)/dashboard/components/LearningRouteCard.tsx`

- `const ROUTE_COLUMNS: Record` — One column per visible module, so a short route spreads across the rail instead of bunching at its left end.
- (file or block level) — The route bar sits under the summary it measures; the nodes follow, so a short route doesn't leave an empty rail far below them.

### `src/app/(app)/dashboard/components/YourProgressCard.tsx`

- (file or block level) — One row per total, so the card's height (set by the resume card beside it) is filled by the totals rather than left empty.

### `src/app/(landing)/_shared/LegalDocument.tsx`

- `function LegalDocument` — Shared marketing chrome for long-form legal pages (Terms, Privacy).

### `src/app/(landing)/_shared/StarField.tsx`

- `const STARS` — Deterministic star chart — no Math.random so SSR and client agree.

### `src/app/(landing)/_shared/useOffscreenPause.ts`

- `function useOffscreenPause` — Pauses decorative CSS animations while they are off screen, so the page stops redrawing what nobody can see. Watches the element at `ref` when it carries `data-offscreen-pause`, otherwise each descendant that does, and sets `data-paused` on each; the element's stylesheet maps that to `animation-play-state: paused`. Without observer support nothing pauses.

### `src/app/(landing)/about/components/BuilderSection.tsx`

- (file or block level) — Heading left, copy right, like the method section, so the section uses the full column instead of leaving its right half empty.

### `src/app/(landing)/about/components/CloseSection.tsx`

- (file or block level) — Keeps the second sentence together instead of stranding "Set".

### `src/app/(landing)/about/page.tsx`

- `await connection` — Read the flag per request, not once at build time.

### `src/app/(landing)/landing/components/HeroSection.tsx`

- `Name a goal. Get` — "Get" stays with "a plan" rather than ending the first line.
- `function CardLabel` — Mono label above a card, on a frosted chip so it reads on any part of the light.

### `src/app/(landing)/landing/components/HeroStars.tsx`

- `function HeroStars` — Twinkling star layer behind the hero light. The twinkle pauses while the stars are off screen, so the page stops redrawing them every frame.

### `src/app/(landing)/landing/components/HowItWorksSection.tsx`

- `const STEPS` — The three steps, each with a line from the hero's example plan (TypeScript for React, two weeks, 4 hrs a week). Values match the create-plan form options and the example cards, so the page tells one consistent story.

### `src/app/(landing)/landing/components/PlanContentsSection.tsx`

- (file or block level) — box-content: the 7xl cap applies inside the gutter, so the content lines up with the CTA card below, which is 7xl wide inside the same gutter.
- (file or block level) — A themed copy of the plan page, laid out wider and scaled to 60% so the route fits; the caption describes it.

### `src/app/(landing)/landing/components/PricingSummarySection.tsx`

- `function PricingSummarySection` — What each tier includes, from the same limits as the pricing page and checkout. Prices stay on /pricing, where they come from Clerk Billing. Every tier gets lessons, so that line stays on /pricing, where the compare table lists it, and is left out here, where it wouldn't tell tiers apart.

### `src/app/(landing)/landing/components/RoadmapPreview.tsx`

- `function RoadmapPreview` — Static copy of the plan page (overview header and learning path), drawn with the app's tokens and timeline components so it follows the page's theme. Decorative: the caller hides it from assistive technology and describes it.

### `src/app/ThemeProvider.tsx`

- `function SystemThemeCrossfade` — Crossfades OS light/dark changes while the theme follows the system. next-themes applies the new theme inside its own media-query listener, so a view transition started there would capture the page already switched. Animation frames run after media-query listeners and before paint, so the frame callback puts the previous theme back and applies the new one inside a crossfade itself, whether or not next-themes has switched yet (on a busy page its listener can run after the frame). Nothing is painted in between.

### `src/app/_shared/usage-formatting.ts`

- `function isUnlimitedNumber` — Tier limits use both `Infinity` (numeric quotas like `maxActivePlans`) and `null` (optional caps like `maxWeeks`) to mean "unbounded". Centralize the predicate so callers don't have to remember to check both.

### `src/app/global-error.tsx`

- `return` — This boundary replaces the root layout, so it owns <html>, <body>, the global stylesheet and the theme provider.

### `src/app/layout.tsx`

- `logoImageUrl: '/brand/mark-on-dark.svg',` — The mark is white; the light theme inverts it so it shows on light cards.
- `colorPrimary: 'var` — Clerk paints its text actions and the active nav label in colorPrimary, so it takes the text accent; filled buttons get cantaloupe below.
- `button:` — Every filled primary button, not only formButtonPrimary: sign-up's "Join waitlist" is a plain solid button.
- (file or block level) — shouldUseClerkUi reads env config only, so server/client markup stays deterministic.
- `waitlistUrl` — Clerk's "Join waitlist" links (Waitlist sign-up mode) open the app's page, not the Account Portal.

### `src/app/maintenance/MaintenanceRecheckButton.tsx`

- `function MaintenanceRecheckButton` — Reloads the current document so the maintenance guard can re-evaluate.

### `src/components/layout/app-shell-width.ts`

- `const APP_SHELL_SIDEBAR_OFFSET` — Authenticated app sidebar offset. Defaults to the 224px desktop sidebar and shrinks to the 4rem icon rail when `--at-app-sidebar-offset` is set by desktop chrome. Animates only after a user toggle (`data-sidebar-motion` on `<html>`), so the persisted state doesn't slide on first paint.
- `const APP_SHELL_HEADER_TUCK` — Landing-only: cancels in-flow offset so a canvas can paint behind the fixed header.

### `src/components/shared/BrandLogo.tsx`

- `function BrandLogo` — Shared brand logo used in chrome. Linked lockups go to `/landing` by default because `/` sends signed-in users to dashboard; app chrome passes `href` to stay inside the app. Unlinked lockups keep the same visible crop without a destination.

### `src/components/shared/SiteHeader.tsx`

- `async function SiteHeader` — Server component wrapper for the site header. **Responsibilities:** - Resolve whether a user is signed in (server-side) - Select appropriate nav items based on auth state - Fetch user's subscription tier and create-plan eligibility - Render MobileHeader (viewports below `md`) and DesktopHeader (`md` and up) **Architecture:** Header -> Navigation separation We maintain separate Header and Navigation components because they serve distinct purposes: - **Header components** (DesktopHeader, MobileHeader): Layout containers that position brand, navigation, and auth controls. Handle responsive visibility (`md` breakpoint). - **Navigation components** (DesktopNavigation, MobileNavigation): Render the actual nav links with their specific interaction patterns (dropdowns vs sheets).
- `loadAccountProfile?: boolean;` — Marketing chrome never shows name/avatar; skip the Clerk profile round-trip.
- `const authUserId` — Marketing pages stay live while a site gate is on. Render them signed out so Clerk's account menu can't open a path around the gate redirect. Signed-in users pass the launch waitlist, so they keep their account chrome.
- `showClerkUserButton` — Local product-testing auth has no Clerk session, so it uses the account link fallback.
- `if` — A just-deleted account keeps a valid session token for up to a minute. Render it signed out instead of offering the dashboard.
- `const profilePromise` — App-shell account chrome needs live name/avatar. Marketing routes skip this Clerk lookup because they never render those fields.

### `src/components/shared/ThemeToggle.tsx`

- `if` — Render placeholder during SSR to prevent layout shift

### `src/components/shared/nav/AppSidebar.tsx`

- `collapsed?: boolean;` — Desktop icon rail. Never set for the mobile sheet.

### `src/components/shared/nav/AppSidebarRail.tsx`

- (file or block level) — The mark and the expand control share one slot; the expand control replaces the mark while the sidebar is hovered or focused. The mark link stays out of the tab order (Dashboard covers the same destination) so focus never lands on it while it is hidden.

### `src/components/shared/nav/MobileHeader.tsx`

- `!isMarketing && 'min-[25rem]:grid-cols-[1fr_auto_1fr]',` — From 400px up the side groups fit, so equal columns center the logo.

### `src/components/shared/nav/MobileNavigation.tsx`

- `if` — App routes get their create-plan action from the sidebar inside the sheet, so the sheet only adds the marketing call to action.

### `src/components/shared/nav/SiteHeaderChrome.tsx`

- `desktopSidebarOpen` — Collapsed width must match DESKTOP_SIDEBAR_RAIL_WIDTH.

### `src/components/shared/nav/SiteHeaderFallback.tsx`

- `function SiteHeaderFallback` — Suspense fallback for the async `SiteHeader`. Mirrors its fixed 64px strip and the desktop sidebar column so the shell does not shift when the real header streams in.

### `src/components/shared/nav/desktop-nav-sync.ts`

- `const APP_SHELL_DESKTOP_MEDIA_QUERY` — Must stay aligned with MobileHeader `lg:hidden` / DesktopHeader `lg:grid`.
- `const MARKETING_DESKTOP_MEDIA_QUERY` — Must stay aligned with MobileHeader `md:hidden` / DesktopHeader `md:grid`.

### `src/components/shared/theme-transition.ts`

- `function transitionTheme` — Runs a synchronous theme change inside a root view transition, so the whole page crossfades (see `::view-transition-*(root)` in globals.css). Without support, or under reduced motion, the change applies instantly.

### `src/components/ui/badge.tsx`

- `product:` — Product app: opaque surface. Prefer for dashboard/settings.

### `src/components/ui/cta-banner.tsx`

- `'relative isolate overflow-hidden rounded-[12px] border border-border ` — The divider border: the panel border is about 1.1:1 on the dark canvas, so the card would have no visible edge.

### `src/features/navigation/create-plan-cta.ts`

- `function resolveMarketingCreatePlanCta` — The marketing pages' create-plan buttons. A signed-out visitor goes to sign-up and returns to the plan form; a signed-in user with no active subscription goes to pricing, because the plan form would send them there anyway; everyone else goes to the plan form.
- `function resolveMarketingPrimaryCta` — The marketing header's one call to action. Signed-in visitors go to the dashboard; on the auth pages a visitor is already mid sign-in, so the action is Sign up rather than the plan form.

### `src/features/navigation/routes.ts`

- `const ROUTES` — Centralized route constants for the application. Use these constants instead of hardcoded paths to ensure consistency and make route changes easier to manage.

### `src/lib/date/relative-time.ts`

- `function formatRelativePast` — Past-only relative time (plan cards: compact; dashboard activity: verbose). Negative deltas (reference before target, i.e. `date` in the future) are clamped to zero so callers get “Just now” / minimal buckets — the behavior the plan-card helper had before this module replaced it.

### `src/shared/constants/chart-colors.ts`

- `const PLAN_CHART_DASHES` — Line dash per series, paired by index with `PLAN_CHART_COLORS`. Series 5 is slate, the one neutral, so it is also dashed and never relies on hue alone.

### `src/shared/notifications/email-delivery.ts`

- `type PersistedProviderRequest` — Fully resolved provider request snapshot persisted on the delivery ledger. Never includes provider credentials.

## Consequences

The code no longer carries this rationale inline. A change that would alter one of the behaviors above should update this ADR in the same pull request, and a new non-obvious decision belongs in an ADR, not in a comment.
