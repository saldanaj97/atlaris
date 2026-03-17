# Styling Guidelines

This document defines the visual design system for Atlaris, ensuring consistency across all components and pages.

## Color System

All colors are defined using OKLCH color space in `src/app/globals.css`. **Never hardcode color values**—always use CSS variables or Tailwind semantic classes.

### Core Semantic Colors

| Token                  | Light Mode Purpose                      | Usage                        |
| ---------------------- | --------------------------------------- | ---------------------------- |
| `--background`         | Page background (white)                 | `bg-background`              |
| `--foreground`         | Primary text (dark gray)                | `text-foreground`            |
| `--card`               | Card backgrounds                        | `bg-card`                    |
| `--card-foreground`    | Card text                               | `text-card-foreground`       |
| `--primary`            | Brand purple/blue (hue ~260)            | `bg-primary`, `text-primary` |
| `--primary-foreground` | Text on primary backgrounds             | `text-primary-foreground`    |
| `--secondary`          | Subtle backgrounds                      | `bg-secondary`               |
| `--accent`             | Complementary to primary (hue ~233-265) | `bg-accent`, `text-accent`   |
| `--accent-foreground`  | Text on accent backgrounds              | `text-accent-foreground`     |
| `--muted`              | Disabled/subtle UI elements             | `bg-muted`                   |
| `--muted-foreground`   | Secondary/helper text                   | `text-muted-foreground`      |
| `--destructive`        | Error states (red/orange hue ~25)       | `bg-destructive`             |
| `--border`             | Subtle borders                          | `border-border`              |
| `--ring`               | Focus rings                             | `ring-ring`                  |

### Chart Colors

Use `--chart-1` through `--chart-5` for data visualizations. These progress from lighter to darker shades of the brand purple.

### Sidebar Colors

Dedicated tokens exist for sidebar styling: `--sidebar`, `--sidebar-foreground`, `--sidebar-primary`, `--sidebar-accent`, `--sidebar-border`.

---

## Brand Gradients (Global Utility Classes)

These utility classes are defined in `globals.css` and should be used instead of inline gradient definitions:

### `.gradient-brand`

Primary brand gradient from `primary` to `accent`. Use for:

- Badges and highlights
- Decorative elements
- Static gradient backgrounds

```tsx
<div className="gradient-brand rounded-full px-4 py-2">Badge</div>
```

### `.gradient-brand-interactive`

Same gradient with hover states (90% opacity on hover). Use for:

- Buttons
- Clickable cards
- Interactive elements

```tsx
<button className="gradient-brand-interactive rounded-full px-6 py-3 text-white">
  Get Started
</button>
```

### `.gradient-glow`

Decorative blur glow effect. Use for:

- Background decorative orbs
- Ambient lighting effects
- Hero section backgrounds

```tsx
<div className="gradient-glow absolute -top-20 -left-20 h-96 w-96" />
```

### `.gradient-text`

Gradient text effect with transparent background. Use for:

- Headlines
- Accent text
- Marketing copy highlights

```tsx
<h1 className="gradient-text text-4xl font-bold">Atlaris</h1>
```

---

## Glassmorphism Design System

Glassmorphism is the core visual language of Atlaris. It creates depth through transparency, blur, and subtle borders.

### Core Glassmorphism Pattern

The standard glassmorphism card combines these properties:

```tsx
// Standard glass card
<div className="rounded-2xl border border-white/40 bg-white/30 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-stone-900/30">
  {/* Content */}
</div>
```

### Glassmorphism Layers (by intensity)

| Intensity | Background       | Border            | Blur                | Use Case            |
| --------- | ---------------- | ----------------- | ------------------- | ------------------- |
| Light     | `bg-white/30`    | `border-white/40` | `backdrop-blur-sm`  | Subtle overlays     |
| Medium    | `bg-white/40-50` | `border-white/50` | `backdrop-blur-md`  | Cards, containers   |
| Heavy     | `bg-white/60-80` | `border-white/60` | `backdrop-blur-xl`  | Primary UI elements |
| Intense   | `bg-white/80-90` | `border-white/70` | `backdrop-blur-2xl` | Modals, dropdowns   |

### Dark Mode Glassmorphism

In dark mode, invert the approach:

```tsx
// Dark mode glass card
<div className="dark:border-white/10 dark:bg-stone-900/30 dark:backdrop-blur-xl">
```

Or using the card token:

```tsx
<div className="dark:border-white/10 dark:bg-card/60">
```

### Glassmorphism Components Reference

**Navigation bars:**

```tsx
className =
  'rounded-2xl border border-white/40 bg-white/30 px-6 py-3 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-card/50';
```

**Feature cards:**

```tsx
className =
  'overflow-hidden rounded-3xl border border-white/50 bg-white/40 p-8 shadow-xl backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-2xl';
```

**Input containers:**

```tsx
className =
  'rounded-3xl border border-white/50 bg-white/60 px-6 py-5 shadow-2xl backdrop-blur-xl';
```

**Completed state cards:**

```tsx
className =
  'border-green-200/50 bg-green-50/30 backdrop-blur-sm dark:border-green-800/30 dark:bg-green-950/20';
```

---

## Decorative Background Orbs

Landing pages and hero sections use blurred gradient orbs for ambient depth:

```tsx
{
  /* Primary brand orb */
}
<div className="from-primary/40 to-accent/30 absolute top-20 -left-20 h-96 w-96 rounded-full bg-linear-to-br opacity-60 blur-3xl" />;

{
  /* Cyan accent orb */
}
<div className="absolute top-40 -right-20 h-80 w-80 rounded-full bg-linear-to-br from-cyan-200 to-blue-200 opacity-60 blur-3xl" />;

{
  /* Warm accent orb */
}
<div className="absolute bottom-20 left-1/3 h-72 w-72 rounded-full bg-linear-to-br from-rose-200 to-orange-100 opacity-60 blur-3xl" />;
```

**Guidelines:**

- Use `blur-2xl` or `blur-3xl` for soft edges
- Keep opacity between 30-60%
- Position with `absolute` and negative offsets to extend beyond containers
- Use `gradient-glow` utility class when appropriate
- In dark mode, reduce opacity: `dark:opacity-30`

---

## Shadow System

Shadows are defined as CSS custom properties. Use Tailwind's shadow utilities:

| Token        | Size          | Use Case                       |
| ------------ | ------------- | ------------------------------ |
| `shadow-2xs` | 1px           | Subtle depth hints             |
| `shadow-xs`  | 2px           | Small interactive elements     |
| `shadow-sm`  | 3px           | Buttons, small cards           |
| `shadow`     | 4px (default) | Standard cards                 |
| `shadow-md`  | 6px           | Elevated cards                 |
| `shadow-lg`  | 15px          | Glassmorphism cards, dropdowns |
| `shadow-xl`  | 25px          | Modals, hero elements          |
| `shadow-2xl` | 50px          | Maximum elevation              |

**Hover states:** Increase shadow on hover for interactive feedback:

```tsx
className = 'shadow-lg transition hover:shadow-xl';
```

---

## Border Radius

The design system uses generous border radius defined by `--radius: 2rem`:

| Token          | Value              | Use Case                    |
| -------------- | ------------------ | --------------------------- |
| `rounded-sm`   | `calc(2rem - 4px)` | Small elements, badges      |
| `rounded-md`   | `calc(2rem - 2px)` | Buttons, inputs             |
| `rounded-lg`   | `2rem`             | Cards, containers           |
| `rounded-xl`   | `calc(2rem + 4px)` | Large cards, hero elements  |
| `rounded-2xl`  | ~1rem              | Standard glass cards        |
| `rounded-3xl`  | ~1.5rem            | Feature cards, landing page |
| `rounded-full` | 9999px             | Pills, circular elements    |

---

## Typography

### Font Families

- **Sans (default):** Geist with system fallbacks
- **Serif:** Source Serif 4 (for editorial content)
- **Mono:** JetBrains Mono (for code)

### Marketing Typography

Use these classes for landing/marketing pages:

| Class                 | Size (desktop) | Use Case          |
| --------------------- | -------------- | ----------------- |
| `.marketing-h1`       | 49px           | Hero headlines    |
| `.marketing-h2`       | 39px           | Section headlines |
| `.marketing-h3`       | 31px           | Feature titles    |
| `.marketing-h4`       | 25px           | Card titles       |
| `.marketing-subtitle` | 20px           | Subheadings       |

### App Typography

Standard HTML headings (`h1`-`h6`) use a smaller scale optimized for dashboards and app UI.

---

## Interactive States

### Hover Effects

Standard hover pattern for glass cards:

```tsx
className = 'transition hover:-translate-y-1 hover:shadow-xl';
```

For borders:

```tsx
className = 'hover:border-primary/30 dark:hover:border-primary/50';
```

### Focus States

Use ring utilities for focus:

```tsx
className = 'focus:ring-2 focus:ring-ring focus:ring-offset-2';
```

### Disabled States

Use muted colors:

```tsx
className = 'disabled:opacity-50 disabled:cursor-not-allowed';
```

---

## Do's and Don'ts

### Do

- Use semantic color tokens (`bg-primary`, `text-muted-foreground`)
- Apply glassmorphism consistently with backdrop-blur and transparent backgrounds
- Use the global gradient utility classes (`.gradient-brand`, `.gradient-text`, etc.)
- Maintain consistent border radius across similar components
- Test both light and dark modes

### Don't

- Hardcode hex/rgb color values
- Mix glassmorphism with opaque backgrounds in the same component group
- Use inconsistent blur intensities (stick to `backdrop-blur-sm`, `-md`, `-xl`, `-2xl`)
- Forget dark mode variants for glassmorphism (borders and backgrounds need adjustment)
- Over-use gradient text (reserve for headlines and emphasis)

---

## Quick Reference: Common Patterns

### Glass Card (Standard)

```tsx
className =
  'rounded-2xl border border-white/40 bg-white/30 p-6 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-stone-900/30';
```

### Glass Card (Interactive)

```tsx
className =
  'rounded-2xl border border-white/40 bg-white/30 p-6 shadow-lg backdrop-blur-xl transition hover:-translate-y-1 hover:shadow-xl hover:border-primary/30 dark:border-white/10 dark:bg-stone-900/30';
```

### Glass Navigation

```tsx
className =
  'rounded-2xl border border-white/40 bg-white/30 px-6 py-3 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-card/50';
```

### Glass Badge (on dark/gradient background)

```tsx
className =
  'rounded-full bg-white/20 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm';
```

### Decorative Glow Orb

```tsx
className =
  'absolute h-96 w-96 rounded-full bg-linear-to-br from-primary/40 to-accent/30 opacity-60 blur-3xl';
```

### Gradient CTA Button

```tsx
className =
  'gradient-brand-interactive rounded-full px-8 py-4 font-semibold text-white shadow-lg transition hover:shadow-xl';
```
