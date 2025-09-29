# Failure Classification Matrix

The AI orchestrator normalizes every failure into a small, deterministic vocabulary so downstream consumers can reason about retry policies, analytics, and user messaging. This matrix enumerates the triggers for each classification and links to the enforcing tests.

## Overview

| Classification   | Trigger Conditions                                                                                                                         | Notes                                                                                        | Primary Tests                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `validation`     | Parsed output fails structural validation (no modules, duplicate ordering, invalid minutes) or input schema rejected before provider call. | Attempt records contain `modules_count = 0`.                                                 | `tests/integration/generation.validation.spec.ts`, `tests/unit/ai.parser.validation.spec.ts`          |
| `provider_error` | Provider returns an unexpected error (network failure, malformed stream) that is not rate-limit or timeout.                                | Default catch-all; user-facing message remains generic.                                      | `tests/unit/ai.classification.spec.ts`                                                                |
| `rate_limit`     | Provider indicates throttling (HTTP 429, structured error, or mock scenario).                                                              | Surfaces to clients via standardized 429 response.                                           | `tests/integration/generation.rate_limit.spec.ts`                                                     |
| `timeout`        | Adaptive timeout fires (no module detected before 9.5s) or provider raises `ProviderTimeoutError`.                                         | `timedOut` flag in metadata is `true`.                                                       | `tests/integration/generation.timeout.spec.ts`, `tests/integration/concurrency.timeout-stall.spec.ts` |
| `capped`         | Attempt cap of 3 reached and service skips provider invocation.                                                                            | Logged even though provider is not contacted; plan transitions to `failed` once cap reached. | `tests/integration/generation.cap-boundary.spec.ts`, `tests/unit/attempts.capped.spec.ts`             |

## Matrix by lifecycle stage

| Stage                 | Input condition                                                         | Resulting classification |
| --------------------- | ----------------------------------------------------------------------- | ------------------------ |
| Pre-flight validation | Zod schema rejects request body                                         | `validation`             |
| Pre-flight cap check  | `ATTEMPT_CAP` reached (`preparation.capped = true`)                     | `capped`                 |
| Streaming parse       | JSON stream missing modules or structure invalid                        | `validation`             |
| Provider response     | Provider signals rate limit or returns error with `kind = 'rate_limit'` | `rate_limit`             |
| Provider response     | Provider signals timeout (`ProviderTimeoutError` or `kind = 'timeout'`) | `timeout`                |
| Provider response     | Any other provider exception                                            | `provider_error`         |
| Timeout controller    | Adaptive timeout aborts before provider yields module                   | `timeout`                |

## Usage guidelines

- New failure scenarios MUST map back to one of the existing classifications. Only introduce a new label with product + analytics sign-off and update this matrix plus the classification tests.
- When wrapping lower-level errors in `AppError`, set the `classification` option to align with this table and add a contract test if external clients rely on the value.
- Metadata payloads store the classification (and timeout flag) under `metadata.failure` to ease observability.

## Related references

- Parser validation rules: `src/lib/ai/parser.ts`
- Classification logic: `src/lib/ai/classification.ts`
- Attempt recording: `src/lib/db/queries/attempts.ts`
- Error responses: `src/lib/api/errors.ts`
