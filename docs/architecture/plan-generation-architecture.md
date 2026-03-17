# Plan Generation Architecture

**Audience:** Developers onboarding to the plan generation pipeline  
**Last Updated:** March 2026

## Overview

Plan generation is intentionally split into two request phases:

1. create a plan shell with `POST /api/v1/plans`
2. generate the plan content with `POST /api/v1/plans/stream`

That separation matters. It lets the UI persist a user-owned plan record immediately, then attach a long-running streamed generation attempt to it without losing state if the client navigates.

At runtime, the pipeline combines:

- Neon Auth for user identity
- request-scoped RLS database access via `getDb()`
- OpenRouter-backed streaming model generation
- strict parsing and pacing before persistence
- atomic attempt finalization in the database

## High-level flow

```text
User submits create form
  → POST /api/v1/plans
  → validate and normalize input
  → create learning_plans row
  → return planId

Client starts stream
  → POST /api/v1/plans/stream
  → auth + rate limit + durable generation-window checks
  → reserve attempt slot
  → call AI provider
  → parse streamed output
  → pace modules/tasks to available hours
  → finalize success or failure atomically
  → emit SSE events to client
```

## Request boundary and auth

- API routes use the shared auth wrappers in `@/lib/api/auth`
- request handlers use `getDb()` from `@/lib/db/runtime`
- the underlying RLS client sets `request.jwt.claims.sub` to the authenticated Neon auth user id
- ownership checks then resolve the internal `users.id` row associated with that auth subject

This separation between external auth identity and internal app user row is not optional. It is the basis for RLS ownership checks across plans, attempts, usage, and integration data.

## Main files

### API layer

| File                                                | Responsibility                             |
| --------------------------------------------------- | ------------------------------------------ |
| `src/app/api/v1/plans/route.ts`                     | Create the initial plan shell              |
| `src/app/api/v1/plans/stream/route.ts`              | Start streamed plan generation             |
| `src/app/api/v1/plans/stream/helpers.ts`            | Stream-side success/failure handling       |
| `src/app/api/v1/plans/[planId]/status/route.ts`     | Return plan generation status              |
| `src/app/api/v1/plans/[planId]/attempts/route.ts`   | Return attempt history                     |
| `src/app/api/v1/plans/[planId]/retry/route.ts`      | Retry a failed or pending-retry generation |
| `src/app/api/v1/plans/[planId]/regenerate/route.ts` | Regenerate an existing plan                |

### AI layer

| File                                 | Responsibility                            |
| ------------------------------------ | ----------------------------------------- |
| `src/lib/ai/orchestrator.ts`         | Main generation control plane             |
| `src/lib/ai/provider-factory.ts`     | Provider and model selection              |
| `src/lib/ai/providers/openrouter.ts` | OpenRouter transport adapter              |
| `src/lib/ai/providers/router.ts`     | Provider routing and retry behavior       |
| `src/lib/ai/providers/mock.ts`       | Deterministic mock provider               |
| `src/lib/ai/parser.ts`               | Stream parsing and validation             |
| `src/lib/ai/pacing.ts`               | Adjust output to available schedule hours |
| `src/lib/ai/classification.ts`       | Failure classification                    |
| `src/lib/ai/timeout.ts`              | Adaptive timeout policy                   |
| `src/lib/ai/generation-policy.ts`    | Durable generation-window enforcement     |

### Database layer

| File                             | Responsibility                                 |
| -------------------------------- | ---------------------------------------------- |
| `src/lib/db/queries/attempts.ts` | Reserve/finalize attempts atomically           |
| `src/lib/db/queries/plans.ts`    | Plan CRUD and access helpers                   |
| `src/lib/db/runtime.ts`          | Request-scoped DB accessor                     |
| `src/lib/db/rls.ts`              | RLS client construction and session state      |
| `src/lib/db/service-role.ts`     | Service-role database client for tests/workers |

## Lifecycle

### 1) Create the plan shell

`POST /api/v1/plans` performs:

1. authenticated user resolution through the shared auth layer
2. user-based rate limiting for mutations
3. request validation and normalization
4. plan-row creation with initial generation metadata
5. response with the new `planId`

The plan record exists before generation begins, which gives the client something durable to poll, stream, retry, or regenerate against.

### 2) Start the stream

`POST /api/v1/plans/stream` performs:

1. plan ownership verification
2. authenticated user rate limiting for `aiGeneration`
3. durable generation-window checks from `generation-policy.ts`
4. attempt-cap and status validation
5. SSE response initialization
6. orchestration of provider execution and persistence

The stream route must not couple the plan’s lifecycle to a fragile client connection. Early navigation is common; silent partial failure is worse.

### 3) Run the orchestrator

`runGenerationAttempt(...)` in `src/lib/ai/orchestrator.ts` is the core pipeline:

1. reserve an attempt slot
2. determine timeout budget
3. call the provider with timeout and abort signal
4. parse and validate streamed output
5. classify failures where needed
6. pace modules/tasks to fit available hours
7. finalize success or failure in the database

### 4) Finalize atomically

Successful attempt finalization writes, in one transactional flow:

- attempt completion metadata
- ordered module rows
- ordered task rows
- final plan generation state

Failure finalization records the attempt outcome and updates the plan status consistently. The point is to prevent drift between the attempt log and the user-visible plan state.

## Stream contract

The SSE endpoint emits client-safe events such as:

- `plan_start`
- `module_summary`
- `progress`
- `complete`
- `error`

Client-facing errors are sanitized and serialized into the canonical API error shape instead of leaking raw provider or infrastructure failures.

## Failure classes

The generation pipeline uses stable classifications including:

- `timeout`
- `rate_limit`
- `provider_error`
- `validation`
- `capped`

These classifications drive logging, user messaging, and retry decisions.

## Database tables involved

The main persistence path touches:

- `learning_plans`
- `modules`
- `tasks`
- `generation_attempts`
- supporting usage and billing tables where applicable

See `docs/rules/database/schema-overview.md` for the current schema view.

## RLS model

- request handlers must use `getDb()`
- tests, workers, and system jobs may use the service-role client when appropriate
- RLS session state is configured in `src/lib/db/rls.ts`
- policies check the current auth subject from `request.jwt.claims`
- `users.auth_user_id` maps the auth identity to the internal app user row used by ownership relations

If someone imports the service-role DB into a request handler, they are not being clever. They are bypassing tenancy enforcement.

## Testing guidance

- use mock providers for deterministic unit and integration tests
- test atomic persistence, failure classification, retry behavior, and status transitions
- do not run the full suite when a scoped unit or integration test covers the change

## Related documents

- `docs/context/architecture/auth-and-data-layer.md`
- `docs/rules/api/rate-limiting.md`
- `docs/rules/database/schema-overview.md`
- `src/lib/ai/AGENTS.md`
- `src/lib/db/AGENTS.md`
