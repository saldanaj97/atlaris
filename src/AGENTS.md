# Source Directory (`src/`)

**Parent:** [Root AGENTS.md](../AGENTS.md)

## Overview

This directory contains all application source code. When building UI components, **ALWAYS use shadcn/ui components** from `@/components/ui` instead of plain HTML elements. This ensures consistency, accessibility, and maintainability across the application.

## UI Components - shadcn/ui

### Critical Rule: Use shadcn Components, Not Plain HTML

**NEVER use plain HTML elements when a shadcn component exists.** Always check `@/components/ui` first before creating custom elements.

**Before using any shadcn component:**

- Check if it exists in `src/components/ui/`
- If not installed, use context7 MCP to fetch the latest shadcn component documentation
- Install via `npx shadcn@latest add [component-name]` if needed

### Available shadcn/ui Components

The following components are available from shadcn/ui. Use context7 to get up-to-date documentation and examples before implementing:

#### Layout & Structure

- Accordion
- Aspect Ratio
- Card
- Collapsible
- Resizable
- Scroll Area
- Separator
- Sidebar
- Sheet

#### Navigation & Menus

- Breadcrumb
- Context Menu
- Dropdown Menu
- Menubar
- Navigation Menu
- Pagination
- Tabs

#### Forms & Inputs

- Button
- Button Group
- Calendar
- Checkbox
- Combobox
- Command
- Date Picker
- Field
- Input
- Input Group
- Input OTP
- Label
- Native Select
- Radio Group
- Select
- Slider
- Switch
- Textarea
- Toggle
- Toggle Group

#### Feedback & Overlays

- Alert
- Alert Dialog
- Dialog
- Drawer
- Empty
- Hover Card
- Popover
- Progress
- Skeleton
- Sonner (Toast notifications)
- Spinner
- Toast
- Tooltip

#### Data Display

- Avatar
- Badge
- Carousel
- Chart
- Data Table
- Item
- Kbd (Keyboard key display)
- Table
- Typography

#### Other

- Direction (RTL support)

### Component Import Pattern

```typescript
// ✅ CORRECT - Import from @/components/ui
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

// ❌ WRONG - Don't use plain HTML
<button>Click me</button>
<div className="card">...</div>
<input type="text" />
```

### Project-Specific UI Configuration

- **Style:** New York
- **Icons:** Lucide React (`lucide-react`)
- **Path alias:** `@/components/ui` → `src/components/ui`
- **RSC:** Enabled (React Server Components)

## Directory Structure

```
src/
├── app/              # Next.js App Router (pages + API routes)
├── components/       # React components
│   ├── ui/          # shadcn/ui components (DO NOT MODIFY directly)
│   ├── shared/      # Shared application components
│   ├── billing/     # Billing-related components
│   └── settings/    # Settings-related components
├── lib/             # Utility libraries and business logic
│   ├── ai/          # AI generation → see lib/ai/AGENTS.md
│   ├── api/         # API utilities, rate limiting
│   ├── config/      # Environment configuration
│   ├── db/          # Database → see lib/db/AGENTS.md
│   ├── integrations/# Third-party integrations → see lib/integrations/AGENTS.md
│   └── ...
└── hooks/           # React hooks
```

## Import Conventions

### Path Aliases

- `@/*` → `src/*`
- `@/components` → `src/components`
- `@/components/ui` → `src/components/ui`
- `@/lib` → `src/lib`
- `@/hooks` → `src/hooks`

### Component Imports

```typescript
// ✅ CORRECT
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getUserData } from '@/lib/api/users';
import { usePlanStatus } from '@/hooks/usePlanStatus';

// ❌ WRONG - Relative imports
import { Button } from '../../../components/ui/button';
```

### Type-Only Imports

Always use `import type` for type-only imports:

```typescript
import type { NavItem } from '@/lib/navigation';
import type { SubscriptionTier } from '@/lib/stripe/tier-limits';
```

## Component Patterns

### Server vs Client Components

- **Server Components** (default): No `'use client'` directive, can use async/await, access server-side APIs
- **Client Components**: Add `'use client'` at top, use hooks, handle interactivity

```typescript
// Server Component (default)
export default async function MyPage() {
  const data = await fetchData();
  return <div>{data}</div>;
}

// Client Component
'use client';
import { useState } from 'react';
export function InteractiveComponent() {
  const [count, setCount] = useState(0);
  return <Button onClick={() => setCount(count + 1)}>{count}</Button>;
}
```

### Component Organization

- **Shared components** (`components/shared/`): Used across multiple pages/features
- **Feature components** (`components/billing/`, `components/settings/`): Feature-specific
- **UI components** (`components/ui/`): shadcn components (do not modify directly)

## Logging

### Server Components & API Routes

```typescript
import { logger } from '@/lib/logging/logger';

logger.info('User action', { userId, action: 'plan_created' });
logger.error('Operation failed', { error, context });
```

### Client Components

```typescript
'use client';
import { clientLogger } from '@/lib/logging/client';

clientLogger.info('Component mounted', { componentName });
```

**Never use `console.*` in application code.**

## Environment Variables

**NEVER use `process.env` directly.** Always access through:

```typescript
import { env } from '@/lib/config/env';

const apiKey = env.OPENROUTER_API_KEY;
```

## Anti-Patterns

- ❌ Using plain HTML elements (`<button>`, `<input>`, `<div>` for cards) when shadcn components exist
- ❌ Modifying components in `src/components/ui/` directly (these are shadcn components)
- ❌ Using `process.env.*` directly (use `@/lib/config/env`)
- ❌ Using `console.*` (use logger from `@/lib/logging/logger` or `@/lib/logging/client`)
- ❌ Relative imports (`../../../components/...`)
- ❌ Importing server logger in client components
- ❌ Using `any` or `unknown` types (use proper TypeScript types)

## Related Documentation

- [Root AGENTS.md](../AGENTS.md) - Project-wide guidelines
- [lib/ai/AGENTS.md](lib/ai/AGENTS.md) - AI generation patterns
- [lib/db/AGENTS.md](lib/db/AGENTS.md) - Database patterns
- [lib/integrations/AGENTS.md](lib/integrations/AGENTS.md) - Integration patterns
- [tests/AGENTS.md](../tests/AGENTS.md) - Testing patterns
- [docs/rules/api/error-contract.md](../docs/rules/api/error-contract.md) - Canonical API error shape and client parsing rules
