# Logging Architecture

This document defines the logging architecture for Atlaris, ensuring proper separation between server-side and client-side logging contexts.

## Architecture Overview

The codebase uses a **dual-logger architecture** with distinct implementations for server and client environments:

| Environment | Import Path            | Implementation                      | Use Case                                           |
| ----------- | ---------------------- | ----------------------------------- | -------------------------------------------------- |
| **Server**  | `@/lib/logging/logger` | Pino (structured JSON)              | API routes, server components, server actions      |
| **Client**  | `@/lib/logging/client` | Console wrapper with `'use client'` | Browser components, hooks, client error boundaries |

## Critical Rule: Never Mix Server and Client Loggers

**Client components (`'use client'`) MUST NOT import the server logger.**

The server logger (`@/lib/logging/logger`) imports Node.js-specific modules (pino, crypto, etc.) that cannot run in the browser. Attempting to use it in client components will cause:

- Build-time errors
- Runtime crashes in the browser
- Hydration mismatches

## Usage by Context

### Server-Side Code

Use in: API routes, server components (no directive), server actions, database utilities

```typescript
import { logger } from '@/lib/logging/logger';

// Basic logging
logger.info('User created plan', { userId, planId });
logger.error('Database connection failed', { error });

// Create child logger with context
const childLogger = logger.child({ requestId, userId });
childLogger.info('Processing payment');
```

### API Routes with Request Context

For API routes, use `getRequestContext()` to get a request-scoped logger with correlation IDs:

```typescript
import { getRequestContext } from '@/lib/logging/request-context';

export async function POST(request: Request) {
  const { requestId, logger } = getRequestContext();

  logger.info('Creating new plan', { userId });
  // All logs will include requestId automatically
}
```

### Client-Side Code

Use in: Components with `'use client'`, React hooks, client error boundaries

```typescript
'use client';

import { clientLogger } from '@/lib/logging/client';

export function MyClientComponent() {
  useEffect(() => {
    clientLogger.info('Component mounted');
  }, []);

  const handleError = (error: Error) => {
    clientLogger.error('Operation failed:', { error });
  };
}
```

### Error Boundaries

Error boundaries are always client components and **must use `clientLogger`**:

```typescript
'use client';

import { clientLogger } from '@/lib/logging/client';
import { useEffect } from 'react';

export default function MyErrorBoundary({ error }: { error: Error }) {
  useEffect(() => {
    clientLogger.error('Error caught:', {
      errorDigest: error.digest,
      message: error.message,
      stack: error.stack,
    });
  }, [error]);

  return <div>Error occurred</div>;
}
```

## Quick Reference: Which Logger to Use

| File Type                     | Has `'use client'`? | Import From            |
| ----------------------------- | ------------------- | ---------------------- |
| `error.tsx`                   | Yes                 | `@/lib/logging/client` |
| `loading.tsx`                 | No                  | `@/lib/logging/logger` |
| `page.tsx`                    | No                  | `@/lib/logging/logger` |
| `layout.tsx`                  | No                  | `@/lib/logging/logger` |
| API routes (`route.ts`)       | N/A                 | `@/lib/logging/logger` |
| Server actions (`actions.ts`) | N/A                 | `@/lib/logging/logger` |
| Hooks (`use*.ts`)             | Yes                 | `@/lib/logging/client` |
| Components in `components/`   | Check directive     | `@/lib/logging/client` |

## File Locations

| Module          | Path                                 | Purpose                                     |
| --------------- | ------------------------------------ | ------------------------------------------- |
| Server logger   | `src/lib/logging/logger.ts`          | Pino-based structured logging               |
| Client logger   | `src/lib/logging/client.ts`          | Console wrapper for browser                 |
| Request context | `src/lib/logging/request-context.ts` | Request-scoped logging with correlation IDs |

## Anti-Patterns (Forbidden)

- ❌ **Client components importing server logger**: Will crash in browser
- ❌ **Raw `console.*` calls in application code**: Use logger instead
- ❌ **eslint-disable comments for console**: Fix the architecture, not the lint rule

## Why Two Loggers?

**Server (Pino)**:

- Structured JSON logs for production observability
- Request correlation IDs
- Log levels configurable via environment
- Safe for server-side secrets (doesn't leak to client)

**Client (Console wrapper)**:

- Minimal browser-compatible implementation
- `'use client'` directive for Next.js App Router
- Future extensibility (Sentry integration planned)
- No Node.js dependencies

## ESLint Configuration

The ESLint config enforces these rules:

- `no-console` rule prevents raw console usage in app code
- Import restrictions prevent server logger from being used in client contexts

If you need to log from a client component, import `clientLogger`, not `logger`.

## Common Issues

### "Cannot read property 'error' of undefined" in browser

**Cause**: Client component importing server logger.
**Fix**: Change `import { logger } from '@/lib/logging/logger'` to `import { clientLogger } from '@/lib/logging/client'`.

### Build errors about Node.js modules in client code

**Cause**: Server logger uses Node.js-only modules (pino, crypto).
**Fix**: Ensure client components only import from `@/lib/logging/client`.

### eslint-disable no-console comments

**Cause**: Band-aid fix for mixing server/client loggers.
**Fix**: Remove the eslint-disable and use the correct logger for your context.
