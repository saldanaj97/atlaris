# API Error Contract

This document defines the canonical error response shape for all API routes.

## Why this exists

If routes return different error shapes, clients become fragile and duplicate parsing logic. We enforce one contract so server and client code stay predictable.

## Canonical Response Shape

All API errors must use this shape:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE",
  "classification": "validation",
  "details": { "field": "topic" },
  "retryAfter": 30
}
```

Fields:

- `error` (required): user-safe message string.
- `code` (required): stable machine-readable code.
- `classification` (optional): one of `validation | conflict | provider_error | rate_limit | timeout | capped`.
- `details` (optional): structured metadata safe to expose to clients.
- `retryAfter` (optional): seconds until client should retry (typically rate limit responses).

## Required server helpers

Use these helpers only:

- `jsonError(...)` from `src/lib/api/response.ts`
- `toErrorResponse(...)` from `src/lib/api/errors.ts`

### Route/middleware pattern (required)

- For authenticated route handlers, use `requestBoundary.route(...)` and throw typed `AppError` variants (`ValidationError`, `AuthError`, `NotFoundError`, etc.); the boundary serializes them through `toErrorResponse(...)`.
- For unauthenticated/custom adapters (webhooks, internal worker endpoints, docs, health checks), compose `withErrorBoundary(...)` directly when the handler should still use canonical API error serialization.
- Wrapper and middleware code under `src/lib/api/**` should also throw typed errors in the same way when the execution path is covered by `withErrorBoundary`.
- Use `jsonError(...)` when you need the canonical shape **without** that wrapper (e.g. small pre-boundary checks, or a handler that cannot yet be refactored to `throw` only). This is a convenience path, not a “legacy only” exception list.

Do not return ad-hoc `Response.json(...)` error payloads from API handlers.

### Completed bulk operations

A completed bulk evaluation returns HTTP `200` with its per-item result array,
including when every item has an intentional domain outcome such as a conflict
or not found result. An unexpected execution failure must escape to the
canonical HTTP `500` response; never synthesize it as an item conflict.

## Required client parser

Client fetch consumers must parse errors with:

- `parseApiErrorResponse(...)` from `src/lib/api/error-response.ts`

Do not hand-roll `await response.json()` parsing for `error/message/code` in each hook/component.

## Plan entitlement codes

Stable machine-readable codes for subscription admission, selection, and
content access. HTTP statuses are fixed; reuse existing quota `429` mapping
for regeneration overage (`REGENERATION_QUOTA_EXCEEDED`).

| Code                                | HTTP | Thrown in this contract                                                                                     |
| ----------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------- |
| `SUBSCRIPTION_REQUIRED`             | 403  | Any generation (create, retry, regenerate, lesson) by the no-subscription `free` tier; `details.upgradeUrl` |
| `FREE_PLAN_SELECTION_REQUIRED`      | 409  | Downgrade with 2+ unselected plans                                                                          |
| `PLAN_ENTITLEMENT_REQUIRED`         | 403  | Direct access to a locked owned plan                                                                        |
| `PLAN_REGENERATION_NOT_INCLUDED`    | 403  | Free regeneration policy denial; the route returns `SUBSCRIPTION_REQUIRED` first                            |
| `REGENERATION_QUOTA_EXCEEDED`       | 429  | Paid regeneration monthly overage                                                                           |
| `PLAN_DURATION_LIMIT_EXCEEDED`      | 403  | Create or regenerate duration exceeds the actor tier cap                                                    |
| `MODEL_NOT_AVAILABLE_FOR_OPERATION` | 403  | Reserved for model-policy API mapping                                                                       |
| `AI_BUDGET_EXHAUSTED`               | 429  | The user reached their monthly AI spend ceiling (DEV-208); `details.resetsAt`                               |
| `AI_GENERATION_PAUSED`              | 503  | The actor's tier reached its daily AI spend ceiling (DEV-208); `details.resetsAt`                           |

Do not add `MODULE_ENTITLEMENT_REQUIRED`. Clerk Dashboard Features and Clerk `has()` / `Protect` are merchandising only; they are not a second authorization system and do not emit these codes. Constants live in
`src/shared/constants/api-error-codes.ts`.

## Request admission codes

Checks that run before a route handler (DEV-208):

| Code                     | HTTP | When                                                                                                                                                                                                                                                                                           |
| ------------------------ | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FORBIDDEN`              | 403  | A mutating request (`POST`, `PUT`, `PATCH`, `DELETE`) to an authenticated route whose `Sec-Fetch-Site` is not `same-origin` or `none`, or whose `Origin` host differs from the request host. Message: `Cross-origin request rejected.` (`src/lib/api/request-origin.ts`, called by `withAuth`) |
| `UNSUPPORTED_MEDIA_TYPE` | 415  | `parseJsonBody` was given a body whose `Content-Type` media type is not `application/json`, checked before the body is read                                                                                                                                                                    |
| `PAYLOAD_TOO_LARGE`      | 413  | `parseJsonBody` with `maxBytes`: the declared or streamed body is over the cap                                                                                                                                                                                                                 |

Requests with neither `Sec-Fetch-Site` nor `Origin` (scripts, server-to-server calls) pass the origin check; the session is still required.

## Default status-to-code mapping

If code is not explicitly provided, defaults are:

- `400` -> `BAD_REQUEST`
- `401` -> `UNAUTHORIZED`
- `403` -> `FORBIDDEN`
- `404` -> `NOT_FOUND`
- `405` -> `METHOD_NOT_ALLOWED`
- `409` -> `CONFLICT`
- `422` -> `UNPROCESSABLE_ENTITY`
- `429` -> `RATE_LIMITED`
- `500` -> `INTERNAL_ERROR`
- `501` -> `NOT_IMPLEMENTED`
- fallback -> `ERROR`

## Examples

### Validation Error

```json
{
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "classification": "validation",
  "details": { "field": "weeklyHours", "reason": "must be >= 1" }
}
```

### Rate Limit Error

```json
{
  "error": "Rate limit exceeded. Maximum 10 requests allowed per hour.",
  "code": "RATE_LIMITED",
  "classification": "rate_limit",
  "retryAfter": 3542
}
```

### Internal Error

```json
{
  "error": "Internal Server Error",
  "code": "INTERNAL_ERROR"
}
```

## Forbidden patterns

- Nested error objects such as `{ "error": { "message": "..." } }`
- String-only errors without code
- Route-specific custom error shapes
- Client-side ad-hoc parsing that bypasses `parseApiErrorResponse(...)`

## Related files

- `src/lib/api/response.ts`
- `src/lib/api/errors.ts`
- `src/lib/api/error-response.ts`
- `docs/api/rate-limiting.md`
