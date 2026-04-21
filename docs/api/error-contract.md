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
- `classification` (optional): one of `validation | provider_error | rate_limit | timeout | capped`.
- `details` (optional): structured metadata safe to expose to clients.
- `retryAfter` (optional): seconds until client should retry (typically rate limit responses).

## Required server helpers

Use these helpers only:

- `jsonError(...)` from `src/lib/api/response.ts`
- `toErrorResponse(...)` from `src/lib/api/errors.ts`

### Route/middleware pattern (required)

- In handlers wrapped by `withErrorBoundary(...)`, throw typed `AppError` variants (`ValidationError`, `AuthError`, `NotFoundError`, etc.) instead of returning ad-hoc `Response.json(...)` error payloads.
- Wrapper/middleware utilities in `src/lib/api/**` should also throw typed errors; let `withErrorBoundary(...)` serialize them through `toErrorResponse(...)`.
- Reserve direct `jsonError(...)` returns for legacy handlers that cannot use `withErrorBoundary(...)` yet.

Do not return ad-hoc `Response.json(...)` error payloads from API handlers.

## Required client parser

Client fetch consumers must parse errors with:

- `parseApiErrorResponse(...)` from `src/lib/api/error-response.ts`

Do not hand-roll `await response.json()` parsing for `error/message/code` in each hook/component.

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
- `docs/rules/api/rate-limiting.md`
