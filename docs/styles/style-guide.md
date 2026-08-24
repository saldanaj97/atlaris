# Atlaris style guide

Single reference for **colors, tokens, typography, spacing, layout patterns, marketing celestial depth, components, and shell layout** so new UI stays aligned with the product.

**Source of truth (live):** [`src/app/globals.css`](../../src/app/globals.css) (`:root`, `.dark`, `@theme inline`, utilities), plus [`src/app/layout.tsx`](../../src/app/layout.tsx) for root fonts and structure.

**Live brand direction:** [After Hours](./after-hours-direction.md) — Sora (brand/marketing) + Work Sans (product), plum/peach light & dark palettes. Semantic token names are unchanged; values and display font are After Hours.

**Conflict rule:** If this guide conflicts with [`DESIGN.md`](../../DESIGN.md) or `globals.css`, prefer those. Liquid-glass and deleted shared marketing wrappers (`MarketingHero`, `MarketingSection`, `MarketingCard`) are retired.

---

## What this guide covers (industry-aligned scope)

Solid product style guides usually spell out: **semantic color and tokens**; **typography** (families, scales, when to use which); **spacing and layout** patterns; **elevation** (shadows, radius); **core components** (variants and usage); **accessibility** expectations; and **clear do / don’t rules** so teams do not ship one-off hex values or mixed visual languages. This document is written for that purpose. Where Atlaris uses **design tokens** (CSS variables + Tailwind), names and usage live here; implementation details stay in `globals.css`.

---

## Design contexts (do not mix)

Atlaris has two visual contexts:

| Context              | Character                                                                                                                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hero / marketing** | Centered Sora display type, section overlines, hairline dividers, celestial backdrop (semantic orbs + `StarField`), italic `text-primary` emphasis, opaque `rounded-4xl` panels, optional inverted Polaris band. |
| **Content / app**    | Left-aligned, compact, functional—no decorative orbs or marketing-only type scales.                                                                                                                              |

**Rule:** Pick one context per page or major section. Do not blend hero marketing patterns into dashboard-style pages, or vice versa.

A **quick decision tree** appears [later in this document](#quick-decision-tree-hero-vs-app).

---

## Color tokens

All product colors should come from **semantic tokens** in `globals.css`. They adapt in light and dark mode.

**Rule:** Do not hard-code hex or raw RGB for product UI. Use Tailwind semantic classes (`bg-primary`, `text-muted-foreground`, …) or CSS variables. Prefer `text-muted-foreground` over arbitrary grays for secondary copy.

### Semantic palette (Tailwind / roles)

| Token (Tailwind)                                              | Role                                                |
| ------------------------------------------------------------- | --------------------------------------------------- |
| `background` / `foreground`                                   | Page surface and default text                       |
| `card` / `card-foreground`                                    | Card surfaces and text on cards                     |
| `primary` / `primary-foreground`                              | Brand emphasis, links, and soft primary surfaces    |
| `primary-dark`                                                | Solid primary fills when paired with white text     |
| `accent` / `accent-foreground`                                | Secondary emphasis; pairs with primary in gradients |
| `muted` / `muted-foreground`                                  | Subtle panels, helper text                          |
| `secondary` / `secondary-foreground`                          | Secondary surfaces                                  |
| `destructive`                                                 | Errors, destructive actions                         |
| `success` / `success-foreground`                              | Positive completion states                          |
| `border` / `input` / `ring`                                   | Strokes, fields, focus rings                        |
| `chart-1` … `chart-5`                                         | Data visualization (brand-aligned progression)      |
| `sidebar-*`                                                   | Sidebar-specific styling when used                  |
| `panel` / `panel-foreground` / `panel-muted` / `panel-border` | Opaque app panels, metrics, and product surfaces    |
| `warning` / `warning-foreground`                              | Caution (non-destructive)                           |
| `disabled` / `disabled-foreground`                            | Unavailable or disabled copy/surfaces               |

**App chrome:** use shared [`PageShell`](../../src/components/ui/page-shell.tsx), [`PageHeader`](../../src/components/ui/page-header.tsx), [`Surface`](../../src/components/ui/surface.tsx), and [`MetricCard`](../../src/components/ui/metric-card.tsx) on product routes. Product routes stay opaque — no marketing celestial backdrop. Marketing panels are mostly opaque `bg-card` / `rounded-4xl`; use `backdrop-blur` only for narrow cases (e.g. dashed screenshot placeholders). Do not reintroduce liquid-glass or a shared glass surface system.

**Site header:** marketing paths (`/`, `/landing`, `/pricing`) use marketing navigation; other paths use app navigation. Shared header chrome is a flat full-bleed `bg-background` with an editorial hairline — not glass. Marketing nav/CTA classes live in [`marketing-header-classes.ts`](../../src/components/shared/nav/marketing-header-classes.ts). [`BrandLogo`](../../src/components/shared/BrandLogo.tsx) defaults to solid `text-primary` in chrome to avoid theme hydration mismatch; use `variant="gradient"` only where client-only rendering is acceptable.

**Marketing composition:**

- Shell: [`MarketingPageShell`](<../../src/app/(marketing)/_shared/MarketingPageShell.tsx>)
- Stars: [`StarField`](<../../src/app/(marketing)/_shared/StarField.tsx>)
- Pill CTAs: [`marketing-cta.ts`](<../../src/app/(marketing)/_shared/marketing-cta.ts>)
- Landing: [`Landing.tsx`](<../../src/app/(marketing)/landing/components/Landing.tsx>) — Hero → Drift → Route → Instruments → Questions → Polaris
- Pricing: [`PricingShell`](<../../src/app/(marketing)/pricing/components/PricingShell.tsx>) + [`ClerkPricingTable`](<../../src/app/(marketing)/pricing/components/ClerkPricingTable.tsx>) (custom [`PricingCards`](<../../src/app/(marketing)/pricing/components/PricingCards.tsx>); native Clerk `<PricingTable />` only on billing load failure). When Clerk UI is off (`shouldUseClerkUi()` false), [`LocalPricingPreview`](<../../src/app/(marketing)/pricing/components/LocalPricingPreview.tsx>) renders the same card grid with checkout disabled. Feature bullets: [`pricing-plan-features.ts`](<../../src/app/(marketing)/pricing/pricing-plan-features.ts>).
- Do not assume deleted wrappers: `MarketingHero`, `MarketingSection`, `MarketingCard`

### Light-mode mapping (reference)

| Token                            | Typical light-mode role                                             |
| -------------------------------- | ------------------------------------------------------------------- |
| `--background`                   | Page background                                                     |
| `--foreground`                   | Primary text                                                        |
| `--card` / `--card-foreground`   | Card fill and card text                                             |
| `--primary`                      | Peach/copper brand action; use `--primary-dark` for solid CTA fills |
| `--primary-foreground`           | CTA accent ink on solid primary fills                               |
| `--secondary`                    | Soft parchment / plum wash surfaces                                 |
| `--accent`                       | Soft wash complementary to primary (gradients, tinted fills)        |
| `--accent-foreground`            | Peach/copper text on accent washes                                  |
| `--muted` / `--muted-foreground` | Note panels; secondary copy                                         |
| `--destructive`                  | Error / danger (warm hue)                                           |
| `--border`                       | Dividers and borders (line tokens)                                  |
| `--ring`                         | Focus rings (accent)                                                |

**Brand note:** Primary is peach/copper; soft washes stay in the parchment/plum family so `from-primary to-accent` gradients read After Hours, not Progress Jam violet.

---

## Typography

### Font stacks (runtime)

| Layer                             | Family                                                     | Notes                                                                                     |
| --------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Body (default)**                | **Work Sans** via `--font-family-base`                     | Loaded with `next/font` on `<html>`; applied on `<body>` in `layout.tsx`.                 |
| **App headings (`h1`–`h6`)**      | **Work Sans** via `--font-family-heading` (weight **600**) | Product UI titles, settings cards, dashboard headings.                                    |
| **Marketing display headings**    | **Sora** via `--font-family-display` (weight **600**)      | `font-serif`; brand voice on marketing pages only.                                        |
| **Theme / Tailwind `font-sans`**  | `--font-family-base` (Work Sans stack)                     | `font-sans` utilities inherit the same UI stack.                                          |
| **Theme / Tailwind `font-serif`** | `--font-family-display` (Sora stack)                       | Utility for Sora brand moments; use for intentional display, not product body.            |
| **Mono**                          | `--font-mono` → JetBrains Mono                             | Optional for code/IDs only — not brand voice.                                             |
| **Clerk Auth UI**                 | Clerk components inherit the root app fonts                | Keep auth pages under the shared auth layout; avoid provider-specific global CSS imports. |

**Consistency (live):** Use **Work Sans** for all product/app UI. Use **Sora** for marketing display headings. Do not add a third brand face unless `layout.tsx` and `globals.css` are updated together. Young Serif is retired.

**CSS variables (defined in `globals.css`):** `--font-family-base`, `--font-family-heading`, `--font-family-display`, `--font-weight-base` (400), `--font-weight-heading` (600). Next/font exposes `--font-work-sans` and `--font-sora` on `<html>`.

### App / dashboard base headings (`@layer base`)

Plain `<h1>`–`<h6>` in [`globals.css`](../../src/app/globals.css) use the heading font family and weight variables. Sizes:

| Tag  | Size            | Line height | Letter spacing | Notes              |
| ---- | --------------- | ----------- | -------------- | ------------------ |
| `h1` | 24px (1.5rem)   | 1.25        | -0.02em        | Page titles in app |
| `h2` | 20px (1.25rem)  | 1.3         | -0.015em       |                    |
| `h3` | 18px (1.125rem) | 1.35        | -0.01em        |                    |
| `h4` | 16px (1rem)     | 1.4         | -0.01em        |                    |
| `h5` | 14px (0.875rem) | 1.4         | 0              |                    |
| `h6` | 12px (0.75rem)  | 1.5         | 0              | Uppercase          |

All use `font-family: var(--font-family-heading)` (Work Sans) and `font-weight: var(--font-weight-heading)`.

### Marketing typography

Use responsive Sora via `font-serif`:

- Hero: roughly `text-[2.75rem]` → `sm:text-5xl` → `md:text-[3.25rem]`, `font-semibold`, tight tracking
- Section headings: `text-3xl sm:text-4xl` is a common scale
- **Default emphasis:** italic `text-primary` on the second hero line
- **Section overlines:** uppercase Sora, wide tracking — see `SectionOverline`
- **`gradient-text`:** optional accent only (wordmark `variant="gradient"`, rare headlines) — not the default hero treatment

### Subtitle / helper text

- `.subtitle` in `globals.css`: muted color, base weight.
- Common pattern: `text-muted-foreground text-sm` for settings-style helpers.

---

## Radius, spacing, and shadows

### Radius

Product and marketing use **split radius tokens** (see `:root` in `globals.css`):

| Token                | Value     | Scope                                                             |
| -------------------- | --------- | ----------------------------------------------------------------- |
| `--radius`           | `0.75rem` | Product/app: buttons, inputs, and token-derived `rounded-sm`–`xl` |
| `--radius-marketing` | `2rem`    | Wired as `--radius-4xl` → `rounded-4xl` on marketing arched cards |

**Decision (L-08):** Lowered product `--radius` from `2rem` because controls felt overly pill-shaped at ~28px `rounded-md`. Marketing keeps generous corners via explicit utilities, not the product token.

| Token          | Derived from `--radius` (0.75rem) | Typical use                     |
| -------------- | --------------------------------- | ------------------------------- |
| `rounded-sm`   | `calc(0.75rem × 0.75)`            | Small elements, badges          |
| `rounded-md`   | `calc(0.75rem × 0.875)`           | Buttons, inputs                 |
| `rounded-lg`   | `0.75rem`                         | Compact containers              |
| `rounded-xl`   | `calc(0.75rem × 1.25)`            | Larger product panels           |
| `rounded-2xl`  | ~1rem (fixed scale)               | Product cards, standard panels  |
| `rounded-3xl`  | ~1.5rem (fixed scale)             | Larger marketing surfaces       |
| `rounded-4xl`  | `--radius-marketing` (`2rem`)     | Marketing arched cards / panels |
| `rounded-full` | `9999px`                          | Marketing CTAs, badges, avatars |

### Spacing

- Base scale: Tailwind defaults; `--spacing` in `:root` is **0.2rem** where the system defines tight rhythm.
- **App pages:** often `px-6 py-8` with `max-w-7xl`.
- **Marketing sections:** often `px-6 py-16 md:py-24`; hairline dividers between major blocks.

### Shadow tokens

Use Tailwind shadow utilities backed by custom properties:

| Token        | Approx. size  | Typical use               |
| ------------ | ------------- | ------------------------- |
| `shadow-2xs` | 1px           | Subtle depth              |
| `shadow-xs`  | 2px           | Small controls            |
| `shadow-sm`  | 3px           | Buttons, small cards      |
| `shadow`     | 4px (default) | Standard cards            |
| `shadow-md`  | 6px           | Elevated cards            |
| `shadow-lg`  | 15px          | Marketing CTAs, dropdowns |
| `shadow-xl`  | 25px          | Modals, hero emphasis     |
| `shadow-2xl` | 50px          | Maximum elevation         |

**Hover:** Increase shadow on interactive surfaces for feedback, e.g. `transition hover:shadow-xl`.

---

## Brand gradients and utilities

Defined in `@layer utilities` in [`globals.css`](../../src/app/globals.css). Prefer these over ad-hoc gradient strings.

| Class                                       | Use                                                                  |
| ------------------------------------------- | -------------------------------------------------------------------- |
| `gradient-brand`                            | Static brand strip (badges, decorative bars)                         |
| `gradient-brand-interactive`                | Hover/focus-capable brand fills                                      |
| `brand-fill` / `brand-fill-interactive`     | Solid primary + interaction states                                   |
| `gradient-glow`                             | Soft background orbs (optional; live pages prefer explicit orb divs) |
| `gradient-text` / `gradient-text-symmetric` | Optional headline gradient text; dark mode variants exist            |

**Hero emphasis (default):** italic primary line, not gradient keyword spans.

```tsx
<span className='mt-1 block font-medium text-primary italic'>
  the work that changes you.
</span>
```

Use `gradient-text` only when a short intentional accent is required.

---

## Marketing depth & celestial backdrop

Marketing depth comes from: (1) celestial backdrop, (2) soft shadows, (3) hairline dividers, (4) optional inverted Polaris band. Panels stay mostly **opaque**. Liquid-glass is removed — do not rebuild it.

### Celestial backdrop recipe

From `Landing.tsx` / `PricingShell.tsx`:

```tsx
<div
  className='pointer-events-none absolute inset-0 overflow-hidden text-foreground'
  aria-hidden='true'
>
  <div className='absolute -top-24 -right-16 size-136 rounded-full bg-primary/20 blur-3xl md:size-168' />
  <div className='absolute top-[30%] -left-28 size-112 rounded-full bg-panel-muted/70 blur-3xl md:size-144' />
  <div className='absolute right-[-6%] bottom-[12%] size-96 rounded-full bg-card/80 blur-3xl' />
  <StarField />
</div>
```

**Rules:**

- Orbs use **semantic token alphas** only (`bg-primary/*`, `bg-panel-muted/*`, `bg-card/*`) — never cyan/blue/cold Progress Jam orbs.
- Parent: `pointer-events-none absolute inset-0 overflow-hidden`.
- Reuse shared [`StarField`](<../../src/app/(marketing)/_shared/StarField.tsx>); do not invent a second star system.

### Panel recipes

**Opaque marketing panel**

```tsx
<div className='rounded-4xl border border-border/50 bg-card p-8 shadow-sm'>
  {/* Content */}
</div>
```

**Polaris inverted band**

```tsx
<section className='rounded-4xl bg-foreground text-background'>
  <StarField /> {/* inherits currentColor */}
  {/* CTA copy */}
</section>
```

**Screenshot placeholder (only routine blur use)**

```tsx
<figure className='rounded-4xl border border-dashed border-panel-border/80 bg-card/60 backdrop-blur-sm'>
  {/* Placeholder */}
</figure>
```

**Retired:** liquid-glass module, `HeaderLiquidGlassShell`, `marketing-glass-surface`, glass nav bar recipes, glass intensity ladders.

---

## Page layout patterns

### 1. Hero / marketing pages

**Examples:** Landing, Pricing. (`/about` redirects to `/landing`.)

#### Heading

```tsx
<h1 className='font-serif text-[2.75rem] leading-[1.08] font-semibold tracking-[-0.03em] text-foreground sm:text-5xl md:text-[3.25rem]'>
  <span className='block'>Make space for</span>
  <span className='mt-1 block font-medium text-primary italic'>
    the work that changes you.
  </span>
</h1>
```

#### Subtitle

```tsx
<p className='mx-auto mt-6 max-w-xl font-sans text-base text-muted-foreground sm:text-lg'>
  Name a goal. Atlaris charts the plan and remembers where you left off.
</p>
```

#### CTAs

Prefer `marketingPrimaryCtaClassName` / `marketingSecondaryCtaClassName` from `marketing-cta.ts` (pill + Sora).

#### Page shell

```tsx
<MarketingPageShell>
  <CelestialBackdrop />
  <div className='relative z-10'>{/* Hairline + sections */}</div>
</MarketingPageShell>
```

Section rhythm: hairlines (`bg-border/35`) between major blocks; section padding roughly `py-16 md:py-24`.

---

### 2. Content / app pages

**Examples:** Dashboard, Plans, Settings, Analytics.

#### Page container (app)

```tsx
<div className="mx-auto min-h-screen max-w-7xl px-6 py-8">
```

#### Page header

```tsx
<div className='mb-6'>
  <h1>Page Title</h1>
  <p className='subtitle'>Optional description.</p>
</div>
```

Use a plain `<h1>` for the main title—**do not** add `text-xl` or other size overrides; base styles from `globals.css` apply (24px app title).

#### Settings section header

```tsx
<div className='mb-6'>
  <h2 className='text-xl font-semibold'>Settings Section</h2>
  <p className='text-sm text-muted-foreground'>Helper description.</p>
</div>
```

#### Settings ledger layout

Product settings render as one ledger page (`SettingsLedgerPage` on `/settings` and `/settings/[...user-profile]`). Sections use `LedgerSectionBlock` with stable DOM `id`s from `SETTINGS_SECTIONS` (`profile`, `billing`, `usage`, `ai`, `integrations`, `notifications`). Deep links are `/settings#<id>` (client scroll via `SettingsScrollTarget` with `scroll-mt-24` on each section). Do not introduce nested `/settings/<section>` pages for these blocks. Checkout return URLs that need the billing block keep `#billing` (see [environment.md](../development/environment.md#settings-ledger-deep-links)).

#### Card grids

```tsx
<div className="grid gap-6 md:grid-cols-2">{/* Cards */}</div>
<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{/* Wider grids */}</div>
```

#### Card interior

```tsx
<Card className='p-6'>
  <h3 className='mb-4 text-xl font-semibold'>Card Title</h3>
  <p className='text-sm text-muted-foreground'>Description</p>
  <div className='space-y-4'>{/* Content */}</div>
</Card>
```

---

### Quick decision tree (hero vs app)

```txt
Is this a hero/landing/marketing section?
├── YES → Hero/marketing pattern
│   ├── Overline + Sora responsive display type
│   ├── Emphasis: italic text-primary (not gradient by default)
│   ├── CTAs: marketing-cta.ts pills
│   ├── Layout: MarketingPageShell + centered sections
│   └── Decorative: celestial backdrop (semantic orbs + StarField); opaque rounded-4xl panels
│
└── NO → Content/app pattern
    ├── Heading: plain <h1> (24px base) or text-xl font-semibold for subsections
    ├── Subtitle: .subtitle or text-muted-foreground text-sm
    ├── Layout: left-aligned
    ├── Container: px-6 py-8, mb-6 for headers
    └── Decorative: none
```

---

## Core components

### Button

[`src/components/ui/button.tsx`](../../src/components/ui/button.tsx)

| Variant             | When                                                   |
| ------------------- | ------------------------------------------------------ |
| `default`           | Primary actions (`bg-primary`)                         |
| `secondary`         | Secondary actions                                      |
| `outline` / `ghost` | Tertiary actions, toolbars                             |
| `destructive`       | Delete / irreversible                                  |
| `link`              | Text styled as a button                                |
| `cta`               | Prominent product/marketing CTAs when `Button` is used |

Sizes include `default` (h-9), `sm`, `lg`, `icon*`. Keep focus visible: `ring-ring/50`, `border-ring` patterns as implemented.

On marketing heroes/final CTAs, prefer `marketing-cta.ts` class names over inventing new pill styles.

### Card

- Use `Card` from `@/components/ui/card` for product UI.
- Marketing panels: opaque `bg-card` + `rounded-4xl`; see [Marketing depth](#marketing-depth--celestial-backdrop).

---

## Global shell

| Element    | Pattern                                                                     |
| ---------- | --------------------------------------------------------------------------- |
| **Root**   | `next-themes` with `class` on `<html>` (`light` / `dark`)                   |
| **Body**   | Work Sans + Sora CSS variables, `antialiased`, `flex min-h-screen flex-col` |
| **Header** | Flat `SiteHeaderChrome`; main content offset with `pt-16` in layout         |
| **Footer** | Brand and copyright                                                         |

Each page should expose a proper `main` landmark where applicable.

---

## Interactive states

**Hover (elevated cards):** e.g. `transition hover:-translate-y-1 hover:shadow-xl`.

**Hover (borders):** e.g. `hover:border-primary/30 dark:hover:border-primary/50`.

**Focus:** Prefer ring utilities aligned with tokens, e.g. `focus:ring-2 focus:ring-ring focus:ring-offset-2` (match existing components).

**Disabled:** e.g. `disabled:opacity-50 disabled:cursor-not-allowed` with muted semantics.

---

## Accessibility and motion

- **Landmarks:** Use `main`, and consistent header/footer patterns on marketing pages.
- **Theme:** Respect system default; keep the header theme control reachable.
- **Motion:** Prefer subtle translate/shadow transitions; honor `prefers-reduced-motion` (landing uses `motion-reduce:animate-none` on entrance). Avoid heavy parallax unless specified.

Verify **contrast** on `background`, `card`, and `border` in both themes for new surfaces.

---

## Do’s and don’ts

### Do

- Use semantic color tokens (`bg-primary`, `text-muted-foreground`, …).
- Reuse `StarField` + semantic orbs for marketing backdrops.
- Use `marketing-cta.ts` / `marketing-header-classes.ts` for marketing actions.
- Use global gradient utilities when a gradient is intentional (`.gradient-brand`, optional `.gradient-text`).
- Keep border radius consistent within component families.
- Test **light and dark** modes.

### Don’t

- Hard-code hex/rgb for product chrome.
- Reintroduce liquid-glass, glass nav shells, or glass intensity ladders.
- Use cyan/cold orb palettes or Progress Jam violet.
- Assume shared `MarketingHero` / `MarketingSection` / `MarketingCard` wrappers.
- Over-use gradient text (optional accents only — default hero emphasis is italic primary).

---

## Implementation checklist (PRs)

- [ ] Colors use semantic tokens, not one-off hex.
- [ ] Headings follow **app base** (`<h1>`–`<h6>`) or **marketing** (responsive `font-serif` + `SectionOverline` pattern) — no retired `.marketing-h*` classes.
- [ ] Hero/marketing vs app layout matches the [decision tree](#quick-decision-tree-hero-vs-app).
- [ ] Spacing aligns with established containers (`max-w-7xl`, `px-6`, `py-8` app / `py-16` marketing sections).
- [ ] Primary product actions use `Button` variants; marketing CTAs reuse `marketing-cta.ts`.
- [ ] Dark mode: contrast checked on `background`, `card`, `border`.

---

## Appendix: live visual anchors

Prefer these files over historical audit snapshots:

| Route / surface | Anchor file                                                                           |
| --------------- | ------------------------------------------------------------------------------------- |
| Landing         | [`Landing.tsx`](<../../src/app/(marketing)/landing/components/Landing.tsx>)           |
| Pricing         | [`PricingShell.tsx`](<../../src/app/(marketing)/pricing/components/PricingShell.tsx>) |
| Header          | [`SiteHeaderChrome.tsx`](../../src/components/shared/nav/SiteHeaderChrome.tsx)        |
| Agent entry     | [`DESIGN.md`](../../DESIGN.md) Layout section                                         |

Refresh this appendix after major visual releases or when validating production URLs.

---

## Related source files

| File                                                                                         | Role                         |
| -------------------------------------------------------------------------------------------- | ---------------------------- |
| [`src/app/globals.css`](../../src/app/globals.css)                                           | Tokens, base type, utilities |
| [`src/app/layout.tsx`](../../src/app/layout.tsx)                                             | Root fonts and shell         |
| [`src/components/ui/button.tsx`](../../src/components/ui/button.tsx)                         | Button variants              |
| [`Landing.tsx`](<../../src/app/(marketing)/landing/components/Landing.tsx>)                  | Live landing composition     |
| [`PricingShell.tsx`](<../../src/app/(marketing)/pricing/components/PricingShell.tsx>)        | Pricing chrome               |
| [`marketing-cta.ts`](<../../src/app/(marketing)/_shared/marketing-cta.ts>)                   | Pill CTA classes             |
| [`marketing-header-classes.ts`](../../src/components/shared/nav/marketing-header-classes.ts) | Header nav + CTA             |
| [`SiteHeaderChrome.tsx`](../../src/components/shared/nav/SiteHeaderChrome.tsx)               | Flat header shell            |
| [`DESIGN.md`](../../DESIGN.md)                                                               | Agent-facing design entry    |
