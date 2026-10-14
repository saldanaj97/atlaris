# Internal Worker Routes

**Audience:** Developers and operators triggering internal worker or manual maintenance routes.
**Last Updated:** October 2026

## Overview

Internal POST routes live under `/api/internal/`. They bypass Clerk middleware and authenticate callers with shared worker tokens when enabled. Scheduled background work (plan cleanup, retention cleanup, email delivery, the regeneration sweep) runs on the Cloudflare jobs Worker's cron triggers and Workflow schedules; the app no longer exposes a Vercel Cron route. The manual maintenance routes below stay for operator use only: they are not scheduled and exist for manual runs, recovery, and drift repair. Queued plan regeneration has no internal route: it runs on the Worker's Cloudflare Queue consumer ([Regeneration worker runbook](./regeneration-worker-runbook.md)).

| Route                                                    | Purpose                                                                                                       | Env config                                                                                                                            | Scheduling                                                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `POST /api/internal/maintenance/retention/cleanup`       | Retention cleanup (manual)                                                                                    | `maintenanceEnv`                                                                                                                      | Manual only; the Worker cron runs it daily                                                             |
| `POST /api/internal/maintenance/plans/cleanup`           | Stuck-plan and orphaned-attempt cleanup (manual)                                                              | `maintenanceEnv`                                                                                                                      | Manual only; the Worker cron runs it every 15 minutes                                                  |
| `POST /api/internal/maintenance/billing/reconcile-clerk` | Clerk Billing entitlement reconciliation                                                                      | `maintenanceEnv`                                                                                                                      | Manual drift repair                                                                                    |
| `POST /api/internal/maintenance/notifications/email`     | Manual start/resume/replay recovery for opted-in email delivery; forwards a signed command to the jobs Worker | `maintenanceEnv.workerToken` + `jobsWorkerEnv` (`JOBS_WORKER_URL`, `JOBS_SIGNING_SECRET`) + Vercel Flag `email-notification-delivery` | Operator-triggered; no inline delivery. The Worker's Workflow schedules run the daily and weekly sends |

Maintenance cleanup routes share `assertMaintenanceWorkerAccess()` in `src/lib/api/internal/internal-worker-access.ts`.

Clerk Billing reconciliation processes at most 100 users per request. Pass `?cursor=<auth_user_id>` to continue from the `nextCursor` returned by the prior response.

## Authentication

Each internal POST route accepts **one** of:

- `Authorization: Bearer <token>`
- A route-specific custom header (mutually exclusive with Bearer)

| Route                        | Custom header                | Token env var              |
| ---------------------------- | ---------------------------- | -------------------------- |
| Retention cleanup            | `x-maintenance-worker-token` | `MAINTENANCE_WORKER_TOKEN` |
| Plan cleanup                 | `x-maintenance-worker-token` | `MAINTENANCE_WORKER_TOKEN` |
| Clerk Billing reconciliation | `x-maintenance-worker-token` | `MAINTENANCE_WORKER_TOKEN` |
| Email notification recovery  | `x-maintenance-worker-token` | `MAINTENANCE_WORKER_TOKEN` |

Requests that supply both Bearer and the custom header are rejected.

### Production vs non-production

- **Production:** enabled routes require a worker token or return `503`. Disabled routes return `503` before token validation.
- **Local non-production:** enabled routes without a token allow unauthenticated access. Hosted Preview and Staging deployments use the production runtime profile and therefore require worker tokens.

## Middleware

`isProtectedRoute()` in `src/lib/proxy/middleware-policy.ts` skips Clerk for all `/api/internal/` paths. Token validation happens inside each route handler. `isSiteGateExempt()` also exempts every `/api/internal/` path from the maintenance and launch waitlist redirects, so the proxy never reads the gate flags for them. Route-level worker tokens and env master switches (such as `PLAN_CLEANUP_ENABLED` and `RETENTION_CLEANUP_ENABLED`) still apply.

## Email delivery recovery

The daily and weekly runs are started by the Worker's Workflow schedules, not by the app. The manual route authenticates with `MAINTENANCE_WORKER_TOKEN`, checks the `email-notification-delivery` Vercel Flag, and sends a signed `POST /v1/email-delivery/runs` to the jobs Worker (`dispatchEmailDeliveryToWorker`). The Worker reserves or requeues the run and starts the Cloudflare Workflow instance, so the route returns promptly with the database run ID and the instance ID; pagination, retries, and provider sends happen in Workflow steps. A Worker that is paused or has the email switch off reads as `outcome: disabled`; an invalid action for the run state is a `409`; any other Worker failure is a `503`.

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
