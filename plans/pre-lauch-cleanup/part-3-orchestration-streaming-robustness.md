# Part 3 - Orchestration and Streaming Robustness Audit

Date: 2026-02-10

Scope reviewed:

- `plans/plan-generation-audit/audit-overview.md`
- `src/lib/ai/orchestrator.ts`
- `src/lib/ai/providers/openrouter.ts`
- `src/lib/ai/providers/router.ts`
- `src/lib/ai/timeout.ts`
- `src/lib/ai/failures.ts`
- `src/lib/ai/streaming/events.ts`
- `src/app/api/v1/plans/stream/helpers.ts`
- Relevant generation tests in `tests/unit/**` and `tests/integration/**`

## Executive summary

The orchestration path is close, but still has avoidable reliability and debuggability risk from layered timeouts/retries, weak abort propagation at stream boundaries, and an unsafe SSE/telemetry error surface. The main pattern is control-flow split across too many layers with no strict contract for who owns retries, timeout policy, and user-safe error messaging.

## Prioritized findings

## Critical

### 1) SSE error payload currently leaks internal/provider messages

- Why it matters:
  - Internal provider messages, stack-adjacent text, or upstream API details can leak directly to clients.
  - This creates security/abuse intelligence leakage and unstable client UX (message text changes by provider/runtime).
- Evidence:
  - `src/lib/ai/failures.ts:16` returns raw `Error.message`.
  - `src/app/api/v1/plans/stream/helpers.ts:90` emits that raw message in SSE `error` event payload.
  - `plans/plan-generation-audit/audit-overview.md:111` flags this as a hardening item.
- Recommended refactor/fix:
  - Replace raw message passthrough with classification-to-safe-message mapping.
  - Keep detailed diagnostics in structured logs/Sentry only.
  - SSE contract should expose stable fields only: `{ code, classification, retryable, requestId }`.
- Test cases to add/update:
  - Unit: `formatGenerationError` (or successor) must never return raw provider text.
  - Unit: `handleFailedGeneration` emits only approved message set by classification.
  - Integration: stream failure from synthetic provider error containing sensitive string; assert SSE does not include it.

### 2) Observability hooks capture sensitive/high-volume prompt and response payloads

- Why it matters:
  - Full prompt and partial response content in span attributes can expose user data and inflate telemetry payload size/cost.
  - These attributes are difficult to sanitize downstream and can violate logging policy intent.
- Evidence:
  - `src/lib/ai/providers/openrouter.ts:80` stores full request messages in span attributes.
  - `src/lib/ai/providers/openrouter.ts:172` stores response text slice in span attributes.
  - `src/lib/ai/providers/openrouter.ts:122` logs provider response body on error.
- Recommended refactor/fix:
  - Remove prompt/response content from span attributes.
  - Keep only bounded metadata: model, token counts, status code, classification, latency, attempt id.
  - If content sampling is required, gate behind explicit secure debug flag and redact by default.
- Test cases to add/update:
  - Unit: OpenRouter provider should set only allowlisted span attributes.
  - Unit: error logging path should omit response body text by default.

## High

### 3) Retry layering is too broad and can amplify cost/timeouts

- Why it matters:
  - Router retries all provider errors once, including non-retryable classes (e.g., invalid response/validation-like failures).
  - Timeouts can become double attempts under pressure, increasing cost and tail latency.
- Evidence:
  - `src/lib/ai/providers/router.ts:73` wraps every provider call in `pRetry` with no retry filter.
  - `src/lib/ai/providers/router.ts:74` uses `retries: 1` globally.
  - `src/lib/ai/classification.ts:35` treats parser validation separately, but retry decision occurs before this layer.
- Recommended refactor/fix:
  - Introduce retry policy with explicit allowlist (`rate_limit`, transient network, 5xx).
  - Do not retry on invalid response/validation/abort.
  - Make retry budget explicit in orchestrator context (single owner), not hidden in router.
- Test cases to add/update:
  - Unit: router does not retry `ProviderInvalidResponseError`.
  - Unit: router retries exactly once on synthetic 429/5xx transient error.
  - Integration: timeout path verifies no extra provider invocation after abort.

### 4) Timeout policy is inconsistent and partially dead-configured

- Why it matters:
  - Effective runtime timeout defaults come from `createAdaptiveTimeout` (10s), while env defaults are 30s/15s and currently unused.
  - Provider `timeoutMs` only receives `options.timeoutConfig?.baseMs`; when unset, provider has no explicit timeout budget.
  - This creates hidden behavior drift and confusing operations tuning.
- Evidence:
  - `src/lib/ai/timeout.ts:8` default `baseMs` is `10_000`.
  - `src/lib/config/env.ts:372` defines `aiTimeoutEnv` (30s/15s) but is not consumed in source.
  - `src/lib/ai/orchestrator.ts:225` passes provider timeout only when `timeoutConfig` is provided.
  - `tests/unit/config/ai-timeout-env.spec.ts:42` validates env behavior that is not wired into orchestrator.
- Recommended refactor/fix:
  - Single timeout source of truth in orchestrator (wired from `aiTimeoutEnv`).
  - Always pass explicit timeout budget downstream.
  - Document one ownership model: orchestrator budget controls provider request and parse budget.
- Test cases to add/update:
  - Unit: orchestrator uses `aiTimeoutEnv` when caller does not override.
  - Unit: provider receives explicit timeout every run.
  - Integration: env override changes effective timeout behavior.

### 5) Abort propagation is incomplete at stream boundaries

- Why it matters:
  - If consumer disconnect/cancel handling is not propagated cleanly, generation work may continue unnecessarily.
  - Non-cooperative streams can still keep parser loop alive, reducing cancellation reliability.
- Evidence:
  - `src/lib/ai/streaming/events.ts:22` implements `start` only; no `cancel` hook for consumer cancellation.
  - `src/lib/ai/parser.ts:34` parsing loop has no explicit signal checks.
  - `src/lib/ai/providers/mock.ts:204` ignores `GenerationOptions.signal` (test provider masking abort behavior).
  - `src/lib/ai/orchestrator.ts:201` does combine timeout+external signals correctly, but downstream enforcement is partial.
- Recommended refactor/fix:
  - Add `cancel(reason)` in `createEventStream` and propagate cancellation to handler-owned abort controller.
  - Add optional `signal` to parser callbacks/options; fail fast on abort before/inside loop.
  - Update mock provider to honor signal in tests so abort coverage is meaningful.
- Test cases to add/update:
  - Unit: cancelling stream reader triggers handler abort path.
  - Unit: parser exits with abort error when signal is aborted mid-stream.
  - Integration: client disconnect causes provider invocation to terminate promptly.

### 6) Stream error contract is brittle (handler throw -> abrupt stream error)

- Why it matters:
  - Current behavior can terminate stream without guaranteed final `error` event.
  - Client receives transport failure instead of stable terminal event, complicating UX and retries.
- Evidence:
  - `src/lib/ai/streaming/events.ts:31` uses `controller.error(error)` on handler failure.
  - `src/app/api/v1/plans/stream/route.ts:201` rethrows after `safeMarkPlanFailed`, forcing transport-level error.
  - `tests/integration/api/plans-stream.spec.ts:118` explicitly swallows stream errors, indicating unstable contract.
- Recommended refactor/fix:
  - Do not rethrow inside stream handler after persistence fallback.
  - Emit a final sanitized `error` event and close stream gracefully.
  - Reserve `controller.error` for truly unrecoverable serialization failures.
- Test cases to add/update:
  - Integration: orchestrator throw still yields terminal SSE `error` event and clean close.
  - Integration: no client-side stream read exception for expected failure modes.

## Medium

### 7) OpenRouter provider and parser duplicate validation/parsing responsibilities

- Why it matters:
  - Provider validates JSON against `PlanSchema`, then orchestrator parser reparses/validates stream output.
  - This doubles failure paths and cognitive load without clear contract boundaries.
- Evidence:
  - `src/lib/ai/providers/openrouter.ts:186` parses/validates JSON against `PlanSchema`.
  - `src/lib/ai/providers/base.ts:65` converts structured plan back into stream text.
  - `src/lib/ai/parser.ts:153` reparses JSON and revalidates module/task shape.
- Recommended refactor/fix:
  - Pick one owner for structural validation:
    - Option A: provider returns typed `PlanOutput`; orchestrator skips textual parser.
    - Option B: provider returns raw text only; parser remains sole validator.
  - Remove conversion-to-stream-then-reparse cycle.
- Test cases to add/update:
  - Unit: provider contract test verifies either typed output or raw text (not both).
  - Integration: one canonical validation failure path and classification.

### 8) Responsibility and type layering are fragmented

- Why it matters:
  - Multiple parallel type surfaces and dead config paths make debugging and onboarding slower.
  - Increases drift risk between comments/docs and behavior.
- Evidence:
  - `src/lib/ai/provider.ts:3` re-exports provider types for compatibility.
  - `src/lib/ai/types/provider.types.ts:1` defines canonical types.
  - `src/lib/config/env.ts:372` timeout env config exists without runtime consumption.
  - `tests/unit/config/ai-timeout-env.spec.ts:25` tests dead path behavior.
- Recommended refactor/fix:
  - Collapse to one provider type module and deprecate compatibility shim after migration.
  - Wire or remove `aiTimeoutEnv`; do not keep inert configuration.
  - Update docs/comments to reflect actual non-streaming OpenRouter behavior (`stream: false`).
- Test cases to add/update:
  - Unit: compile-time/API contract tests around single provider type entrypoint.
  - Unit: remove or rewrite timeout env tests to align with actual orchestrator wiring.

### 9) Coverage gaps in orchestration failure surfaces

- Why it matters:
  - The riskiest code paths (SSE error hygiene, helper behavior, abort propagation) currently lack direct tests.
  - This allows regressions in launch-critical behavior.
- Evidence:
  - No tests found for `handleSuccessfulGeneration`, `handleFailedGeneration`, `safeMarkPlanFailed`, `formatGenerationError`.
  - Existing tests focus on happy-path stream persistence and broad provider behavior (`tests/integration/api/plans-stream.spec.ts`, `tests/unit/ai/providers/*.spec.ts`).
- Recommended refactor/fix:
  - Add unit tests around stream helpers and failures util.
  - Add integration tests for disconnect/cancel and sanitized error contract.
- Test cases to add/update:
  - Unit: helper emits expected event schema and status-mark side effects.
  - Integration: retryable vs non-retryable failure behavior on plan status updates.

## Recommended layering model

Use one-way responsibilities with explicit ownership of retries/timeouts/errors:

1. API route (`/plans/stream`)
   - Auth, rate limits, input validation, model entitlement.
   - Creates request-scoped context (`requestId`, `userId`, `abortSignal`).
   - Starts SSE and delegates orchestration.

2. Orchestrator (`runGenerationAttempt`)
   - Owns execution policy: global timeout budget, retry budget, cancellation fan-in.
   - Calls provider router once per policy attempt.
   - Classifies failures, records attempts, returns normalized result object.
   - Does not leak raw errors; returns stable machine codes.

3. Provider router (`RouterGenerationProvider`)
   - Provider selection/fallback only.
   - No blind retry; if retry remains here, must be transient-only and policy-driven by orchestrator.

4. Provider client (`OpenRouterProvider`)
   - Pure transport adapter: build request, execute with signal/timeout, map SDK errors to typed provider errors.
   - No business-level classification and no sensitive payload logging.

5. Parser/normalizer
   - Single owner of response validation and normalization.
   - Produces typed modules/tasks for pacing + persistence.

6. Stream event adapter (`helpers.ts` + `streaming/events.ts`)
   - Converts result to sanitized SSE contract.
   - Guarantees terminal event (`complete` or `error`) and clean close.

## Suggested implementation order

1. Lock SSE/error hygiene (Findings 1 and 6).
2. Remove sensitive telemetry payloads (Finding 2).
3. Unify timeout/retry ownership in orchestrator (Findings 3 and 4).
4. Complete abort propagation and add disconnect tests (Finding 5).
5. Simplify provider/parser contracts and remove dead config/type drift (Findings 7 and 8).
