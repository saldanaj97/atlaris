# Environment Variables & Logging

Guidelines for environment variables and logging in this project.

## Environment Variables

### Core Rule

**All env access must go through `@/lib/config/env`.** Do **not** read `process.env` directly outside that module.

### Grouped Configs

Prefer the exported grouped configs instead of raw keys:

- `appEnv` - Runtime mode, app URL, maintenance mode
- `databaseEnv` - Database connection settings for Supabase Postgres
- `clerkAuthEnv` - Clerk publishable and secret keys
- `stripeEnv` - Stripe API keys and settings
- `aiEnv` - AI/LLM provider configuration (includes `mockScenario` for mock provider)
- `stripeEnv` - Stripe keys and `localMode` when `STRIPE_LOCAL_MODE=true`
- `aiTimeoutEnv` - AI generation timeout settings
- `openRouterEnv` - OpenRouter transport configuration
- `devAuthEnv` - Development auth overrides
- `localProductTestingEnv` - Local product-testing mode flag and deterministic seed user ids (allowed for local preview builds; refused in hosted deploys)
- `attemptsEnv` - Attempt cap overrides
- `regenerationQueueEnv` - Worker queue toggles and shared token
- `lessonContentEnv` - Module lesson generation kill-switch (`LESSON_GENERATION_ENABLED`; implemented in `src/lib/config/env/lesson-content.ts`)
- `loggingEnv` - Logging configuration
- `observabilityEnv` - Sentry and telemetry configuration

### Adding New Variables

If you need a new variable:

1. Add it to `src/lib/config/env.ts`
2. Include proper validation (using Zod)
3. Export it through the appropriate grouped config

### Auth Variables

The application uses Clerk Auth for UI, route protection, and server session reads.

Key auth-related server variables include:

| Variable                            | Purpose                                                                                    | Required |
| ----------------------------------- | ------------------------------------------------------------------------------------------ | -------- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk browser-safe publishable key                                                         | Yes      |
| `CLERK_SECRET_KEY`                  | Clerk server secret key                                                                    | Yes      |
| `LOCAL_PRODUCT_TESTING`             | Enables the local product-testing workflow (must be off in hosted deploys)                 | No       |
| `DEV_AUTH_USER_ID`                  | Optional dev/test auth override (`users.auth_user_id`); use bootstrap seed id for local DB | No       |
| `DEV_AUTH_USER_EMAIL`               | Optional dev/test display email                                                            | No       |
| `DEV_AUTH_USER_NAME`                | Optional dev/test display name                                                             | No       |
| `LESSON_GENERATION_ENABLED`         | `true`/`false`/`1`/`0`; when unset, defaults to **on** in development and **off** in other `NODE_ENV` values (see `lessonContentEnv`) | No       |

### Local product testing (development / test)

| Variable                | Purpose                                                                           |
| ----------------------- | --------------------------------------------------------------------------------- |
| `LOCAL_PRODUCT_TESTING` | Master flag for the seeded-user + mocks workflow (forbidden in hosted deploys)    |
| `STRIPE_LOCAL_MODE`     | Use local billing catalog + in-process Stripe mock (forbidden in hosted deploys)  |
| `MOCK_AI_SCENARIO`      | Mock AI: `success`, `timeout`, `provider_error`, `invalid_response`, `rate_limit` |

Google Calendar is intentionally not implemented right now. The settings page keeps a static `Coming Soon` placeholder so the product surface remains visible without implying a partial OAuth flow.

### Local Supabase database

Use `pnpm db:dev:start` to start the Supabase local stack, then copy the current local URL and keys from `supabase status`.

| Variable                               | Local default / source                                                   |
| -------------------------------------- | ------------------------------------------------------------------------ |
| `POSTGRES_URL`                         | `postgresql://postgres:postgres@127.0.0.1:54322/postgres`                |
| `NEXT_PUBLIC_SUPABASE_URL`             | `http://127.0.0.1:54321`                                                 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable / anon key from `supabase status`                            |
| `SUPABASE_SERVICE_ROLE_KEY`            | Service role key from `supabase status`; never expose to browser clients |

Only add `POSTGRES_URL_NON_POOLING` locally when a command needs a direct/session URL for DDL; set it to the same local `POSTGRES_URL` for Supabase local.

## Logging

### Critical Rule: Server vs Client

The codebase uses a **dual-logger architecture**:

| Environment | Import Path            | Use In                                                         |
| ----------- | ---------------------- | -------------------------------------------------------------- |
| **Server**  | `@/lib/logging/logger` | API routes, server components, server actions                  |
| **Client**  | `@/lib/logging/client` | Client components with `'use client'`, hooks, error boundaries |

**Never mix them.** Client components (`'use client'`) must NOT import `@/lib/logging/logger`. See the full logging architecture guide at `docs/development/logging.md`.

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
  const { requestId, logger } = getRequestContext(request);

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

- `docs/development/logging.md` - Comprehensive logging architecture guide
- `src/lib/config/env.ts` - Environment variable definitions and validation
- `src/lib/logging/logger.ts` - Server-side Pino structured logging
- `src/lib/logging/client.ts` - Client-side console wrapper
- `src/lib/logging/request-context.ts` - Request context helpers for API routes
