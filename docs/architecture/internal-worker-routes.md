# Internal Worker Routes

**Audience:** Developers and operators triggering internal worker or manual maintenance routes.
**Last Updated:** July 2026

## Overview

Internal POST routes live under `/api/internal/`. They bypass Clerk middleware and authenticate callers with shared worker tokens when enabled. The email scheduler is separately exposed as a Vercel Cron GET route with its own secret.

| Route                                              | Purpose                             | Env config             | Scheduling |
| -------------------------------------------------- | ----------------------------------- | ---------------------- | ---------- |
| `POST /api/internal/jobs/regeneration/process`     | Drain queued plan regeneration jobs | `regenerationQueueEnv` | External scheduler required |
| `POST /api/internal/maintenance/retention/cleanup` | Retention cleanup (manual fallback) | `maintenanceEnv`       | Supabase `pg_cron` daily; HTTP route is manual fallback |
| `POST /api/internal/maintenance/plans/cleanup`     | Stuck-plan and orphaned-attempt cleanup | `maintenanceEnv`       | GitHub Actions every 15 minutes |
| `POST /api/internal/maintenance/billing/reconcile-clerk` | Clerk Billing entitlement reconciliation | `maintenanceEnv`       | Manual drift repair |
| `GET /api/cron/notifications/email` | Start/reuse the durable opted-in email delivery workflow | `maintenanceEnv.cronSecret` + Vercel Flag `email-notification-delivery` | Vercel Cron daily at 14:00 UTC and weekly Monday at 14:30 UTC |
| `POST /api/internal/maintenance/notifications/email` | Manual start/resume/replay recovery for opted-in email delivery | `maintenanceEnv.workerToken` + Vercel Flag `email-notification-delivery` | Operator-triggered; no inline delivery |

Maintenance cleanup routes share `assertMaintenanceWorkerAccess()` in `src/lib/api/internal/internal-worker-access.ts`. The regeneration drain uses `assertInternalWorkerAccess()` directly.

Clerk Billing reconciliation processes at most 100 users per request. Pass `?cursor=<auth_user_id>` to continue from the `nextCursor` returned by the prior response.

## Authentication

Each internal POST route accepts **one** of:

- `Authorization: Bearer <token>`
- A route-specific custom header (mutually exclusive with Bearer)

| Route              | Custom header                 | Token env var               |
| ------------------ | ----------------------------- | --------------------------- |
| Regeneration drain | `x-regeneration-worker-token` | `REGENERATION_WORKER_TOKEN` |
| Retention cleanup  | `x-maintenance-worker-token`  | `MAINTENANCE_WORKER_TOKEN`  |
| Plan cleanup       | `x-maintenance-worker-token`  | `MAINTENANCE_WORKER_TOKEN`  |
| Clerk Billing reconciliation | `x-maintenance-worker-token`  | `MAINTENANCE_WORKER_TOKEN`  |
| Email notification recovery | `x-maintenance-worker-token`  | `MAINTENANCE_WORKER_TOKEN`  |
| Email notification Vercel Cron | None (Bearer only) | `CRON_SECRET` |

Requests that supply both Bearer and the custom header are rejected.

The Vercel Cron email route accepts only `Authorization: Bearer $CRON_SECRET`; it has no custom-header fallback.

### Production vs non-production

- **Production:** enabled routes require a worker token or return `503`. Disabled routes return `503` before token validation.
- **Non-production:** enabled routes without a token allow unauthenticated access (local/staging convenience only).

## Middleware

`isProtectedRoute()` in `src/lib/proxy/middleware-policy.ts` skips Clerk for all `/api/internal/` paths and for the exact email Vercel Cron path. Token validation happens inside each route handler. The cron path is also exempt from maintenance redirects so Vercel can invoke it; its handler still checks `CRON_SECRET` before evaluating flags or reserving a run.

## Email delivery recovery

The cron route accepts only Vercel's two configured schedule headers and starts a code-owned `daily` or `weekly` logical run. It returns promptly with a database run ID and Workflow run ID; pagination, retries, and provider sends happen in Workflow SDK steps.

The manual route accepts only:

```json
{
  "runKind": "daily",
  "schedulerDateUtc": "2026-07-10",
  "action": "start"
}
```

`action` is `start`, `resume`, or `replay_reviewed`. It never accepts categories, batch size, or a cursor. See the [email delivery runbook](./email-notification-delivery-runbook.md) for recovery and review procedures.

## Related runbooks

- [Regeneration worker runbook](./regeneration-worker-runbook.md)
- [Retention cleanup runbook](./retention-cleanup-runbook.md)
- [Plan cleanup runbook](./plan-cleanup-runbook.md)
- [Email delivery runbook](./email-notification-delivery-runbook.md)
- [Environment variables](../development/environment.md)
