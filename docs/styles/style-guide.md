# Atlaris style guide

Single reference for **colors, tokens, typography, spacing, layout patterns, glassmorphism, components, and shell layout** so new UI stays aligned with the product.

**Source of truth (live):** [`src/app/globals.css`](../../src/app/globals.css) (`:root`, `.dark`, `@theme inline`, utilities), plus [`src/app/layout.tsx`](../../src/app/layout.tsx) for root fonts and structure.

**Live brand direction:** [After Hours](./after-hours-direction.md) — Sora (brand/marketing) + Work Sans (product), plum/peach light & dark palettes. Semantic token names are unchanged; values and display font are After Hours.

---

## What this guide covers (industry-aligned scope)

Solid product style guides usually spell out: **semantic color and tokens**; **typography** (families, scales, when to use which); **spacing and layout** patterns; **elevation** (shadows, radius); **core components** (variants and usage); **accessibility** expectations; and **clear do / don’t rules** so teams do not ship one-off hex values or mixed visual languages. This document is written for that purpose. Where Atlaris uses **design tokens** (CSS variables + Tailwind), names and usage live here; implementation details stay in `globals.css`.

---

## Design contexts (do not mix)

Atlaris has two visual contexts:

| Context              | Character                                                                           |
| -------------------- | ----------------------------------------------------------------------------------- |
| **Hero / marketing** | Centered, large responsive type, gradient accents, decorative background orbs.      |
| **Content / app**    | Left-aligned, compact, functional—no decorative orbs or marketing-only type scales. |

**Rule:** Pick one context per page or major section. Do not blend hero marketing patterns into dashboard-style pages, or vice versa.

A **quick decision tree** appears [later in this document](#quick-decision-tree-hero-vs-app).

---

## Color tokens

All product colors should come from **semantic tokens** in `globals.css`. They adapt in light and dark mode.

**Rule:** Do not hard-code hex or raw RGB for product UI. Use Tailwind semantic classes (`bg-primary`, `text-muted-foreground`, …) or CSS variables. Prefer `text-muted-foreground` over arbitrary grays for secondary copy.

### Semantic palette (Tailwind / roles)

| Token (Tailwind)                                              | Role                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------- |
| `background` / `foreground`                                   | Page surface and default text                           |
| `card` / `card-foreground`                                    | Card surfaces and text on cards                         |
| `primary` / `primary-foreground`                              | Brand emphasis, links, and soft primary surfaces        |
| `primary-dark`                                                | Solid primary fills when paired with white text          |
| `accent` / `accent-foreground`                                | Secondary emphasis; pairs with primary in gradients     |
| `muted` / `muted-foreground`                                  | Subtle panels, helper text                              |
| `secondary` / `secondary-foreground`                          | Secondary surfaces                                      |
| `destructive`                                                 | Errors, destructive actions                             |
| `success` / `success-foreground`                              | Positive completion states                              |
| `border` / `input` / `ring`                                   | Strokes, fields, focus rings                            |
| `chart-1` … `chart-5`                                         | Data visualization (brand-aligned progression)          |
| `sidebar-*`                                                   | Sidebar-specific styling when used                      |
| `panel` / `panel-foreground` / `panel-muted` / `panel-border` | Opaque app panels, metrics, and non-glass surfaces      |
| `warning` / `warning-foreground`                              | Caution (non-destructive)                               |
| `disabled` / `disabled-foreground`                            | Unavailable or disabled copy/surfaces                   |

**App chrome:** use shared [`PageShell`](../../src/components/ui/page-shell.tsx), [`PageHeader`](../../src/components/ui/page-header.tsx), [`Surface`](../../src/components/ui/surface.tsx), and [`MetricCard`](../../src/components/ui/metric-card.tsx) on product routes. Reserve glass recipes (`backdrop-blur`, `bg-card/*` + peach border alpha, high blur) for marketing/hero, not default dashboard content.

**Site header variants:** [`header-shell.ts`](../../src/components/shared/nav/header-shell.ts) applies liquid glass to marketing paths (`/`, `/landing`, `/pricing`) and protected app paths (`/dashboard`, `/plans`, `/settings`, `/analytics`, `/account`), while auth and other non-product shell routes stay opaque. [`BrandLogo`](../../src/components/shared/BrandLogo.tsx) defaults to solid `text-primary` in chrome to avoid theme hydration mismatch; use `variant="gradient"` only where client-only rendering is acceptable.

**Marketing composition:** use [`MarketingPageShell`](../../src/app/(marketing)/_shared/MarketingPageShell.tsx), [`MarketingHero`](../../src/app/(marketing)/_shared/MarketingHero.tsx), [`MarketingSection`](../../src/app/(marketing)/_shared/MarketingSection.tsx), [`MarketingCard`](../../src/app/(marketing)/_shared/MarketingCard.tsx), and shared glass surfaces from [`marketing-glass-surface.ts`](../../src/app/(marketing)/_shared/marketing-glass-surface.ts). Default section width is `max-w-screen-xl`; narrower grids (e.g. pricing) may use `max-w-5xl` when layout requires it.

### Light-mode mapping (reference)

| Token                            | Typical light-mode role                                    |
| -------------------------------- | ---------------------------------------------------------- |
| `--background`                   | Page background                                            |
| `--foreground`                   | Primary text                                               |
| `--card` / `--card-foreground`   | Card fill and card text                                    |
| `--primary`                      | Peach/copper brand action; use `--primary-dark` for solid CTA fills |
| `--primary-foreground`           | CTA accent ink on solid primary fills                          |
| `--secondary`                    | Soft parchment / plum wash surfaces                            |
| `--accent`                       | Soft wash complementary to primary (gradients, tinted fills)   |
| `--accent-foreground`            | Peach/copper text on accent washes                             |
| `--muted` / `--muted-foreground` | Note panels; secondary copy                                    |
| `--destructive`                  | Error / danger (warm hue)                                      |
| `--border`                       | Dividers and borders (line tokens)                             |
| `--ring`                         | Focus rings (accent)                                           |

**Brand note:** Primary is peach/copper; soft washes stay in the parchment/plum family so `from-primary to-accent` gradients read After Hours, not Progress Jam violet.

---

## Typography

### Font stacks (runtime)

| Layer                            | Family                                                                 | Notes                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Body (default)**               | **Work Sans** via `--font-family-base`                                 | Loaded with `next/font` on `<html>`; applied on `<body>` in `layout.tsx`.                     |
| **App headings (`h1`–`h6`)**     | **Work Sans** via `--font-family-heading` (weight **600**)             | Product UI titles, settings cards, dashboard headings.                                        |
| **Marketing display headings**   | **Sora** via `--font-family-display` (weight **600**)                  | `.marketing-h1`–`.marketing-h4`; brand voice on marketing pages only.                         |
| **Marketing card titles**        | **Work Sans** via `--font-family-heading`                              | `.marketing-card-title` stays in the product sans for readable card copy.                     |
| **Theme / Tailwind `font-sans`** | `--font-family-base` (Work Sans stack)                                 | `font-sans` utilities inherit the same UI stack.                                              |
| **Theme / Tailwind `font-serif`**| `--font-family-display` (Sora stack)                                   | Legacy utility name for display; use for intentional brand moments, not product body.         |
| **Theme / Tailwind `font-display`**| `--font-family-display` (Sora stack)                                 | Preferred alias for Sora brand moments (`font-display`).                                      |
| **Mono**                         | `--font-mono` → JetBrains Mono                                         | Optional for code/IDs only — not brand voice.                                                 |
| **Clerk Auth UI**                | Clerk components inherit the root app fonts                            | Keep auth pages under the shared auth layout; avoid provider-specific global CSS imports.      |

**Consistency (live):** Use **Work Sans** for all product/app UI. Use **Sora** for marketing display headings (`.marketing-h*`). Do not add a third brand face unless `layout.tsx` and `globals.css` are updated together. Young Serif is retired.

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

### Marketing typography classes (`globals.css`)

| Class                 | Desktop | Mobile | Use                                                                                       |
| --------------------- | ------- | ------ | ----------------------------------------------------------------------------------------- |
| `.marketing-h1`       | 49px    | 39px   | Hero headlines                                                                            |
| `.marketing-h2`       | 39px    | 31px   | Section headlines                                                                         |
| `.marketing-h3`       | 31px    | 25px   | Feature titles                                                                            |
| `.marketing-h4`       | 25px    | 20px   | Card titles                                                                               |
| `.marketing-subtitle` | 20px    | 16px   | Subheadings                                                                               |
| `.gradient-text`      | —       | —      | Full-line gradient headline (`primary` → `accent`); use sparingly vs keyword span pattern |

**When to use Tailwind hero utilities vs `.marketing-*`:** Use responsive Tailwind utilities (e.g. `text-3xl sm:text-4xl lg:text-5xl`) for **interactive / product marketing pages** (e.g. Pricing, Create Plan). Use `.marketing-h1` / `.marketing-h2` for **static marketing pages** (e.g. Landing, About) where the CSS scale gives finer control.

### Subtitle / helper text

- `.subtitle` in `globals.css`: muted color, base weight.
- Common pattern: `text-muted-foreground text-sm` for settings-style helpers.

---

## Radius, spacing, and shadows

### Radius

Product and marketing use **split radius tokens** (see `:root` in `globals.css`):

| Token                 | Value    | Scope                                                                 |
| --------------------- | -------- | --------------------------------------------------------------------- |
| `--radius`            | `0.75rem`| Product/app: buttons, inputs, and token-derived `rounded-sm`–`xl`     |
| `--radius-marketing`  | `2rem`   | Wired as `--radius-4xl` → `rounded-4xl` on marketing arched cards                         |

**Decision (L-08):** Lowered product `--radius` from `2rem` because controls felt overly pill-shaped at ~28px `rounded-md`. Marketing keeps generous corners via explicit utilities, not the product token.

| Token          | Derived from `--radius` (0.75rem) | Typical use                     |
| -------------- | --------------------------------- | ------------------------------- |
| `rounded-sm`   | `calc(0.75rem × 0.75)`            | Small elements, badges          |
| `rounded-md`   | `calc(0.75rem × 0.875)`           | Buttons, inputs                 |
| `rounded-lg`   | `0.75rem`                         | Compact containers              |
| `rounded-xl`   | `calc(0.75rem × 1.25)`            | Larger product panels           |
| `rounded-2xl`  | ~1rem (fixed scale)               | Product cards, standard glass   |
| `rounded-3xl`  | ~1.5rem (fixed scale)             | Marketing feature cards, heroes |
| `rounded-full` | `9999px`                          | Pills, circular elements        |

### Spacing

- Base scale: Tailwind defaults; `--spacing` in `:root` is **0.2rem** where the system defines tight rhythm.
- **App pages:** often `px-6 py-8` with `max-w-7xl`.
- **Hero sections:** often `gap-y-10`, `px-6 py-16`, `max-w-7xl`.

### Shadow tokens

Use Tailwind shadow utilities backed by custom properties:

| Token        | Approx. size  | Typical use            |
| ------------ | ------------- | ---------------------- |
| `shadow-2xs` | 1px           | Subtle depth           |
| `shadow-xs`  | 2px           | Small controls         |
| `shadow-sm`  | 3px           | Buttons, small cards   |
| `shadow`     | 4px (default) | Standard cards         |
| `shadow-md`  | 6px           | Elevated cards         |
| `shadow-lg`  | 15px          | Glass cards, dropdowns |
| `shadow-xl`  | 25px          | Modals, hero emphasis  |
| `shadow-2xl` | 50px          | Maximum elevation      |

**Hover:** Increase shadow on interactive surfaces for feedback, e.g. `transition hover:shadow-xl`.

---

## Brand gradients and utilities

Defined in `@layer utilities` in [`globals.css`](../../src/app/globals.css). Prefer these over ad-hoc gradient strings.

| Class                                       | Use                                                              |
| ------------------------------------------- | ---------------------------------------------------------------- |
| `gradient-brand`                            | Static brand strip (badges, decorative bars)                     |
| `gradient-brand-interactive`                | Hover/focus-capable brand fills                                  |
| `brand-fill` / `brand-fill-interactive`     | Solid primary + interaction states                               |
| `gradient-glow`                             | Soft background orbs (often with `blur-3xl`, controlled opacity) |
| `gradient-text` / `gradient-text-symmetric` | Headline gradient text; dark mode variants exist                 |

**Narrative gradient in hero titles:** Apply gradient to **one word or a short phrase**, not the entire heading line.

Example keyword styling (also listed under [Hero / marketing pages](#1-hero--marketing-pages)):

```txt
from-primary via-accent to-primary bg-linear-to-r bg-clip-text text-transparent
```

---

## Glassmorphism

Glassmorphism is a core visual language: depth through transparency, blur, and peach/plum borders. **Do not** mix opaque panels with glass in the same component group without intent.

**Recipe (no `--glass-*` tokens):** After Hours glass is `bg-card/*` (or `bg-panel/*`) + `border-panel-border/*` or `border-primary/*` alpha + `backdrop-blur-*`. Prefer shared helpers ([`marketing-glass-surface.ts`](../../src/app/(marketing)/_shared/marketing-glass-surface.ts), [`header-shell.ts`](../../src/components/shared/nav/header-shell.ts)) over inventing new frosted whites. Cold `bg-white/30` / `stone-*` washes are Progress Jam leftovers — do not reintroduce them.

### Intensity layers

| Intensity | Background (light) | Border                       | Blur                | Typical use       |
| --------- | ------------------ | ---------------------------- | ------------------- | ----------------- |
| Light     | `bg-card/40`       | `border-panel-border/40`     | `backdrop-blur-sm`  | Subtle overlays   |
| Medium    | `bg-card/50`–`/60` | `border-panel-border/50`     | `backdrop-blur-md`  | Cards, containers |
| Heavy     | `bg-card/70`–`/80` | `border-panel-border/60`     | `backdrop-blur-xl`  | Primary panels    |
| Intense   | `bg-card/85`–`/90` | `border-primary/30`          | `backdrop-blur-2xl` | Modals, dropdowns |

**Dark mode:** Prefer `dark:bg-card/40`–`/60` and `dark:border-panel-border/50`–`/60` (or soft `dark:border-primary/20`); always verify contrast on nocturne.

### Reference patterns

**Standard glass card**

```tsx
<div className='rounded-2xl border border-panel-border/50 bg-card/50 shadow-lg backdrop-blur-xl dark:border-panel-border/60 dark:bg-panel/50'>
  {/* Content */}
</div>
```

**Interactive glass card**

```tsx
className =
  'rounded-2xl border border-panel-border/50 bg-card/50 p-6 shadow-lg backdrop-blur-xl transition hover:-translate-y-1 hover:shadow-xl hover:border-primary/30 dark:border-panel-border/60 dark:bg-panel/50';
```

**Marketing / feature card (interactive)**

```tsx
className =
  'relative overflow-hidden rounded-4xl border border-panel-border/50 bg-card/50 p-8 shadow-xl backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-2xl dark:border-panel-border/60 dark:bg-panel/50';
```

Used for rich marketing sections (e.g. Team, Values, Mission, integrations). For pricing and conditional layouts, prefer `Card` from `@/components/ui/card` with `className` overrides. Shared surfaces live in `marketing-glass-surface.ts`.

**Navigation bar**

```tsx
className =
  'rounded-2xl border border-primary/20 bg-card/70 px-6 py-3 shadow-lg backdrop-blur-md dark:border-primary/25 dark:bg-card/55';
```

**Input containers**

```tsx
className =
  'rounded-3xl border border-panel-border/50 bg-card/70 px-6 py-5 shadow-2xl backdrop-blur-xl';
```

**Completed / success tint**

```tsx
className =
  'border-success/40 bg-success/10 backdrop-blur-sm dark:border-success/30 dark:bg-success/15';
```

**Badge on dark or gradient background**

```tsx
className =
  'rounded-full bg-white/20 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm';
```

### Liquid glass / refraction

Liquid glass is a **separate visual layer** from glassmorphism. It refracts live DOM pixels through an SVG displacement lens instead of simulating depth with alpha and blur alone.

| | Glassmorphism | Liquid glass |
| -- | ------------- | ------------ |
| Mechanism | Alpha + `backdrop-blur` + borders | SVG `feDisplacementMap` lens (`filter: url(#id)`) |
| Default scope | Marketing cards, legacy fallback | Shared site header + opt-in CTAs |
| Product UI | Never on `Surface` / dense shells | Header chrome only |

**Do not use liquid glass on:**

- `Surface` and other shared product shells
- Dashboard, settings, and plan-generation page content
- Dense forms, data tables, modals, or any UI where legibility and interaction density matter

Header-only by default: site header chrome uses liquid glass on marketing routes and protected app routes (`/dashboard`, `/plans`, `/settings`, `/analytics`, and `/account`). Keep product page surfaces, cards, forms, and dense workflows opaque unless there is a separate design review.

#### Import path

```tsx
import {
  LiquidGlass,
  MARKETING_CTA_PHYSICS,
  MARKETING_HEADER_PHYSICS,
  PRICING_HEADER_PHYSICS,
} from '@/components/shared/liquid-glass';
```

Use `LiquidGlass` as a client wrapper around children. Pass `fallbackClassName` with the existing glassmorphism shell classes so reduced-motion and unsupported browsers degrade gracefully.

#### Marketing presets

| Preset | Constant | When to use |
| ------ | -------- | ----------- |
| Header (default) | `MARKETING_HEADER_PHYSICS` | Shared nav shell on marketing and protected app routes |
| Header (subtle) | `PRICING_HEADER_PHYSICS` | `/pricing` — set `intensity="subtle"` on `LiquidGlass` |
| CTA (opt-in) | `MARKETING_CTA_PHYSICS` | Button-sized lenses on marketing CTAs only |

`intensity="subtle"` resolves to `PRICING_HEADER_PHYSICS` (lower `scale`, `chroma`, and edge highlight). Use it anywhere the header should read lighter than the default preset — today that is `/pricing`.

Do **not** apply `intensity="subtle"` to product content UI or as a global default; it is a pricing-header tuning knob.

#### Performance

- Keep the SVG filter region **small and tight** — header bar bounds (~`max-w-7xl` × ~48–56px) or button-sized CTAs, not full-viewport areas.
- **Never** attach full-viewport displacement filters to fixed chrome (nav, sticky bars). Scroll jank on iOS is the primary risk.
- Regenerate the displacement map only on resize or physics changes, not on scroll or animation frames.
- Prefer marketing presets over ad-hoc physics values; tune `scale` / `chroma` down if Safari or iOS shows jank.

#### Accessibility and browser verification

- **Reduced motion:** `LiquidGlass` skips the SVG filter when `prefers-reduced-motion: reduce` is set and renders children with `fallbackClassName` (static glassmorphism). Do not bypass this path.
- **Contrast:** Verify header links, CTA labels, and borders in light and dark mode after enabling liquid glass. Refraction must not reduce text legibility below WCAG expectations for marketing or protected app routes.
- **Safari / iOS:** Test shared site header and opt-in CTAs on Safari desktop and iOS Safari. Filter IDs refresh on map updates to avoid stale-cache bugs; still confirm no hydration mismatch and acceptable scroll performance on fixed header.

When liquid glass is unavailable (feature detection) or disabled (reduced motion), fall back to the glassmorphism patterns in this section — do not leave transparent, unblurred chrome.

---

## Decorative background orbs

Hero sections use 2–3 blurred gradient orbs for depth. Rules:

- Use `blur-3xl` (or `blur-2xl`) for soft edges.
- Opacity: roughly **30–60%** in light mode; **15–30%** or `dark:opacity-20` / `dark:opacity-30` in dark mode.
- Position with `absolute` and negative offsets so shapes bleed past the container; parent should use `overflow-hidden` where needed.
- Prefer `gradient-glow` or brand-aligned gradients (`from-primary/30 to-accent/20`, etc.).

Example pair:

```tsx
<div className="from-primary/30 to-accent/20 absolute -top-20 -left-32 h-96 w-96 rounded-full bg-linear-to-br opacity-40 blur-3xl dark:opacity-20" />
<div className="absolute top-40 -right-32 h-80 w-80 rounded-full bg-linear-to-br from-cyan-200 to-blue-200 opacity-40 blur-3xl dark:opacity-15" />
```

Warm accent orb (optional third):

```tsx
<div className='absolute bottom-20 left-1/3 h-72 w-72 rounded-full bg-linear-to-br from-rose-200 to-orange-100 opacity-60 blur-3xl' />
```

---

## Page layout patterns

### 1. Hero / marketing pages

**Examples:** Pricing, Create Plan, About, Landing.

#### Heading (`h1`)

```tsx
<h1 className='mb-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl'>
  Invest in your{' '}
  <span className='bg-linear-to-r from-primary via-accent to-primary bg-clip-text text-transparent'>
    growth
  </span>
</h1>
```

| Property       | Value                                                                      |
| -------------- | -------------------------------------------------------------------------- |
| Font size      | `text-3xl` → `sm:text-4xl` → `lg:text-5xl`                                 |
| Weight         | `font-bold`                                                                |
| Tracking       | `tracking-tight`                                                           |
| Color          | `text-foreground`; gradient on keyword via `bg-clip-text text-transparent` |
| Bottom spacing | `mb-2`                                                                     |

#### Subtitle

```tsx
<p className='mx-auto max-w-md text-base text-muted-foreground sm:max-w-xl sm:text-lg'>
  Description text here.
</p>
```

| Property  | Value                               |
| --------- | ----------------------------------- |
| Font size | `text-base` → `sm:text-lg`          |
| Color     | `text-muted-foreground`             |
| Max width | `max-w-md` → `sm:max-w-xl`          |
| Centering | `mx-auto` with parent `text-center` |

#### Header container

```tsx
<div className='relative z-10 mb-5 text-center sm:mb-6'>
  {/* h1 + subtitle */}
</div>
```

#### Page container (hero)

```tsx
<div className="relative mx-auto flex min-h-screen max-w-7xl flex-col items-center justify-start gap-y-10 overflow-hidden px-6 py-16">
```

| Property    | Value                                      |
| ----------- | ------------------------------------------ |
| Max width   | `max-w-7xl`                                |
| Padding     | `px-6 py-16`                               |
| Section gap | `gap-y-10`                                 |
| Layout      | `flex flex-col items-center justify-start` |

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
│   ├── Heading: text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight
│   ├── Subtitle: text-base sm:text-lg, text-muted-foreground, max-w-md sm:max-w-xl
│   ├── Layout: centered (text-center, items-center, mx-auto)
│   ├── Container: px-6 py-16, gap-y-10
│   └── Decorative: gradient orbs; gradient keyword in heading
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

| Variant             | When                                                    |
| ------------------- | ------------------------------------------------------- |
| `default`           | Primary actions (`bg-primary`)                          |
| `secondary`         | Secondary actions                                       |
| `outline` / `ghost` | Tertiary actions, toolbars                              |
| `destructive`       | Delete / irreversible                                   |
| `link`              | Text styled as a button                                 |
| `cta`               | Prominent marketing CTAs (strong shadow, lift on hover) |

Sizes include `default` (h-9), `sm`, `lg`, `icon*`. Keep focus visible: `ring-ring/50`, `border-ring` patterns as implemented.

### Card

- Use `Card` from `@/components/ui/card` for product UI.
- Glass-style marketing cards: follow [Glassmorphism](#glassmorphism).

---

## Global shell

| Element    | Pattern                                                                            |
| ---------- | ---------------------------------------------------------------------------------- |
| **Root**   | `next-themes` with `class` on `<html>` (`light` / `dark`)                          |
| **Body**   | Work Sans + Sora CSS variables, `antialiased`, `flex min-h-screen flex-col` |
| **Header** | Site header; main content offset with `pt-16` in layout                            |
| **Footer** | Brand, footer navigation (e.g. About, Pricing), copyright                          |

Each page should expose a proper `main` landmark where applicable.

---

## Interactive states

**Hover (glass cards):** e.g. `transition hover:-translate-y-1 hover:shadow-xl`.

**Hover (borders):** e.g. `hover:border-primary/30 dark:hover:border-primary/50`.

**Focus:** Prefer ring utilities aligned with tokens, e.g. `focus:ring-2 focus:ring-ring focus:ring-offset-2` (match existing components).

**Disabled:** e.g. `disabled:opacity-50 disabled:cursor-not-allowed` with muted semantics.

---

## Accessibility and motion

- **Landmarks:** Use `main`, and consistent header/footer patterns on marketing pages.
- **Theme:** Respect system default; keep the header theme control reachable.
- **Motion:** Buttons and `cta` use subtle translate/shadow transitions; avoid heavy parallax unless specified.

Verify **contrast** on `background`, `card`, and `border` in both themes for new surfaces.

---

## Do’s and don’ts

### Do

- Use semantic color tokens (`bg-primary`, `text-muted-foreground`, …).
- Apply glassmorphism with consistent blur and transparent backgrounds.
- Use global gradient utilities (`.gradient-brand`, `.gradient-text`, …).
- Keep border radius consistent within component families.
- Test **light and dark** modes.

### Don’t

- Hard-code hex/rgb for product chrome.
- Mix glass and opaque treatments in the same component group without a deliberate pattern.
- Use inconsistent blur steps—prefer `backdrop-blur-sm`, `-md`, `-xl`, `-2xl` intentionally.
- Ship glass without dark-mode border/background adjustments.
- Over-use gradient text (headlines and emphasis only).

---

## Implementation checklist (PRs)

- [ ] Colors use semantic tokens, not one-off hex.
- [ ] Headings follow **app base** (`<h1>`–`<h6>`) or **marketing** (documented utilities / `.marketing-*`), not ad-hoc font sizes.
- [ ] Hero/marketing vs app layout matches the [decision tree](#quick-decision-tree-hero-vs-app).
- [ ] Spacing aligns with established containers (`max-w-7xl`, `px-6`, `py-8` app / `py-16` hero).
- [ ] Primary actions use `Button` variants; marketing emphasis uses `cta` or documented gradients.
- [ ] Dark mode: contrast checked on `background`, `card`, `border`.

---

## Appendix: design audit snapshot (Chrome DevTools)

|                     |                                                   |
| ------------------- | ------------------------------------------------- |
| **When**            | 2026-03-30                                        |
| **Environment**     | Local dev (`pnpm dev`), `http://localhost:3000`   |
| **Routes reviewed** | `/dashboard`, `/landing`, `/pricing`, `/about`    |
| **Themes**          | Dark (default session) and Light (header control) |

**Checks performed:** Navigation with browser tooling; accessibility tree landmarks (`banner`, `main`, `contentinfo`); computed styles for body font, sample `h1`, theme class on `<html>`, CSS variables resolving in DevTools.

**Follow-ups noted in pass**

- About hero heading had missing space before “AI” in copy—fix in content, not tokens.
- Landing “Features” used emoji bullets; for stricter branding, consider icon components or monochrome marks.

_Refresh this appendix after major visual releases or when validating production URLs._

---

## Related source files

| File                                                                 | Role                         |
| -------------------------------------------------------------------- | ---------------------------- |
| [`src/app/globals.css`](../../src/app/globals.css)                   | Tokens, base type, utilities |
| [`src/app/layout.tsx`](../../src/app/layout.tsx)                     | Root fonts and shell         |
| [`src/components/ui/button.tsx`](../../src/components/ui/button.tsx) | Button variants              |
