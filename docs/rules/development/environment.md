# Environment Variables & Logging

Guidelines for environment variables and logging in this project.

## Environment Variables

### Core Rule

**All env access must go through `@/lib/config/env`.** Do **not** read `process.env` directly outside that module.

### Grouped Configs

Prefer the exported grouped configs instead of raw keys:

- `databaseEnv` - Database connection settings
- `neonEnv` - Neon-specific configuration
- `stripeEnv` - Stripe API keys and settings
- `aiEnv` - AI/LLM provider configuration
- `avScannerEnv` - PDF upload malware scanning configuration
- `loggingEnv` - Logging configuration

### Adding New Variables

If you need a new variable:

1. Add it to `src/lib/config/env.ts`
2. Include proper validation (using Zod)
3. Export it through the appropriate grouped config

### Special Variables

| Variable              | Purpose                           | Required |
| --------------------- | --------------------------------- | -------- |
| `CLERK_SESSION_TOKEN` | Manual API testing authentication | No       |

> **Note**: `CLERK_SESSION_TOKEN` is only for `scripts/test-plan-generation.sh`. Not required for normal development.

### AV Scanner Variables

| Variable                   | Purpose                                        | Required                                           |
| -------------------------- | ---------------------------------------------- | -------------------------------------------------- |
| `AV_PROVIDER`              | AV backend selector (`metadefender` or `none`) | Yes                                                |
| `AV_METADEFENDER_API_KEY`  | API key for MetaDefender Cloud                 | Required when `AV_PROVIDER=metadefender`           |
| `AV_METADEFENDER_BASE_URL` | MetaDefender API base URL                      | No (defaults to `https://api.metadefender.com/v4`) |
| `AV_SCAN_TIMEOUT_MS`       | End-to-end scan timeout in milliseconds        | No (defaults to `30000`)                           |

Production guidance:

- Do not run with `AV_PROVIDER=none` in production.
- Keep fail-closed behavior enabled on scan timeout/error.
- Rotate `AV_METADEFENDER_API_KEY` as part of normal secret hygiene.

### Vercel AV Rollout Runbook

Use this sequence to safely enable AV in Vercel environments:

1. Add `AV_METADEFENDER_API_KEY` in Vercel Project Settings for Preview and Production.
2. Set `AV_PROVIDER=metadefender` in Preview only.
3. Optionally set `AV_SCAN_TIMEOUT_MS` (start with `30000`).
4. Deploy to Preview and verify PDF upload behavior:
   - clean PDF succeeds
   - mocked infected sample returns `MALWARE_DETECTED`
   - scan failure returns `SCAN_FAILED` (fail-closed)
5. Monitor server logs for `provider`, `latencyMs`, and verdict fields.
6. Promote same env settings to Production after Preview checks pass.
7. Keep rollback ready: switch `AV_PROVIDER=none` only for emergency mitigation windows.

## Logging

### Critical Rule: Server vs Client

The codebase uses a **dual-logger architecture**:

| Environment | Import Path            | Use In                                                         |
| ----------- | ---------------------- | -------------------------------------------------------------- |
| **Server**  | `@/lib/logging/logger` | API routes, server components, server actions                  |
| **Client**  | `@/lib/logging/client` | Client components with `'use client'`, hooks, error boundaries |

**Never mix them.** Client components (`'use client'`) must NOT import `@/lib/logging/logger`. See the full logging architecture guide at `docs/rules/logging.md`.

### Quick Reference

#### Server-Side Logging

```typescript
import { logger } from '@/lib/logging/logger';

// Basic logging
logger.info('User created plan', { userId, planId });
logger.error('Database connection failed', { error });
```

#### API Routes with Request Context

```typescript
import { getRequestContext } from '@/lib/logging/request-context';

export async function POST(request: Request) {
  const { requestId, logger } = getRequestContext();

  logger.info('Creating new plan', { userId });
  // All logs will include requestId automatically
}
```

#### Client-Side Logging

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

#### Error Boundaries

Error boundaries are always client components:

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

### When to Use Console

If you think you need a direct `console.*` call, consider updating the centralized logging utilities in `@/lib/logging/` instead. The only exceptions are:

- Scripts and CLI tools
- Test output (test utilities may use console)

## Related Files

- `docs/rules/logging.md` - Comprehensive logging architecture guide
- `src/lib/config/env.ts` - Environment variable definitions and validation
- `src/lib/logging/logger.ts` - Server-side Pino structured logging
- `src/lib/logging/client.ts` - Client-side console wrapper
- `src/lib/logging/request-context.ts` - Request context helpers for API routes
