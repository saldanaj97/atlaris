# Style Guidelines — Page Layout & Typography

This document defines the **exact** spacing, typography, and layout patterns for each page category. Use these patterns when building or editing pages to maintain visual consistency.

> **Key distinction:** Atlaris has two visual contexts — **Hero/Marketing pages** (centered, large type, decorative) and **Content/App pages** (left-aligned, compact, functional). Never mix them.

---

## 1. Hero / Marketing Pages

**Pages:** Pricing, Create Plan, About, Landing

These pages are visually rich with centered content, large responsive headings, gradient accents, and decorative background orbs.

### Heading (h1)

```tsx
<h1 className="text-foreground mb-2 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
  Invest in your{' '}
  <span className="from-primary via-accent to-primary bg-linear-to-r bg-clip-text text-transparent">
    growth
  </span>
</h1>
```

| Property       | Value                                                                             |
| -------------- | --------------------------------------------------------------------------------- |
| Font size      | `text-3xl` → `sm:text-4xl` → `lg:text-5xl` (30px → 36px → 48px)                   |
| Weight         | `font-bold`                                                                       |
| Tracking       | `tracking-tight` (-0.025em)                                                       |
| Color          | `text-foreground` (base), gradient on keyword via `bg-clip-text text-transparent` |
| Bottom spacing | `mb-2`                                                                            |

**Gradient keyword pattern:** Always apply the gradient to a single meaningful word or short phrase (e.g., "learn", "growth"), not the entire heading. Use:

```
from-primary via-accent to-primary bg-linear-to-r bg-clip-text text-transparent
```

### Subtitle

```tsx
<p className="text-muted-foreground mx-auto max-w-md text-base sm:max-w-xl sm:text-lg">
  Description text here.
</p>
```

| Property  | Value                                           |
| --------- | ----------------------------------------------- |
| Font size | `text-base` → `sm:text-lg` (16px → 18px)        |
| Color     | `text-muted-foreground`                         |
| Max width | `max-w-md` → `sm:max-w-xl`                      |
| Centering | `mx-auto` (inherited from parent `text-center`) |

### Header Container

```tsx
<div className="relative z-10 mb-5 text-center sm:mb-6">
  {/* h1 + subtitle */}
</div>
```

| Property      | Value                                   |
| ------------- | --------------------------------------- |
| Alignment     | `text-center`                           |
| Bottom margin | `mb-5` → `sm:mb-6`                      |
| Stacking      | `relative z-10` (above decorative orbs) |

### Page Container (Hero)

```tsx
<div className="relative mx-auto flex min-h-screen max-w-7xl flex-col items-center justify-start gap-y-10 overflow-hidden px-6 py-16">
```

| Property    | Value                                      |
| ----------- | ------------------------------------------ |
| Max width   | `max-w-7xl`                                |
| Padding     | `px-6 py-16`                               |
| Section gap | `gap-y-10`                                 |
| Layout      | `flex flex-col items-center justify-start` |

### Decorative Background Orbs

Hero pages use 2-3 blurred gradient orbs for ambient depth. Use the `gradient-glow` utility or manual gradient classes:

```tsx
{
  /* Primary orb — top left */
}
<div className="from-primary/30 to-accent/20 absolute -top-20 -left-32 h-96 w-96 rounded-full bg-linear-to-br opacity-40 blur-3xl dark:opacity-20" />;

{
  /* Accent orb — right */
}
<div className="absolute top-40 -right-32 h-80 w-80 rounded-full bg-linear-to-br from-cyan-200 to-blue-200 opacity-40 blur-3xl dark:opacity-15" />;
```

**Rules:**

- Use `blur-3xl` for soft edges
- Opacity: 30–60% light, 15–30% dark
- Position with `absolute` + negative offsets to bleed beyond container
- Parent must have `overflow-hidden` (or `overflow-hidden` on a wrapper)

### Marketing CSS Classes (Alternative)

For the **Landing** and **About** pages specifically, the custom marketing typography classes from `globals.css` are also acceptable:

| Class                 | Desktop | Mobile | Use                                 |
| --------------------- | ------- | ------ | ----------------------------------- |
| `.marketing-h1`       | 49px    | 39px   | Hero headlines                      |
| `.marketing-h2`       | 39px    | 31px   | Section headlines                   |
| `.marketing-h3`       | 31px    | 25px   | Feature titles                      |
| `.marketing-h4`       | 25px    | 20px   | Card titles                         |
| `.marketing-subtitle` | 20px    | 16px   | Subheadings                         |
| `.gradient-text`      | —       | —      | Full-text gradient (primary→accent) |

> **When to use which:** Use the Tailwind responsive utility approach (`text-3xl sm:text-4xl lg:text-5xl`) for **interactive/product pages** (Pricing, Create Plan). Use `.marketing-h1`/`.marketing-h2` for **static marketing pages** (Landing, About) where the CSS scale provides better control.

---

## 2. Content / App Pages

**Pages:** Dashboard, Plans, Settings (all sub-pages), Analytics (Usage, Achievements)

These pages are functional with left-aligned headings, compact spacing, and no decorative elements.

### Page Container (App)

```tsx
<div className="mx-auto min-h-screen max-w-7xl px-6 py-8">
```

| Property   | Value          |
| ---------- | -------------- |
| Max width  | `max-w-7xl`    |
| Padding    | `px-6 py-8`    |
| Min height | `min-h-screen` |

### Page Header

```tsx
<div className="mb-6">
  <h1>Page Title</h1>
  <p className="subtitle">Optional description.</p>
</div>
```

| Property      | Value                                                                                 |
| ------------- | ------------------------------------------------------------------------------------- |
| Heading       | `<h1>` — inherits base style: 24px, `font-weight: heading`, `letter-spacing: -0.02em` |
| Subtitle      | `.subtitle` class — `color: muted-foreground`, base font-weight                       |
| Header margin | `mb-6`                                                                                |

> The base `h1` style (24px) comes from `globals.css`. Do **not** add `text-xl` or other sizing — just use a plain `<h1>`.

### Settings Page Header

Settings pages use a slightly different heading pattern with explicit classes:

```tsx
<div className="mb-6">
  <h2 className="text-xl font-semibold">Settings Section</h2>
  <p className="text-muted-foreground text-sm">Helper description.</p>
</div>
```

| Property      | Value                                  |
| ------------- | -------------------------------------- |
| Heading       | `text-xl font-semibold` (20px)         |
| Description   | `text-muted-foreground text-sm` (14px) |
| Header margin | `mb-6`                                 |

### Card Grids

```tsx
<div className="grid gap-6 md:grid-cols-2">{/* Cards */}</div>;

{
  /* Or for 3-column layouts: */
}
<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{/* Cards */}</div>;
```

| Property    | Value                                                                      |
| ----------- | -------------------------------------------------------------------------- |
| Gap         | `gap-6`                                                                    |
| Breakpoints | `md:grid-cols-2` (settings) or `sm:grid-cols-2 lg:grid-cols-3` (analytics) |

### Card Interior Spacing

```tsx
<Card className="p-6">
  <h3 className="mb-4 text-xl font-semibold">Card Title</h3>
  <p className="text-muted-foreground text-sm">Description</p>
  <div className="space-y-4">{/* Card content */}</div>
</Card>
```

| Property    | Value                               |
| ----------- | ----------------------------------- |
| Padding     | `p-6`                               |
| Title       | `text-xl font-semibold` with `mb-4` |
| Description | `text-muted-foreground text-sm`     |
| Content gap | `space-y-4` or `space-y-5`          |

---

## 3. Base Typography Scale (globals.css)

These are the inherited heading sizes from the base layer. They apply automatically to plain `<h1>`–`<h6>` elements:

| Element | Size            | Line Height | Letter Spacing |
| ------- | --------------- | ----------- | -------------- |
| `h1`    | 24px (1.5rem)   | 1.25        | -0.02em        |
| `h2`    | 20px (1.25rem)  | 1.3         | -0.015em       |
| `h3`    | 18px (1.125rem) | 1.35        | -0.01em        |
| `h4`    | 16px (1rem)     | 1.4         | -0.01em        |
| `h5`    | 14px (0.875rem) | 1.4         | 0              |
| `h6`    | 12px (0.75rem)  | 1.5         | 0, uppercase   |

All headings use `font-family: var(--font-family-heading)` (Geist) and `font-weight: var(--font-weight-heading)`.

---

## 4. Gradient Utilities Reference

Defined in `globals.css` `@layer utilities`. Use these instead of writing inline gradients:

| Class                         | Definition                                                                      | Use For                             |
| ----------------------------- | ------------------------------------------------------------------------------- | ----------------------------------- |
| `.gradient-brand`             | `from-primary to-accent bg-gradient-to-r`                                       | Badges, highlights, static elements |
| `.gradient-brand-interactive` | Same + `hover:from-primary/90 hover:to-accent/90`                               | Buttons, clickable elements         |
| `.gradient-glow`              | `from-primary/30 to-accent/20 rounded-full bg-linear-to-br opacity-60 blur-3xl` | Decorative background orbs          |
| `.gradient-text`              | `from-primary to-accent bg-gradient-to-r bg-clip-text text-transparent`         | Full-text gradient headings         |

---

## 5. Glassmorphic Cards

All interactive feature cards share this base pattern:

```tsx
className =
  'dark:bg-card/40 relative overflow-hidden rounded-3xl border border-white/50 bg-white/40 p-8 shadow-xl backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-2xl dark:border-white/10';
```

Used in: About section cards (Team, Values, Mission), Integration cards.

For pricing cards and other cards that need conditional styling, use the `Card` component from `@/components/ui/card` with className overrides. See `docs/rules/styles/styling.md` for the full glassmorphism system.

---

## Quick Decision Tree

```
Is this a hero/landing/marketing section?
├── YES → Use Hero/Marketing pattern
│   ├── Heading: text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight
│   ├── Subtitle: text-base sm:text-lg, text-muted-foreground, max-w-md sm:max-w-xl
│   ├── Layout: centered (text-center, items-center, mx-auto)
│   ├── Container: px-6 py-16, gap-y-10
│   └── Decorative: gradient orbs, gradient keyword in heading
│
└── NO → Use Content/App pattern
    ├── Heading: plain <h1> (24px from base) or text-xl font-semibold for sections
    ├── Subtitle: .subtitle class or text-muted-foreground text-sm
    ├── Layout: left-aligned, top-down
    ├── Container: px-6 py-8, mb-6 for headers
    └── Decorative: none
```
