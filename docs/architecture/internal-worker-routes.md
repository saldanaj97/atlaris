# Internal Worker Routes

**Audience:** Developers and operators triggering background maintenance from schedulers.  
**Last Updated:** May 2026

## Overview

Two unauthenticated POST routes live under `/api/internal/`. They bypass Clerk middleware and authenticate callers with shared worker tokens instead.

| Route                                              | Purpose                             | Env config             |
| -------------------------------------------------- | ----------------------------------- | ---------------------- |
| `POST /api/internal/jobs/regeneration/process`     | Drain queued plan regeneration jobs | `regenerationQueueEnv` |
| `POST /api/internal/maintenance/retention/cleanup` | Manual retention cleanup fallback   | `maintenanceEnv`       |

Both routes share `assertInternalWorkerAccess()` in `src/lib/api/internal/internal-worker-access.ts`.

## Authentication

Each route accepts **one** of:

- `Authorization: Bearer <token>`
- A route-specific custom header (mutually exclusive with Bearer)

| Route              | Custom header                 | Token env var               |
| ------------------ | ----------------------------- | --------------------------- |
| Regeneration drain | `x-regeneration-worker-token` | `REGENERATION_WORKER_TOKEN` |
| Retention cleanup  | `x-maintenance-worker-token`  | `MAINTENANCE_WORKER_TOKEN`  |

Requests that supply both Bearer and the custom header are rejected.

### Production vs non-production

- **Production:** worker token must be configured or the route returns `503`.
- **Non-production:** missing token allows unauthenticated access (local/staging convenience only).

## Middleware

`isProtectedRoute()` in `src/lib/proxy/middleware-policy.ts` skips Clerk for all `/api/internal/` paths. Token validation happens inside each route handler.

## Related runbooks

- [Regeneration worker runbook](./regeneration-worker-runbook.md)
- [Retention cleanup runbook](./retention-cleanup-runbook.md)
- [Environment variables](../development/environment.md)
