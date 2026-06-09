# Internal Worker Routes

**Audience:** Developers and operators triggering internal worker or manual maintenance routes.
**Last Updated:** May 2026

## Overview

Three POST routes live under `/api/internal/`. They bypass Clerk middleware and authenticate callers with shared worker tokens when enabled.

| Route                                              | Purpose                             | Env config             |
| -------------------------------------------------- | ----------------------------------- | ---------------------- |
| `POST /api/internal/jobs/regeneration/process`     | Drain queued plan regeneration jobs | `regenerationQueueEnv` |
| `POST /api/internal/maintenance/retention/cleanup` | Manual retention cleanup fallback   | `maintenanceEnv`       |
| `POST /api/internal/maintenance/plans/cleanup`     | Manual stuck-plan and orphaned-attempt cleanup | `maintenanceEnv` |

Both routes share `assertInternalWorkerAccess()` in `src/lib/api/internal/internal-worker-access.ts`.

## Authentication

Each route accepts **one** of:

- `Authorization: Bearer <token>`
- A route-specific custom header (mutually exclusive with Bearer)

| Route              | Custom header                 | Token env var               |
| ------------------ | ----------------------------- | --------------------------- |
| Regeneration drain | `x-regeneration-worker-token` | `REGENERATION_WORKER_TOKEN` |
| Retention cleanup  | `x-maintenance-worker-token`  | `MAINTENANCE_WORKER_TOKEN`  |
| Plan cleanup       | `x-maintenance-worker-token`  | `MAINTENANCE_WORKER_TOKEN`  |

Requests that supply both Bearer and the custom header are rejected.

### Production vs non-production

- **Production:** enabled routes require a worker token or return `503`. Disabled routes return `503` before token validation.
- **Non-production:** enabled routes without a token allow unauthenticated access (local/staging convenience only).

## Middleware

`isProtectedRoute()` in `src/lib/proxy/middleware-policy.ts` skips Clerk for all `/api/internal/` paths. Token validation happens inside each route handler.

## Related runbooks

- [Regeneration worker runbook](./regeneration-worker-runbook.md)
- [Retention cleanup runbook](./retention-cleanup-runbook.md)
- [Environment variables](../development/environment.md)
