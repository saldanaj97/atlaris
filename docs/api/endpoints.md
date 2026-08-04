# Public API Endpoints

Concise catalog of HTTP routes under `src/app/api/`. Prefer this page for route discovery; OpenAPI/Scalar at `/api/docs` currently registers only a small subset of paths and is available in development/test only.

Auth for `/api/v1/*` user routes is Clerk session (or local product-testing identity). Errors use the [API error contract](./error-contract.md). User rate limits are listed in [rate limiting](./rate-limiting.md).

## Plans

| Method | Path | Auth / limit | Notes |
| ------ | ---- | ------------ | ----- |
| `GET` | `/api/v1/plans` | session + `read` | List plans |
| `POST` | `/api/v1/plans/stream` | session + `aiGeneration` + DB generation window | SSE plan generation; see [plan generation architecture](../architecture/plan-generation-architecture.md) |
| `POST` | `/api/v1/plans/bulk-delete` | session + `mutation` | Delete multiple plans |
| `GET` | `/api/v1/plans/[planId]` | session + `read` | Plan detail |
| `DELETE` | `/api/v1/plans/[planId]` | session + `mutation` | Delete one plan |
| `GET` | `/api/v1/plans/[planId]/status` | session + `read` | Generation status |
| `GET` | `/api/v1/plans/[planId]/attempts` | session + `read` | Generation attempts |
| `GET` | `/api/v1/plans/[planId]/tasks` | session + `read` | Plan tasks |
| `POST` | `/api/v1/plans/[planId]/retry` | session + `aiGeneration` | Retry failed generation |
| `POST` | `/api/v1/plans/[planId]/regenerate` | session + `aiGeneration` | Queue regeneration |
| `POST` | `/api/v1/plans/[planId]/modules/[moduleId]/lesson-content/generate` | session + `lessonGeneration` | Module lesson batch |
| `GET` | `/api/v1/plans/[planId]/modules/[moduleId]/lesson-content/status` | session + `read` | Lesson generation status |

## User

| Method | Path | Auth / limit | Notes |
| ------ | ---- | ------------ | ----- |
| `GET` | `/api/v1/user/profile` | session + `read` | Profile |
| `PUT` | `/api/v1/user/profile` | session + `mutation` | Update profile |
| `GET` | `/api/v1/user/preferences` | session + `read` | AI model preference (+ tier-gated model list) |
| `PATCH` | `/api/v1/user/preferences` | session + `mutation` | Update preferred AI model |
| `PATCH` | `/api/v1/user/preferences/notifications` | session + `mutation` | Email notification category prefs |
| `GET` | `/api/v1/user/subscription` | session + `read` | Entitlement + usage snapshot |

## Resources

| Method | Path | Auth / limit | Notes |
| ------ | ---- | ------------ | ----- |
| `GET` | `/api/v1/resources` | session + `read` | Resource catalog reads |

## Notifications

| Method | Path | Auth | Notes |
| ------ | ---- | ---- | ----- |
| `GET` | `/api/v1/notifications/email/unsubscribe` | signed token query | HTML confirmation form |
| `POST` | `/api/v1/notifications/email/unsubscribe` | signed token / one-click | Applies unsubscribe; see email runbook |

## Billing

| Method | Path | Auth | Notes |
| ------ | ---- | ---- | ----- |
| `POST` | `/api/v1/clerk/billing/webhook` | Clerk/Svix signature (`CLERK_WEBHOOK_SIGNING_SECRET`) | Projects entitlement into Postgres |

## Ops / health / docs

| Method | Path | Auth | Notes |
| ------ | ---- | ---- | ----- |
| `GET` | `/api/health/worker` | `WORKER_HEALTH_TOKEN` (`x-worker-health-token` or Bearer) | Worker queue metrics |
| `GET` | `/api/docs` | Dev/test only | Scalar UI |
| `GET` | `/api/docs/openapi` | Dev/test only | OpenAPI JSON |

Internal maintenance, regeneration, and email cron routes: [internal worker routes](../architecture/internal-worker-routes.md).

## Related

- Error shape: [error-contract.md](./error-contract.md)
- Rate limits: [rate-limiting.md](./rate-limiting.md)
- OpenAPI registry (partial): `src/lib/api/openapi.ts`
