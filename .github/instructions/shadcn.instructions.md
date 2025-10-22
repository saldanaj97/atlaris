---
description: Enforce shadcn/ui v3.4.2 features with Tailwind v4 and React 19
applyTo: src/**/*
---
# shadcn/ui v3.4.2 Upgrade & Usage Guidelines

Use these guidelines to generate code aligned with shadcn/ui v3.4.2, Tailwind CSS v4, and React 19.

## Core requirements

1. Keep local shadcn components up-to-date
   - Before modifying `components/ui/*`, ensure they match the latest registry.
   - When syncing components, run:

```bash
# Commit first; update overwrites existing files
git add . && git commit -m "chore: checkpoint before shadcn sync"
npx shadcn@latest add --all --overwrite
```

2. Tailwind v4 alignment
   - Leave `tailwind.config` path blank in `components.json` for v4.
   - Prefer OKLCH tokens; keep `data-slot` as the primary hook for styling parts.

3. React 19 component shape
   - Prefer simple function components over `forwardRef` unless needed for libraries/refs.
   - Add `data-slot` attributes to styleable surfaces.

Example refactor:

```tsx
function AccordionItem({ className, ...props }: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("border-b last:border-b-0", className)}
      {...props}
    />
  )
}
```

## Adopt new/updated primitives

- Spinner

```tsx
import { Spinner } from "@/components/ui/spinner"
```

- ButtonGroup

```tsx
import { ButtonGroup, ButtonGroupSeparator, ButtonGroupText } from "@/components/ui/button-group"
```

- InputGroup

```tsx
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText, InputGroupTextarea } from "@/components/ui/input-group"
```

- Field / FieldGroup

```tsx
import { Field, FieldGroup } from "@/components/ui/field"
```

- Item / ItemGroup

```tsx
import { Item, ItemGroup } from "@/components/ui/item"
```

- Kbd

```tsx
import { Kbd } from "@/components/ui/kbd"
```

- Empty
  - Prefer official empty-state patterns over custom markup.

## Theming & tokens

- Use utilities backed by CSS variables (e.g., `bg-background`, `text-foreground`).
- For new brand colors, prefer registry `cssVars`:

```json
{
  "$schema": "https://ui.shadcn.com/schema/registry-item.json",
  "cssVars": {
    "light": { "brand-background": "20 14.3% 4.1%", "brand-accent": "20 14.3% 4.1%" },
    "dark": { "brand-background": "20 14.3% 4.1%", "brand-accent": "20 14.3% 4.1%" }
  }
}
```

## Deprecations / replacements

- Replace legacy `toast` with `sonner`.
- Prefer `new-york` over deprecated `default` style for new screens.
- Avoid ad-hoc loaders/adornments; use `Spinner` and `InputGroup`.

## Testing & DX

- After component updates, run:

```bash
pnpm type-check
pnpm test:unit
```

- Follow current composition patterns for updated inputs (e.g., `InputOTP`).

## PR checklist for reviewers

- `data-slot` present on styleable parts.
- No unnecessary `forwardRef` usage.
- Spinner/InputGroup/ButtonGroup/Field/Item/Kbd/Empty used where applicable.
- Tailwind v4 utilities and tokens in use.
- `sonner` used for toast notifications.
