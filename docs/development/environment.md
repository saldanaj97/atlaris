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

## Logging

### Core Rule

**Use `@/lib/logging/logger` for structured logging.** Avoid `console.*` in application code.

### API Routes

For API routes, use helpers from `@/lib/logging/request-context`:

```typescript
import { getRequestContext } from '@/lib/logging/request-context';

export async function GET(request: Request) {
  const { requestId, logger } = getRequestContext();

  logger.info('Processing request', { requestId });
  // ... handle request
}
```

### When to Use Console

If you think you need a direct `console.*` call, consider updating the centralized logging utilities in `@/lib/logging/` instead.

## Related Files

- `src/lib/config/env.ts` - Environment variable definitions and validation
- `src/lib/logging/logger.ts` - Structured logging utilities
- `src/lib/logging/request-context.ts` - Request context helpers for API routes
