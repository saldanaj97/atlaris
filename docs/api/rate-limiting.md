# Rate Limiting

Atlaris rate limiting is five layers, not a single wrapper. Edge, IP, user, durable generation, and product quotas are independent controls. A category in config does nothing until a route or Server Action opts into it.

## Five-layer model

| Layer | Where | Scope | Consistency |
| ----- | ----- | ----- | ----------- |
| Vercel edge rate limit | Dashboard-managed Firewall Rate Limit on `/ingest/*` | Unauthenticated PostHog reverse-proxy traffic | Edge-wide (Vercel) |
| Application IP limiter | `src/lib/api/ip-rate-limit.ts` | Unauthenticated or machine routes keyed by client IP | Per process (in-memory LRU) |
| Authenticated user limiter | `src/lib/api/user-rate-limit.ts` | Authenticated API routes and Server Actions keyed by user ID | Per process (in-memory LRU) |
| Durable DB plan-generation limiter | `src/lib/api/rate-limit.ts` | Generation, retry, and regeneration attempts (`generation_attempts`) | Database-shared, fail-closed preflight (not atomic) |
| Product quotas / kill switches | Billing quota boundaries and Vercel Flags | Plan count, duration, metered generation, operational disable | Shared product/ops policy |

## Vercel Firewall allocation

Hobby/Pro projects have **1 Rate Limit slot** and **3 custom WAF slots**. The intended JCS-53 allocation is:

| Capability | Allocation |
| ---------- | ---------- |
| Rate Limit | **1 / 1** — keep the dashboard-managed `/ingest` rule; it is the sole Rate Limit slot |
| Custom WAF Rules | **0 / 3** — leave all three unused |
| Optional `/ingest` method rule | **Do not add it** |

This dashboard rule is **not** represented in `vercel.json`. That file remains repository configuration for cron schedules only. Inspecting the repo cannot confirm or mutate the live Firewall dashboard.

Do not add WAF rules for authenticated APIs, Svix/Clerk signature headers, worker secrets, or broad `/.well-known` paths. Those surfaces are enforced in application code (user/IP limiters, cryptographic verification, worker tokens). Custom WAF slots stay unused on purpose so they remain available as emergency virtual patches.

`/ingest/*` is the PostHog reverse-proxy rewrite in `next.config.ts`. Clerk proxy matching excludes that prefix so analytics ingest is not treated as an app route.

## Quick Reference

### User Rate Limits (Authenticated Endpoints)

| Category           | Limit        | Window   | Use Case                                         |
| ------------------ | ------------ | -------- | ------------------------------------------------ |
| `aiGeneration`     | 10 requests  | 1 hour   | Plan generation and regeneration                 |
| `lessonGeneration` | 5 requests   | 1 hour   | Module lesson batch generation (separate meter)  |
| `integration`      | 30 requests  | 1 hour   | Reserved for future third-party endpoints        |
| `mutation`         | 60 requests  | 1 minute | Plan delete/bulk-delete, profile, preferences, Server Actions |
| `read`             | 120 requests | 1 minute | Status checks, profile reads, preferences        |
| `oauth`            | 20 requests  | 1 hour   | Reserved for future OAuth initiation             |

### IP Rate Limits (Unauthenticated / Machine Endpoints)

| Category    | Limit        | Window   | Use Case                                              |
| ----------- | ------------ | -------- | ----------------------------------------------------- |
| `health`    | 60 requests  | 1 minute | Worker health                                         |
| `webhook`   | 100 requests | 1 minute | Clerk billing webhook                                 |
| `publicApi` | 30 requests  | 1 minute | Signed one-click unsubscribe POST                     |
| `auth`      | 10 requests  | 1 minute | Defined; no current route uses it                     |
| `docs`      | 30 requests  | 1 minute | API docs / OpenAPI (development and test only)        |
| `internal`  | 60 requests  | 1 minute | Internal workers, maintenance POSTs, notification cron |

### Plan Generation Rate Limit

| Limit                                           | Window                                              | Scope                          |
| ----------------------------------------------- | --------------------------------------------------- | ------------------------------ |
| `PLAN_GENERATION_LIMIT` (currently 10 attempts) | `PLAN_GENERATION_WINDOW_MINUTES` (currently 60 min) | Per user: generation, retry, and regeneration (`generation_attempts`) |

Source of truth for durable generation limits is `src/shared/constants/generation.ts` (enforced in `src/lib/api/rate-limit.ts`). Avoid hardcoding numeric values in docs/tests.

## Architecture

### Vercel edge (`/ingest/*`)

Dashboard-managed Rate Limit on the PostHog ingest reverse-proxy path. This is the only Vercel Rate Limit slot. It is not encoded in application source or `vercel.json`.

### Application IP limiter

Located in `src/lib/api/ip-rate-limit.ts`. Shared sliding-window algorithm: `src/lib/api/rate-limit-core.ts`.

- **Storage**: In-memory LRU cache **per Node.js process**
- **Key**: Client IP (`X-Forwarded-For`, `X-Real-IP`, `CF-Connecting-IP`; unknown if none)
- **Scope**: Per IP category (`health`, `webhook`, `publicApi`, `auth`, `docs`, `internal`)
- **Opt-in**: A route must call `checkIpRateLimit(request, category)`. Declaring a category in `IP_RATE_LIMIT_CONFIGS` does not enforce it.
- **Multi-instance note**: Each serverless instance enforces its own counters. Limits are best-effort, not globally strict.

### Authenticated user limiter

Located in `src/lib/api/user-rate-limit.ts`. Same sliding-window core as the IP limiter.

- **Storage**: In-memory LRU cache **per Node.js process**
- **Key**: Authenticated user ID (not IP)
- **Scope**: Per category, per user
- **Opt-in**: `requestBoundary.route({ rateLimit })` or `requestBoundary.action({ rateLimit })`
- **Multi-instance note**: Same per-process caveat as the IP limiter. Two concurrent instances can each admit a full window of requests for the same user.

### Durable plan-generation limiter

Located in `src/lib/api/rate-limit.ts`.

- **Storage**: Database (`generation_attempts` table)
- **Key**: RLS-scoped current user
- **Scope**: Generation, retry, and regeneration attempts
- **Mechanism**: Fail-closed preflight count of `generation_attempts` in the rolling window. This is not an atomic reservation.
- **Policy constants**: `PLAN_GENERATION_LIMIT`, `PLAN_GENERATION_WINDOW_MINUTES`
- **Concurrency note**: Because the check is a non-atomic preflight count with no reservation, concurrent requests can exceed the nominal window.

### Product quotas and kill switches

These are not request-frequency limiters. They cap product usage or disable a feature:

- Plan-count and duration gates on plan creation
- Metered billing quotas (lesson generation, regeneration)
- Vercel Flags kill switches (`moduleLessonGeneration`, `emailNotificationDelivery`)

### Per-process limits and Redis

IP and user limiters are **intentionally per-process**. They protect a single instance from a noisy client; they do not provide a cluster-wide token bucket.

Redis (or any other distributed limiter) is **deferred** until production traffic shows that per-process windows are actually being exceeded in a way that matters for cost or abuse. Do not add a shared store solely because multiple Vercel instances exist.

The durable generation limiter is a database-shared, fail-closed preflight count for generation, retry, and regeneration — not a strict global cap. Because the check is a non-atomic preflight with no reservation, concurrent requests can exceed the nominal window. Product quotas and kill switches further bound that cost.

## Usage in API Routes

### Using `requestBoundary.route` (Recommended)

For authenticated API routes, use the request boundary with an explicit rate-limit option:

```typescript
import { requestBoundary } from '@/lib/api/request-boundary';

export const GET = requestBoundary.route(
  { rateLimit: 'read' },
  async ({ req, actor, db }) => {
    // Handler code
  },
);

export const POST = requestBoundary.route(
  { rateLimit: 'mutation' },
  async ({ req, actor }) => {
    // Handler code
  },
);
```

### Using `requestBoundary.action`

Authenticated Server Actions use the same user categories. Current actions use `mutation`:

```typescript
import { requestBoundary } from '@/lib/api/request-boundary';

export async function batchUpdateTaskProgressAction(input: Input) {
  return requestBoundary.action(
    { rateLimit: 'mutation' },
    async ({ actor, db }) => {
      // Action code
    },
  );
}
```

Server Actions share framework POST paths, so they cannot be targeted reliably with a WAF path rule. Per-user `mutation` is the intended control.

### Category Selection Guide

| Endpoint Type                                   | Category           |
| ----------------------------------------------- | ------------------ |
| Plan generation, regeneration                   | `aiGeneration`     |
| Module lesson batch generation                  | `lessonGeneration` |
| Future third-party integration writes           | `integration`      |
| Plan delete/bulk-delete, profile, preferences, Server Actions | `mutation` |
| GET endpoints for data retrieval / status polls | `read`             |
| Future OAuth initiation (not callbacks)         | `oauth`            |

### IP limiter (`checkIpRateLimit`)

For unauthenticated or machine-authenticated routes:

```typescript
import { checkIpRateLimit } from '@/lib/api/ip-rate-limit';

checkIpRateLimit(request, 'publicApi'); // unsubscribe POST
checkIpRateLimit(request, 'internal'); // notification cron / workers
```

`checkIpRateLimit` throws `RateLimitError` when the window is exceeded. Routes that already use `withErrorBoundary` map that to the canonical 429 payload. It does not attach `X-RateLimit-*` headers by itself; use `getRateLimitHeaders` when a route needs them.

### Plan Generation (Special Case)

Plan generation, retry, and regeneration have an additional database-backed preflight rate limit after the user `aiGeneration` limiter:

```typescript
import { checkPlanGenerationRateLimit } from '@/lib/api/rate-limit';
import { getDb } from '@supabase/runtime';

// Inside handler, after user-based rate limit passes
await checkPlanGenerationRateLimit(actor.id, db); // Uses generation_attempts count in durable window
```

## Response Headers

All endpoints using `requestBoundary.route({ rateLimit })` automatically include rate limit headers on every response (not just 429 errors):

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
  "code": "RATE_LIMITED",
  "classification": "rate_limit",
  "retryAfter": 3542
}
```

- HTTP Status: `429 Too Many Requests`
- `retryAfter`: Seconds until the rate limit resets

All error payloads must follow the canonical API error contract in `docs/api/error-contract.md`.

## Current Endpoint Assignments

### AI Generation (`aiGeneration`)

- `POST /api/v1/plans/stream`
- `POST /api/v1/plans/[planId]/retry`
- `POST /api/v1/plans/[planId]/regenerate`

### Lesson Generation (`lessonGeneration`)

Separate from `aiGeneration` so plan-create flows are not starved by module lesson batches.

- `POST /api/v1/plans/[planId]/modules/[moduleId]/lesson-content/generate`

Source: `USER_RATE_LIMIT_CONFIGS.lessonGeneration` in `src/lib/api/user-rate-limit.ts` (5 requests / rolling hour per user, in-memory). Monthly billing meter `lessonGeneration` is separate — see [plan-generation-architecture.md](../architecture/plan-generation-architecture.md#module-lesson-generation-separate-pipeline).

### Mutation (`mutation`)

- `DELETE /api/v1/plans/[planId]`
- `POST /api/v1/plans/bulk-delete`
- `PATCH /api/v1/user/preferences`
- `PATCH /api/v1/user/preferences/notifications`
- `PUT /api/v1/user/profile`
- `batchUpdateTaskProgressAction` (`src/app/(app)/plans/[id]/actions.ts`)
- `batchUpdateModuleTaskProgressAction` (`src/app/(app)/plans/[id]/modules/[moduleId]/actions.ts`)
- `syncAnalyticsTimezoneAction` (`src/app/(app)/analytics/usage/actions.ts`)

### Read (`read`)

- `GET /api/v1/plans`
- `GET /api/v1/plans/[planId]`
- `GET /api/v1/plans/[planId]/status`
- `GET /api/v1/plans/[planId]/attempts`
- `GET /api/v1/plans/[planId]/tasks`
- `GET /api/v1/plans/[planId]/modules/[moduleId]/lesson-content/status`
- `GET /api/v1/user/preferences`
- `GET /api/v1/user/subscription`
- `GET /api/v1/user/profile`
- `GET /api/v1/resources`

### Integration / OAuth (`integration`, `oauth`)

These categories remain available in the shared user-limiter configuration for future provider work. There are currently no active Google OAuth or integration API routes.

### IP: Health (`health`)

- `GET /api/health/worker`

### IP: Webhook (`webhook`)

- `POST /api/v1/clerk/billing/webhook`

### IP: Public API (`publicApi`)

- `POST /api/v1/notifications/email/unsubscribe`

`GET /api/v1/notifications/email/unsubscribe` is static confirmation-only and intentionally unmetered so scanners and prefetchers cannot starve legitimate opt-outs. Only the signed one-click POST uses `publicApi`.

### IP: Docs (`docs`)

Available only in development and test; otherwise these routes return `404`.

- `GET /api/docs`
- `GET /api/docs/openapi`

### IP: Internal (`internal`)

- `POST /api/internal/jobs/regeneration/process`
- `POST /api/internal/maintenance/billing/reconcile-clerk`
- `POST /api/internal/maintenance/notifications/email`
- `POST /api/internal/maintenance/plans/cleanup`
- `POST /api/internal/maintenance/retention/cleanup`
- `GET /api/cron/notifications/email`

Maintenance POSTs apply `internal` through `createMaintenancePostRoute` in `src/lib/api/internal/maintenance-route.ts`.

### IP: Auth (`auth`)

Defined in `IP_RATE_LIMIT_CONFIGS` (10 requests / minute). No current route calls `checkIpRateLimit(request, 'auth')`.

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

Do not add Redis (or another distributed limiter) until production traffic shows that per-process IP/user windows are being exceeded in a way that matters. The durable Postgres limiter is a fail-closed preflight count on generation, retry, and regeneration, not a cluster-wide atomic reservation.

## Related Files

- `src/lib/api/ip-rate-limit.ts` — IP-based rate limiting
- `src/lib/api/user-rate-limit.ts` — User-based rate limiting
- `src/lib/api/rate-limit-core.ts` — Shared sliding-window LRU used by IP and user limiters
- `src/lib/api/rate-limit.ts` — Durable plan-generation rate limiting
- `src/lib/api/request-boundary.ts` — `requestBoundary.route` / `.action` rate-limit options
- `src/lib/api/route-wrappers.ts` — Shared error boundary and user rate-limit wrapper/header logic
- `src/lib/api/errors.ts` — `RateLimitError` class
- `src/lib/api/internal/maintenance-route.ts` — Applies the `internal` IP limiter to maintenance POSTs
- `src/shared/constants/generation.ts` — Durable generation limit constants
- `vercel.json` — Cron schedules only; does not record Firewall rules
- `tests/unit/api/user-rate-limit.spec.ts` — User limiter unit tests
- `tests/unit/api/ip-rate-limit.spec.ts` — IP limiter unit tests
