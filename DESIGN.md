---
version: alpha
name: Atlaris
description: Product-native learning platform design tokens for agents and design.md tooling. Brand palette is After Hours (peach/copper accent on plum ink and parchment surfaces).
colors:
  background: "#f4ebe1"
  foreground: "#26102a"
  card: "#faf4ec"
  card-foreground: "#26102a"
  primary: "#c96d42"
  primary-dark: "#984c2c"
  primary-foreground: "#f4ebe1"
  secondary: "#e6d5c9"
  secondary-foreground: "#6e5268"
  muted: "#efe5db"
  muted-foreground: "#6e5268"
  accent: "#e6d5c9"
  accent-foreground: "#c96d42"
  destructive: "oklch(0.64 0.21 25.39)"
  success: "oklch(0.52 0.14 155)"
  success-foreground: "oklch(0.99 0 0)"
  panel: "#faf4ec"
  panel-foreground: "#26102a"
  panel-muted: "#efe5db"
  panel-border: "#c9a898"
  warning: "oklch(0.75 0.15 85)"
  warning-foreground: "oklch(0.22 0.04 85)"
  border: "#c9a898"
  input: "#c9a898"
  ring: "#c96d42"
  chart-1: "#c96d42"
  chart-2: "#984c2c"
  chart-3: "#8b4560"
  chart-4: "#6e5268"
  chart-5: "#26102a"
  dark-background: "#180d18"
  dark-foreground: "#f8ead7"
  dark-card: "#2b1728"
  dark-card-foreground: "#f8ead7"
  dark-panel: "#2b1728"
  dark-panel-border: "#7a4b62"
typography:
  app-h1:
    fontFamily: "Work Sans"
    fontSize: 1.5rem
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  app-h2:
    fontFamily: "Work Sans"
    fontSize: 1.25rem
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.015em"
  app-h3:
    fontFamily: "Work Sans"
    fontSize: 1.125rem
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.01em"
  body-sm:
    fontFamily: "Work Sans"
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.5
  body-md:
    fontFamily: "Work Sans"
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.5
  button-label:
    fontFamily: "Work Sans"
    fontSize: 0.875rem
    fontWeight: 500
    lineHeight: 1.25
  label-caps:
    fontFamily: "Work Sans"
    fontSize: 0.75rem
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: 0.04em
  marketing-h1:
    fontFamily: "Sora"
    fontSize: 3.0625rem
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  marketing-h2:
    fontFamily: "Sora"
    fontSize: 2.4375rem
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.025em"
rounded:
  sm: 0.5625rem
  md: 0.65625rem
  lg: 0.75rem
  xl: 0.9375rem
  marketing: 2rem
  full: 9999px
spacing:
  base: 0.2rem
  xs: 0.5rem
  sm: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 4rem
components:
  button-primary:
    backgroundColor: "{colors.primary-dark}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.button-label}"
    rounded: "{rounded.md}"
    height: 2.25rem
    padding: "0.5rem 1rem"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    typography: "{typography.button-label}"
    rounded: "{rounded.md}"
    height: 2.25rem
    padding: "0.5rem 1rem"
  product-card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.xl}"
    padding: 1.5rem
  product-surface:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.panel-foreground}"
    rounded: "{rounded.xl}"
    padding: 1.25rem
  focus-ring:
    backgroundColor: "{colors.ring}"
    size: 3px
---

# Atlaris DESIGN.md

## Overview

Atlaris is a focused learning product. Product surfaces should feel quiet,
dense, and operational: compact dashboard structure, clear hierarchy, and
semantic tokens over one-off color choices. Marketing surfaces can be more
expressive, but they still use the same brand palette and shared shell.

This file is the agent-facing design.md entry point. Runtime truth stays in
[`src/app/globals.css`](src/app/globals.css), with fuller usage guidance in
[`docs/styles/style-guide.md`](docs/styles/style-guide.md).

## Brand direction

**After Hours** is the live product visual direction (atlas + Polaris /
learning maps and guides). Type system: **Sora** (brand / marketing) +
**Work Sans** (product UI). Light and dark are first-class.

Locked palettes, type rules, surface language, and do/don’t live in
[`docs/styles/after-hours-direction.md`](docs/styles/after-hours-direction.md).
YAML below mirrors `globals.css` — never edit tokens here first.

## Colors

Use semantic Tailwind classes and CSS variables from `globals.css`.

The product ships **After Hours**: warm peach/copper accent against plum ink
on celestial parchment (light) or velvet nocturne (dark). Core brand hex
values:

| Role | Light | Dark |
| --- | --- | --- |
| Background | `#f4ebe1` | `#180d18` |
| Ink / foreground | `#26102a` | `#f8ead7` |
| Muted text | `#6e5268` | `#c7aeb7` |
| Accent / primary | `#c96d42` | `#f0a06e` |
| Primary fill (`primary-dark`) | `#984c2c` | `#f0a06e` |
| Soft / secondary wash | `#e6d5c9` | `#3b2135` |
| Note / muted panel | `#efe5db` | `#351b30` |
| Surface / card / panel | `#faf4ec` | `#2b1728` |
| Border / line | `#c9a898` | `#7a4b62` |
| CTA accent ink (`primary-foreground`) | `#f4ebe1` | `#1b0e19` |

- `primary` is the peach/copper brand action color.
- `primary-dark` is the solid fill for primary buttons and badges (paired
  with `primary-foreground`).
- `accent` and `secondary` use soft parchment / plum washes for emphasis
  and tinted surfaces.
- `background`, `card`, `panel`, and their foreground partners define the app
  surface stack.
- `muted-foreground` is the default for helper text and metadata.
- `destructive`, `warning`, and `success` are reserved for stateful feedback
  (functional hues kept unless contrast fails).

Page backgrounds use `--app-background-image`: soft parchment/plum radial
washes plus a warm gradient in both light and dark mode. Do not replace this
with flat fills on app shell pages.

Do not hard-code product UI hex values. Add or change tokens in
`src/app/globals.css` first, then mirror the stable public tokens here.

## Typography

Use Work Sans for all product UI: body copy, navigation, forms, controls, and
app headings. App headings are intentionally compact for dashboards and
settings screens.

Use Sora for marketing display headings through the existing `.marketing-h*`
classes (weight 600). Do not reintroduce Young Serif or a third brand face.
JetBrains Mono stays optional for true code/IDs only — not brand voice.

See
[`docs/styles/after-hours-direction.md`](docs/styles/after-hours-direction.md)
for the locked type split. Do not introduce another font without updating
`src/app/layout.tsx`, `src/app/globals.css`, and this file together.

## Layout

App pages are left-aligned, scan-friendly, and constrained. Prefer shared
layout primitives such as `PageShell`, `PageHeader`, `Surface`, `MetricCard`,
and shadcn UI components before creating new layout patterns.

Marketing pages may use centered hero composition, larger type, and glass
surfaces. Do not mix marketing hero styling into app dashboards.

Use these live routes as visual anchors:

- App dashboard: `src/app/(app)/dashboard/page.tsx` for compact page header plus
  activity feed structure.
- App creation flow: `src/app/(app)/plans/new/page.tsx` for focused product
  input and CTA density.
- App analytics: `src/app/(app)/analytics/usage/page.tsx` for data-heavy,
  product-native dashboard work.
- Marketing pricing: `src/app/(marketing)/pricing/page.tsx` for richer
  marketing layout that still uses shared components.
- Marketing landing: `src/app/(marketing)/landing/page.tsx` for display type
  and brand expression.

## Elevation & Depth

Use the Tailwind shadow utilities backed by `globals.css` shadow tokens.
Product cards usually use `shadow-sm`; interactive surfaces may rise to
`shadow-md`. The app header uses primary-tinted liquid glass (`bg-primary/*`
with backdrop blur). Reserve heavier glass depth for marketing or explicit
overlay surfaces.

## Shapes

Product controls derive from `--radius: 0.75rem`; buttons and inputs generally
use `rounded-md`, while panels and cards generally use `rounded-xl` or
`rounded-2xl`. Marketing can use larger corners through explicit utilities
(arched / large-radius cards; pill CTAs for marketing primary actions).

Avoid pill-shaped product controls unless the component is actually a badge,
tag, avatar, or circular icon button.

## Components

Prefer existing shared components in this order: shadcn primitives in
`src/components/ui`, product wrappers such as `Surface` and `PageShell`, then
route-local components. Add a new shared component only when two real call
sites need the same behavior.

Buttons should use the existing `Button` variants. Use icons from
`lucide-react` for icon buttons and tool actions. Cards and metrics should use
semantic foreground/background tokens so light and dark modes stay aligned.

## Do's and Don'ts

- Do use semantic tokens (`bg-primary`, `text-muted-foreground`,
  `border-border`) instead of raw color values.
- Do keep app pages compact, functional, and easy to scan.
- Do keep marketing pages visually richer without changing the product token
  source.
- Do ship light and dark together for any token change.
- Don't create a new design system beside `globals.css`.
- Don't add decorative orbs, oversized hero treatments, or a third brand font
  to dashboard-style product pages.
- Don't mix Progress Jam violet with After Hours peach on the same ship.
- Don't create single-use abstractions for styling that can stay local.
