# Rate Limiting

This document describes the rate limiting system for Atlaris API endpoints. There are two layers of rate limiting: user-based (authenticated) and job-based (plan generation specific).

## Quick Reference

### User Rate Limits (Authenticated Endpoints)

| Category       | Limit        | Window   | Use Case                                   |
| -------------- | ------------ | -------- | ------------------------------------------ |
| `aiGeneration` | 10 requests  | 1 hour   | AI generation, regeneration, enhancement   |
| `integration`  | 30 requests  | 1 hour   | Third-party APIs (Notion, Google Calendar) |
| `mutation`     | 60 requests  | 1 minute | Plan CRUD, task updates, DB writes         |
| `read`         | 120 requests | 1 minute | Status checks, profile reads, preferences  |
| `billing`      | 10 requests  | 1 minute | Stripe checkout, portal sessions           |
| `oauth`        | 20 requests  | 1 hour   | OAuth flows (Google, Notion auth)          |

### Plan Generation Rate Limit

| Limit                                           | Window                                              | Scope                          |
| ----------------------------------------------- | --------------------------------------------------- | ------------------------------ |
| `PLAN_GENERATION_LIMIT` (currently 10 attempts) | `PLAN_GENERATION_WINDOW_MINUTES` (currently 60 min) | Per user (generation_attempts) |

Source of truth for durable generation limits is `src/lib/ai/generation-policy.ts`. Avoid hardcoding numeric values in docs/tests.

## Architecture

### User-Based Rate Limiting

Located in `src/lib/api/user-rate-limit.ts`.

- **Storage**: In-memory LRU cache per process
- **Key**: Clerk user ID (not IP)
- **Scope**: Per category, per user
- **Multi-instance note**: Each server instance enforces its own limits. For strict global limits, consider Redis-backed storage.

### Plan Generation Rate Limiting

Located in `src/lib/api/rate-limit.ts`.

- **Storage**: Database (generation_attempts table)
- **Key**: RLS-scoped (current user via session)
- **Scope**: Actual generation attempts (stream + retry paths)
- **Policy constants**: `PLAN_GENERATION_LIMIT`, `PLAN_GENERATION_WINDOW_MINUTES`
- **Multi-instance note**: Globally consistent (database-backed)

## Usage in API Routes

### Using `withAuthAndRateLimit` (Recommended)

For most endpoints, use the combined middleware:

```typescript
import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';

// Single handler
export const GET = withErrorBoundary(
  withAuthAndRateLimit('read', async ({ req, userId, params }) => {
    // Handler code
  })
);

// Multiple methods
export const POST = withErrorBoundary(
  withAuthAndRateLimit('mutation', async ({ req, userId }) => {
    // Handler code
  })
);
```

### Category Selection Guide

| Endpoint Type                            | Category       |
| ---------------------------------------- | -------------- |
| AI generation, regeneration, enhancement | `aiGeneration` |
| Notion export, Google Calendar sync      | `integration`  |
| Create/update/delete plans, tasks, etc.  | `mutation`     |
| GET endpoints for data retrieval         | `read`         |
| Stripe checkout/portal creation          | `billing`      |
| OAuth initiation (not callbacks)         | `oauth`        |

### Plan Generation (Special Case)

Plan generation has an additional database-backed rate limit:

```typescript
import { checkPlanGenerationRateLimit } from '@/lib/api/rate-limit';
import { getDb } from '@/lib/db/runtime';

// Inside handler, after user-based rate limit passes
const db = getDb();
await checkPlanGenerationRateLimit(user.id, db); // Uses generation_attempts count in durable window
```

## Response Headers

All endpoints using `withAuthAndRateLimit` automatically include rate limit headers on every response (not just 429 errors):

| Header                  | Description                              |
| ----------------------- | ---------------------------------------- |
| `X-RateLimit-Limit`     | Maximum requests allowed in the window   |
| `X-RateLimit-Remaining` | Remaining requests in the current window |
| `X-RateLimit-Reset`     | Unix timestamp when the window resets    |

Example response headers:

```
HTTP/1.1 200 OK
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 1737664800
```

Clients can use these headers to:

- Display quota usage in the UI
- Implement proactive throttling before hitting limits
- Calculate when to retry after approaching limits

## Error Response

When rate limit is exceeded, the API returns:

```json
{
  "error": "Rate limit exceeded. Maximum 10 requests allowed per hour.",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 3542
}
```

- HTTP Status: `429 Too Many Requests`
- `retryAfter`: Seconds until the rate limit resets

## Current Endpoint Assignments

### AI Generation (`aiGeneration`)

- `POST /api/v1/plans/stream`
- `POST /api/v1/plans/[planId]/retry`
- `POST /api/v1/plans/[planId]/regenerate`
- `POST /api/v1/ai/enhance-content`
- `POST /api/v1/ai/generate-plan`

### Integration (`integration`)

- `POST /api/v1/integrations/notion/export`
- `POST /api/v1/integrations/google-calendar/sync`
- `POST /api/v1/integrations/disconnect`

### Billing (`billing`)

- `POST /api/v1/stripe/create-checkout`
- `POST /api/v1/stripe/create-portal`

### Mutation (`mutation`)

- `POST /api/v1/plans` (create)
- `DELETE /api/v1/plans/[planId]`
- `PATCH /api/v1/user/preferences`
- `PUT /api/v1/user/profile`
- `PUT /api/v1/notifications/preferences`
- `POST /api/v1/notifications/weekly-summary`

### Read (`read`)

- `GET /api/v1/plans`
- `GET /api/v1/plans/[planId]`
- `GET /api/v1/plans/[planId]/status`
- `GET /api/v1/plans/[planId]/attempts`
- `GET /api/v1/plans/[planId]/tasks`
- `GET /api/v1/user/preferences`
- `GET /api/v1/user/subscription`
- `GET /api/v1/user/profile`
- `GET /api/v1/notifications/preferences`
- `GET /api/v1/templates`
- `GET /api/v1/resources`

### OAuth (`oauth`)

OAuth routes use existing CSRF state token protection. Rate limiting is applied at the initiation level, not callbacks.

## Future Considerations

### Tier-Based Rate Limits

The current implementation uses flat limits for all users. Future enhancements may include:

```typescript
// Potential future structure
const TIER_RATE_LIMITS = {
  free: {
    aiGeneration: { maxRequests: 5, windowMs: 60 * 60 * 1000 },
    // ...
  },
  starter: {
    aiGeneration: { maxRequests: 20, windowMs: 60 * 60 * 1000 },
    // ...
  },
  pro: {
    aiGeneration: { maxRequests: 100, windowMs: 60 * 60 * 1000 },
    // ...
  },
};
```

### User-Facing Rate Limit Display

For displaying limits in the UI, import the config:

```typescript
import { USER_RATE_LIMIT_CONFIGS } from '@/lib/api/user-rate-limit';

// Access limits
const aiLimit = USER_RATE_LIMIT_CONFIGS.aiGeneration.maxRequests; // 10
const aiWindowMs = USER_RATE_LIMIT_CONFIGS.aiGeneration.windowMs; // 3600000
```

### Redis-Backed Storage

For strict global rate limiting across multiple server instances, the `createUserRateLimiter` function can be extended to use Redis instead of the in-memory LRU cache.

## Related Files

- `src/lib/api/user-rate-limit.ts` - User-based rate limiting module
- `src/lib/api/rate-limit.ts` - Plan generation rate limiting
- `src/lib/api/auth.ts` - `withAuthAndRateLimit` middleware
- `src/lib/api/errors.ts` - `RateLimitError` class
- `tests/unit/api/user-rate-limit.spec.ts` - Unit tests
