# Atlaris style guide

Single reference for **colors, tokens, typography, spacing, layout patterns, glassmorphism, components, and shell layout** so new UI stays aligned with the product.

**Source of truth:** [`src/app/globals.css`](../../src/app/globals.css) (`:root`, `.dark`, `@theme inline`, utilities), plus [`src/app/layout.tsx`](../../src/app/layout.tsx) for root fonts and structure.

---

## What this guide covers (industry-aligned scope)

Solid product style guides usually spell out: **semantic color and tokens**; **typography** (families, scales, when to use which); **spacing and layout** patterns; **elevation** (shadows, radius); **core components** (variants and usage); **accessibility** expectations; and **clear do / don’t rules** so teams do not ship one-off hex values or mixed visual languages. This document is written for that purpose. Where Atlaris uses **design tokens** (CSS variables + Tailwind), names and usage live here; implementation details stay in `globals.css`.

---

## Design contexts (do not mix)

Atlaris has two visual contexts:

| Context | Character |
| --- | --- |
| **Hero / marketing** | Centered, large responsive type, gradient accents, decorative background orbs. |
| **Content / app** | Left-aligned, compact, functional—no decorative orbs or marketing-only type scales. |

**Rule:** Pick one context per page or major section. Do not blend hero marketing patterns into dashboard-style pages, or vice versa.

A **quick decision tree** appears [later in this document](#quick-decision-tree-hero-vs-app).

---

## Color tokens

All product colors should come from **semantic tokens** in `globals.css`. They adapt in light and dark mode.

**Rule:** Do not hard-code hex or raw RGB for product UI. Use Tailwind semantic classes (`bg-primary`, `text-muted-foreground`, …) or CSS variables. Prefer `text-muted-foreground` over arbitrary grays for secondary copy.

### Semantic palette (Tailwind / roles)

| Token (Tailwind) | Role |
| --- | --- |
| `background` / `foreground` | Page surface and default text |
| `card` / `card-foreground` | Card surfaces and text on cards |
| `primary` / `primary-foreground` | Primary actions, brand emphasis |
| `primary-dark` | Gradient stops, stronger brand contrast (see utilities) |
| `accent` / `accent-foreground` | Secondary emphasis; pairs with primary in gradients |
| `muted` / `muted-foreground` | Subtle panels, helper text |
| `secondary` / `secondary-foreground` | Secondary surfaces |
| `destructive` | Errors, destructive actions |
| `success` / `success-foreground` | Positive completion states |
| `border` / `input` / `ring` | Strokes, fields, focus rings |
| `chart-1` … `chart-5` | Data visualization (brand-aligned progression) |
| `sidebar-*` | Sidebar-specific styling when used |
| `panel` / `panel-foreground` / `panel-muted` / `panel-border` | Opaque app panels, metrics, and non-glass surfaces |
| `warning` / `warning-foreground` | Caution (non-destructive) |
| `disabled` / `disabled-foreground` | Unavailable or disabled copy/surfaces |

**App chrome:** use shared [`PageShell`](../../src/components/ui/page-shell.tsx), [`PageHeader`](../../src/components/ui/page-header.tsx), [`Surface`](../../src/components/ui/surface.tsx), and [`MetricCard`](../../src/components/ui/metric-card.tsx) on product routes. Reserve glass recipes (`backdrop-blur`, `bg-white/30`, high blur) for marketing/hero, not default dashboard content.

### Light-mode mapping (reference)

| Token | Typical light-mode role |
| --- | --- |
| `--background` | Page background |
| `--foreground` | Primary text |
| `--card` / `--card-foreground` | Card fill and card text |
| `--primary` | Brand purple/blue (hue ~260° OKLCH) |
| `--primary-foreground` | Text on primary |
| `--secondary` | Subtle secondary surfaces |
| `--accent` | Complementary to primary (blue/purple range for gradients) |
| `--accent-foreground` | Text on accent |
| `--muted` / `--muted-foreground` | Disabled or subtle UI; secondary copy |
| `--destructive` | Error / danger (warm hue) |
| `--border` | Dividers and borders |
| `--ring` | Focus rings |

**Brand note:** Primary sits in a blue-violet family; accent stays in the blue/purple range so `from-primary to-accent` gradients read on-brand.

---

## Typography

### Font stacks (runtime)

| Layer | Family | Notes |
| --- | --- | --- |
| **Body (default)** | **Work Sans** (Next font on `<body>` in `layout.tsx`) | Default UI copy and elements that inherit without a heading rule. |
| **Theme / Tailwind `font-sans`** | **Geist** first in `--font-sans` | Components and utilities that use `font-sans`; marketing utilities that set heading families explicitly. |
| **Serif** | `--font-serif` → Source Serif 4 | Theme token; use sparingly. |
| **Mono** | `--font-mono` → JetBrains Mono | Code, IDs, technical strings. |
| **Neon Auth UI** | Bundled with `@neondatabase/auth/ui/tailwind` | May define font variables consumed in `globals.css`—keep auth UI inside Neon components to avoid fighting their styles. |

**Consistency:** For new screens, treat **Work Sans** as the default UI face and **Geist** (via `font-sans` or marketing classes) for display/marketing headlines. Avoid introducing a third sans unless the root layout is intentionally updated.

**Observation (dev audit):** On `/landing`, a `.marketing-h1` heading can compute to **Geist** at **49px** / **700** with tight tracking, while body text follows **Work Sans** from the root layout.

### App / dashboard base headings (`@layer base`)

Plain `<h1>`–`<h6>` in [`globals.css`](../../src/app/globals.css) use the heading font family and weight variables. Sizes:

| Tag | Size | Line height | Letter spacing | Notes |
| --- | --- | --- | --- | --- |
| `h1` | 24px (1.5rem) | 1.25 | -0.02em | Page titles in app |
| `h2` | 20px (1.25rem) | 1.3 | -0.015em | |
| `h3` | 18px (1.125rem) | 1.35 | -0.01em | |
| `h4` | 16px (1rem) | 1.4 | -0.01em | |
| `h5` | 14px (0.875rem) | 1.4 | 0 | |
| `h6` | 12px (0.75rem) | 1.5 | 0 | Uppercase |

All use `font-family: var(--font-family-heading)` (Geist) and `font-weight: var(--font-weight-heading)`.

### Marketing typography classes (`globals.css`)

| Class | Desktop | Mobile | Use |
| --- | --- | --- | --- |
| `.marketing-h1` | 49px | 39px | Hero headlines |
| `.marketing-h2` | 39px | 31px | Section headlines |
| `.marketing-h3` | 31px | 25px | Feature titles |
| `.marketing-h4` | 25px | 20px | Card titles |
| `.marketing-subtitle` | 20px | 16px | Subheadings |
| `.gradient-text` | — | — | Full-line gradient headline (`primary` → `accent`); use sparingly vs keyword span pattern |

**When to use Tailwind hero utilities vs `.marketing-*`:** Use responsive Tailwind utilities (e.g. `text-3xl sm:text-4xl lg:text-5xl`) for **interactive / product marketing pages** (e.g. Pricing, Create Plan). Use `.marketing-h1` / `.marketing-h2` for **static marketing pages** (e.g. Landing, About) where the CSS scale gives finer control.

### Subtitle / helper text

- `.subtitle` in `globals.css`: muted color, base weight.
- Common pattern: `text-muted-foreground text-sm` for settings-style helpers.

---

## Radius, spacing, and shadows

### Radius

`--radius` is **2rem** at the root; `rounded-sm` / `md` / `lg` / `xl` derive from it in `@theme inline`.

| Token | Derived from `--radius` | Typical use |
| --- | --- | --- |
| `rounded-sm` | `calc(2rem - 4px)` | Small elements, badges |
| `rounded-md` | `calc(2rem - 2px)` | Buttons, inputs |
| `rounded-lg` | `2rem` | Cards, containers |
| `rounded-xl` | `calc(2rem + 4px)` | Large cards, hero elements |
| `rounded-2xl` | ~1rem | Standard glass cards |
| `rounded-3xl` | ~1.5rem | Feature cards, landing sections |
| `rounded-full` | `9999px` | Pills, circular elements |

### Spacing

- Base scale: Tailwind defaults; `--spacing` in `:root` is **0.2rem** where the system defines tight rhythm.
- **App pages:** often `px-6 py-8` with `max-w-7xl`.
- **Hero sections:** often `gap-y-10`, `px-6 py-16`, `max-w-7xl`.

### Shadow tokens

Use Tailwind shadow utilities backed by custom properties:

| Token | Approx. size | Typical use |
| --- | --- | --- |
| `shadow-2xs` | 1px | Subtle depth |
| `shadow-xs` | 2px | Small controls |
| `shadow-sm` | 3px | Buttons, small cards |
| `shadow` | 4px (default) | Standard cards |
| `shadow-md` | 6px | Elevated cards |
| `shadow-lg` | 15px | Glass cards, dropdowns |
| `shadow-xl` | 25px | Modals, hero emphasis |
| `shadow-2xl` | 50px | Maximum elevation |

**Hover:** Increase shadow on interactive surfaces for feedback, e.g. `transition hover:shadow-xl`.

---

## Brand gradients and utilities

Defined in `@layer utilities` in [`globals.css`](../../src/app/globals.css). Prefer these over ad-hoc gradient strings.

| Class | Use |
| --- | --- |
| `gradient-brand` | Static brand strip (badges, decorative bars) |
| `gradient-brand-interactive` | Hover/focus-capable brand fills |
| `brand-fill` / `brand-fill-interactive` | Solid primary + interaction states |
| `gradient-glow` | Soft background orbs (often with `blur-3xl`, controlled opacity) |
| `gradient-text` / `gradient-text-symmetric` | Headline gradient text; dark mode variants exist |

**Narrative gradient in hero titles:** Apply gradient to **one word or a short phrase**, not the entire heading line.

Example keyword styling (also listed under [Hero / marketing pages](#1-hero--marketing-pages)):

```txt
from-primary via-accent to-primary bg-linear-to-r bg-clip-text text-transparent
```

---

## Glassmorphism

Glassmorphism is a core visual language: depth through transparency, blur, and light borders. **Do not** mix opaque panels with glass in the same component group without intent.

### Intensity layers

| Intensity | Background (light) | Border | Blur | Typical use |
| --- | --- | --- | --- | --- |
| Light | `bg-white/30` | `border-white/40` | `backdrop-blur-sm` | Subtle overlays |
| Medium | `bg-white/40-50` | `border-white/50` | `backdrop-blur-md` | Cards, containers |
| Heavy | `bg-white/60-80` | `border-white/60` | `backdrop-blur-xl` | Primary panels |
| Intense | `bg-white/80-90` | `border-white/70` | `backdrop-blur-2xl` | Modals, dropdowns |

**Dark mode:** Use `dark:border-white/10`, `dark:bg-stone-900/30` or `dark:bg-card/40`–`/60` as appropriate; always verify contrast.

### Reference patterns

**Standard glass card**

```tsx
<div className="rounded-2xl border border-white/40 bg-white/30 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-stone-900/30">
  {/* Content */}
</div>
```

**Interactive glass card**

```tsx
className =
  'rounded-2xl border border-white/40 bg-white/30 p-6 shadow-lg backdrop-blur-xl transition hover:-translate-y-1 hover:shadow-xl hover:border-primary/30 dark:border-white/10 dark:bg-stone-900/30';
```

**Marketing / feature card (interactive)**

```tsx
className =
  'dark:bg-card/40 relative overflow-hidden rounded-3xl border border-white/50 bg-white/40 p-8 shadow-xl backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-2xl dark:border-white/10';
```

Used for rich marketing sections (e.g. Team, Values, Mission, integrations). For pricing and conditional layouts, prefer `Card` from `@/components/ui/card` with `className` overrides.

**Navigation bar**

```tsx
className =
  'rounded-2xl border border-white/40 bg-white/30 px-6 py-3 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-card/50';
```

**Input containers**

```tsx
className =
  'rounded-3xl border border-white/50 bg-white/60 px-6 py-5 shadow-2xl backdrop-blur-xl';
```

**Completed / success tint**

```tsx
className =
  'border-green-200/50 bg-green-50/30 backdrop-blur-sm dark:border-green-800/30 dark:bg-green-950/20';
```

**Badge on dark or gradient background**

```tsx
className =
  'rounded-full bg-white/20 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm';
```

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
<div className="absolute bottom-20 left-1/3 h-72 w-72 rounded-full bg-linear-to-br from-rose-200 to-orange-100 opacity-60 blur-3xl" />
```

---

## Page layout patterns

### 1. Hero / marketing pages

**Examples:** Pricing, Create Plan, About, Landing.

#### Heading (`h1`)

```tsx
<h1 className="text-foreground mb-2 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
  Invest in your{' '}
  <span className="from-primary via-accent to-primary bg-linear-to-r bg-clip-text text-transparent">
    growth
  </span>
</h1>
```

| Property | Value |
| --- | --- |
| Font size | `text-3xl` → `sm:text-4xl` → `lg:text-5xl` |
| Weight | `font-bold` |
| Tracking | `tracking-tight` |
| Color | `text-foreground`; gradient on keyword via `bg-clip-text text-transparent` |
| Bottom spacing | `mb-2` |

#### Subtitle

```tsx
<p className="text-muted-foreground mx-auto max-w-md text-base sm:max-w-xl sm:text-lg">
  Description text here.
</p>
```

| Property | Value |
| --- | --- |
| Font size | `text-base` → `sm:text-lg` |
| Color | `text-muted-foreground` |
| Max width | `max-w-md` → `sm:max-w-xl` |
| Centering | `mx-auto` with parent `text-center` |

#### Header container

```tsx
<div className="relative z-10 mb-5 text-center sm:mb-6">
  {/* h1 + subtitle */}
</div>
```

#### Page container (hero)

```tsx
<div className="relative mx-auto flex min-h-screen max-w-7xl flex-col items-center justify-start gap-y-10 overflow-hidden px-6 py-16">
```

| Property | Value |
| --- | --- |
| Max width | `max-w-7xl` |
| Padding | `px-6 py-16` |
| Section gap | `gap-y-10` |
| Layout | `flex flex-col items-center justify-start` |

---

### 2. Content / app pages

**Examples:** Dashboard, Plans, Settings, Analytics.

#### Page container (app)

```tsx
<div className="mx-auto min-h-screen max-w-7xl px-6 py-8">
```

#### Page header

```tsx
<div className="mb-6">
  <h1>Page Title</h1>
  <p className="subtitle">Optional description.</p>
</div>
```

Use a plain `<h1>` for the main title—**do not** add `text-xl` or other size overrides; base styles from `globals.css` apply (24px app title).

#### Settings section header

```tsx
<div className="mb-6">
  <h2 className="text-xl font-semibold">Settings Section</h2>
  <p className="text-muted-foreground text-sm">Helper description.</p>
</div>
```

#### Card grids

```tsx
<div className="grid gap-6 md:grid-cols-2">{/* Cards */}</div>
<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{/* Wider grids */}</div>
```

#### Card interior

```tsx
<Card className="p-6">
  <h3 className="mb-4 text-xl font-semibold">Card Title</h3>
  <p className="text-muted-foreground text-sm">Description</p>
  <div className="space-y-4">{/* Content */}</div>
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

| Variant | When |
| --- | --- |
| `default` | Primary actions (`bg-primary`) |
| `secondary` | Secondary actions |
| `outline` / `ghost` | Tertiary actions, toolbars |
| `destructive` | Delete / irreversible |
| `link` | Text styled as a button |
| `cta` | Prominent marketing CTAs (strong shadow, lift on hover) |

Sizes include `default` (h-9), `sm`, `lg`, `icon*`. Keep focus visible: `ring-ring/50`, `border-ring` patterns as implemented.

### Card

- Use `Card` from `@/components/ui/card` for product UI.
- Glass-style marketing cards: follow [Glassmorphism](#glassmorphism).

---

## Global shell

| Element | Pattern |
| --- | --- |
| **Root** | `next-themes` with `class` on `<html>` (`light` / `dark`) |
| **Body** | Work Sans + Young Serif CSS variables, `antialiased`, `flex min-h-screen flex-col` |
| **Header** | Site header; main content offset with `pt-16` in layout |
| **Footer** | Brand, footer navigation (e.g. About, Pricing), copyright |

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

| | |
| --- | --- |
| **When** | 2026-03-30 |
| **Environment** | Local dev (`pnpm dev`), `http://localhost:3000` |
| **Routes reviewed** | `/dashboard`, `/landing`, `/pricing`, `/about` |
| **Themes** | Dark (default session) and Light (header control) |

**Checks performed:** Navigation with browser tooling; accessibility tree landmarks (`banner`, `main`, `contentinfo`); computed styles for body font, sample `h1`, theme class on `<html>`, CSS variables resolving in DevTools.

**Follow-ups noted in pass**

- About hero heading had missing space before “AI” in copy—fix in content, not tokens.
- Landing “Features” used emoji bullets; for stricter branding, consider icon components or monochrome marks.

*Refresh this appendix after major visual releases or when validating production URLs.*

---

## Related source files

| File | Role |
| --- | --- |
| [`src/app/globals.css`](../../src/app/globals.css) | Tokens, base type, utilities |
| [`src/app/layout.tsx`](../../src/app/layout.tsx) | Root fonts and shell |
| [`src/components/ui/button.tsx`](../../src/components/ui/button.tsx) | Button variants |
