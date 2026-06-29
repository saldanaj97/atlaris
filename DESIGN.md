---
version: alpha
name: Atlaris
description: Product-native learning platform design tokens for agents and design.md tooling.
colors:
  background: "oklch(0.985 0.004 255)"
  foreground: "oklch(0.25 0.02 60)"
  card: "oklch(1 0 0)"
  card-foreground: "oklch(0.32 0 0)"
  primary: "oklch(0.62 0.19 259.76)"
  primary-dark: "oklch(0.49 0.22 264.43)"
  primary-foreground: "oklch(1 0 0)"
  secondary: "oklch(0.97 0 0)"
  secondary-foreground: "oklch(0.45 0.03 257.68)"
  muted: "oklch(0.98 0 0)"
  muted-foreground: "oklch(0.55 0.02 264.41)"
  accent: "oklch(0.95 0.03 233.56)"
  accent-foreground: "oklch(0.38 0.14 265.59)"
  destructive: "oklch(0.64 0.21 25.39)"
  success: "oklch(0.52 0.14 155)"
  success-foreground: "oklch(0.99 0 0)"
  panel: "oklch(1 0 0)"
  panel-foreground: "oklch(0.32 0 0)"
  panel-muted: "oklch(0.98 0 0)"
  panel-border: "oklch(0.93 0.01 261.82)"
  warning: "oklch(0.75 0.15 85)"
  warning-foreground: "oklch(0.22 0.04 85)"
  border: "oklch(0.93 0.01 261.82)"
  input: "oklch(0.93 0.01 261.82)"
  ring: "oklch(0.62 0.19 259.76)"
  chart-1: "oklch(0.62 0.19 259.76)"
  chart-2: "oklch(0.55 0.22 262.96)"
  chart-3: "oklch(0.49 0.22 264.43)"
  chart-4: "oklch(0.42 0.18 265.55)"
  chart-5: "oklch(0.38 0.14 265.59)"
  dark-background: "oklch(0.2 0 0)"
  dark-foreground: "oklch(0.92 0 0)"
  dark-card: "oklch(0.27 0 0)"
  dark-card-foreground: "oklch(0.92 0 0)"
  dark-panel: "oklch(0.24 0 0)"
  dark-panel-border: "oklch(0.37 0 0)"
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
    fontFamily: "Young Serif"
    fontSize: 3.0625rem
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  marketing-h2:
    fontFamily: "Young Serif"
    fontSize: 2.4375rem
    fontWeight: 400
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

## Colors

Use semantic Tailwind classes and CSS variables from `globals.css`.

- `primary` is the blue-violet brand action color.
- `primary-dark` is the solid fill for white text on primary buttons and badges.
- `accent` supports secondary emphasis and brand gradients.
- `background`, `card`, `panel`, and their foreground partners define the app
  surface stack.
- `muted-foreground` is the default for helper text and metadata.
- `destructive`, `warning`, and `success` are reserved for stateful feedback.

Do not hard-code product UI hex values. Add or change tokens in
`src/app/globals.css` first, then mirror the stable public tokens here.

## Typography

Use Work Sans for all product UI: body copy, navigation, forms, controls, and
app headings. App headings are intentionally compact for dashboards and
settings screens.

Use Young Serif only for marketing display headings through the existing
`.marketing-h*` classes. Do not introduce another font without updating
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
`shadow-md`. Reserve heavier glass depth and backdrop blur for marketing or
explicit overlay surfaces.

## Shapes

Product controls derive from `--radius: 0.75rem`; buttons and inputs generally
use `rounded-md`, while panels and cards generally use `rounded-xl` or
`rounded-2xl`. Marketing can use larger corners through explicit utilities.

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
- Don't create a new design system beside `globals.css`.
- Don't add decorative orbs, oversized hero treatments, or serif display type
  to dashboard-style product pages.
- Don't create single-use abstractions for styling that can stay local.
