# Slice F — API polish and cleanup

## Step F.0 — Confirm scope / acceptance criteria

- Archived context: this slice plan was originally derived from the shared prelim refactor findings umbrella docs and now stands on its own as the archived Slice F record.
- Keep Slice F in the suggested execution order: after Slices A-E, as post-structure cleanup rather than a new architecture pass. Slices A-E are already merged; this slice must not reopen their decisions.
- In scope:
  - Standardize repeated route JSON parsing in:
    - `src/app/api/v1/stripe/create-checkout/route.ts`
    - `src/app/api/v1/stripe/create-portal/route.ts`
    - `src/app/api/v1/user/profile/route.ts`
    - `src/app/api/v1/user/preferences/route.ts`
    - `src/app/api/v1/plans/[planId]/regenerate/route.ts`
    - `src/app/api/v1/plans/stream/route.ts` (malformed-JSON boundary only; keep route-local schema handling)
  - Clean up `src/features/plans/lifecycle/index.ts` so the barrel only exposes the lifecycle surface that real consumers still need, without duplicated section comments.
- Explicitly preserve current route-specific behavior (audited against the current source, not the original findings):
  - `create-portal` must continue to allow missing/empty bodies and only reject malformed JSON when the request appears to contain JSON (body detection: `content-type` includes `application/json` OR `content-length` is non-null and not `'0'`). Only `SyntaxError` cases with `hasBody = true` currently throw `'Malformed JSON body'` with `{ userId, parseError: err.message }` in `logMeta`; all other thrown cases silently fall through to schema validation with `body = {}`. Preserve that exact asymmetry.
  - Strict routes currently catch **any** error from `req.json()` (the catch is `} catch {`, not `catch (err) if err instanceof SyntaxError`), so a non-`SyntaxError` rejection also produces the strict `ValidationError`. The helper must not tighten that to `SyntaxError`-only without an explicit decision.
  - Malformed-JSON message strings differ across strict routes and must be preserved verbatim:
    - `create-checkout`, `profile`, `preferences`: `'Invalid JSON in request body'` (no trailing period, no `logMeta`)
    - `regenerate`: `'Invalid JSON in request body.'` (with trailing period, no `logMeta`)
    - `create-portal`: `'Malformed JSON body'` with `logMeta: { userId, parseError }`
    - `stream`: `'Invalid request body.'` with `details: { reason: 'Malformed or invalid JSON payload.' }` and `logMeta: { authUserId, error: serializeError(error) }`
  - `plans/stream` must keep its current `ZodError` vs malformed-JSON response split (same `message` `'Invalid request body.'`, different `details` shape: `error.flatten()` vs `{ reason: 'Malformed or invalid JSON payload.' }`).
  - `plans/stream` must also keep emitting the `toPayloadLog(parsedBody)` info log **after** JSON parse succeeds but **before** schema validation — do not lose that log line when the helper replaces the raw `req.json()` call.
  - `plans/[planId]/regenerate` must keep its current `"Invalid JSON in request body."` / `"Invalid overrides."` behavior split.
- Out of scope:
  - Folding Slice A's existing `src/lib/errors/normalize-unknown.ts` / `src/lib/api/coerce-unknown-to-message.ts` helpers into the parser; the parser may import them but must not duplicate or replace them.
  - Lifecycle consolidation, route/session rewrites, or any other Slice D backfill. Slice D already split `stream/helpers.ts` into `src/features/plans/session/*` modules and left `stream/helpers.ts` as a thin re-export shim — do not re-architect that.
  - Reorganizing lifecycle internals beyond the barrel/export surface and the minimum import updates required to keep it compiling.
  - Tightening `create-portal` body-presence detection, adding JSON body size limits, or touching `req.json()` behavior globally.

## Steps F.1–F.5 — Implementation sequence

### Step F.1 — Lock current behavior with focused tests

1. Add a focused helper spec for the shared parser at `tests/unit/lib/api/parse-json-body.spec.ts`.
2. Cover a route-behavior matrix before migrating call sites:
  - required body + valid JSON returns parsed `unknown`
  - required body + malformed JSON invokes the supplied error builder/factory and the thrown error propagates unchanged
  - required body + non-`SyntaxError` rejection from `req.json()` is treated the same as malformed JSON (matches current strict-route `} catch {` behavior)
  - optional body + empty request body (no `content-type`, no/zero `content-length`) returns the configured fallback and does **not** invoke the malformed-JSON builder
  - optional body + malformed JSON when `content-type` or `content-length` indicates a real body invokes the malformed-JSON builder
  - optional body + empty/non-signaled body when `req.json()` rejects with a non-`SyntaxError` matches the current silent-fallback behavior (no throw)
  - verify the helper does not swallow `AbortError` — if an abort propagates out of `req.json()` while awaiting an in-flight body, the helper must re-throw it so `withErrorBoundary` can classify it
3. Add or extend integration assertions in existing route suites so behavior is pinned at the HTTP layer. Only lock the assertions the slice will change — do not broaden route coverage. Existing suites:
  - `tests/integration/stripe/create-checkout.spec.ts` — add malformed-JSON + empty-body 400 cases (none exist today)
  - `tests/integration/stripe/api-routes.spec.ts` (`create-portal`) — add empty-body 200 path and malformed-JSON-with-`Content-Type`-json 400 path (none exist today)
  - `tests/integration/api/user-profile.spec.ts` — add PUT malformed-JSON 400 case
  - `tests/integration/api/user-preferences.spec.ts` — add PATCH malformed-JSON 400 case
  - `tests/integration/api/plans.regenerate.spec.ts` — add POST malformed-JSON 400 case to lock the `"Invalid JSON in request body."` (trailing period) vs `"Invalid overrides."` split that the file currently only covers on the Zod side
  - `tests/integration/api/plans-stream.spec.ts` — add malformed-JSON 400 case that asserts the `details.reason` string so the helper doesn't collapse it into the Zod `error.flatten()` shape
4. Keep the new assertions narrow: exact `error` string, `details` shape (or absence), and HTTP status. Do not assert `logMeta` content in integration tests — those are covered by unit tests that spy on the logger.

### Step F.2 — Introduce the shared JSON-body helper

1. Add `src/lib/api/parse-json-body.ts`.
2. Keep the helper intentionally narrow:
  - own only `req.json()` / malformed-JSON handling
  - return `unknown` so route-level Zod/schema parsing stays in the route
  - let the caller construct the thrown error (see API shape below) so routes preserve their existing message/details/`logMeta` triples verbatim
  - always re-throw abort-like errors (`error.name === 'AbortError'`, `DOMException` with `AbortError`) instead of funneling them through the malformed-JSON builder
3. Recommended API shape (closes Open Decision #2 in favor of a factory):

    ```ts
    type ParseJsonBodyOptions = {
      // Required mode: throws onMalformedJson(err) for every req.json() rejection.
      // Optional mode: only throws when `detectBody(req)` reports a body is present
      // and the rejection is a SyntaxError; otherwise returns `fallback`.
      mode: 'required' | 'optional';
      onMalformedJson: (err: unknown) => Error;
      fallback?: unknown; // defaults to `{}` when mode === 'optional'
      detectBody?: (req: Request) => boolean; // only consulted in 'optional' mode
    };

    function parseJsonBody(
      req: Request,
      options: ParseJsonBodyOptions
    ): Promise<unknown>;
    ```

    - `onMalformedJson` is always a factory, never an option bag. Routes that need `logMeta` close over the already-authenticated `user` / `authUserId` in scope. Factories return `Error` (typically `ValidationError`) so routes keep control of status, code, details, and `logMeta`.
    - `detectBody` defaults to the current `create-portal` heuristic: `contentType.includes('application/json') || (contentLength !== null && contentLength !== '0')`. Export the default so `create-portal` does not reinvent it.
    - The helper does not touch `AbortError`/`DOMException` rejections — it re-throws them untouched so `withErrorBoundary`'s existing abort handling keeps working.
4. Do **not** fold in shared unknown-error normalization from Slice A. The helper may *import* `coerceUnknownToMessage` / `unknownThrownCore` from `src/lib/errors/normalize-unknown.ts` if a route's factory needs them, but that normalization is not the helper's job.
5. Do **not** add JSON body size validation, content-type enforcement, or schema parsing in the helper — those are route or middleware concerns and out of scope for Slice F.

### Step F.3 — Migrate the low-risk strict routes first

1. Switch these routes to the helper in required-body mode:
  - `src/app/api/v1/user/profile/route.ts`
  - `src/app/api/v1/user/preferences/route.ts`
  - `src/app/api/v1/stripe/create-checkout/route.ts`
2. Preserve each route's current outward behavior:
  - Same malformed-JSON message text, including the per-route trailing-period/no-period inconsistency (see F.0). Do **not** silently normalize `'Invalid JSON in request body'` and `'Invalid JSON in request body.'` into one canonical string; that's a behavior change outside Slice F's scope.
  - Same schema-validation path after parsing.
  - No unrelated logging, auth, or response-shape changes.
  - `onMalformedJson` for these three routes should be a one-liner: `(err) => new ValidationError('Invalid JSON in request body')` (or the `.` variant for regenerate). `err` is currently discarded by `} catch {` in two of them; ignoring `err` in the factory matches that.
3. After each migration batch, run the matching targeted tests before moving on.

### Step F.4 — Migrate the custom routes without flattening their differences

1. Update `src/app/api/v1/stripe/create-portal/route.ts` to use optional-body mode.
  - Preserve the current `hasBody` detection by reusing the default `detectBody` from the helper (which is that same heuristic) rather than re-computing headers locally.
  - Preserve the current `'Malformed JSON body'` `ValidationError` path only when the request appears to include JSON content, and keep `logMeta: { userId, parseError: err.message }` — the factory has the `user` in scope and receives `err` to read `err.message`. If `err` is not an instance of `Error`, fall back to `String(err)` rather than logging `undefined`.
  - Do **not** introduce `returnUrl` into the malformed-JSON factory's `logMeta`; that field is only populated on the downstream Zod validation error path and keeping the current `logMeta` shape avoids accidental PII/URL leakage on the earliest error path.
  - Preserve the current silent-fallback behavior: non-`SyntaxError` rejections (or `SyntaxError` without a body) fall through to `createPortalBodySchema.safeParse({})`.
2. Update `src/app/api/v1/plans/[planId]/regenerate/route.ts`.
  - Use the shared helper only for malformed-JSON handling; its factory returns `new ValidationError('Invalid JSON in request body.')` (trailing period preserved).
  - Keep the separate `planRegenerationRequestSchema.parse(body)` call and its existing two-branch `ZodError` vs unknown-error handling that emits `'Invalid overrides.'` — the helper must not try to consume those branches.
3. Update `src/app/api/v1/plans/stream/route.ts`.
  - Reuse the shared helper only up to the raw JSON parse boundary. The factory returns `new ValidationError('Invalid request body.', { reason: 'Malformed or invalid JSON payload.' }, { authUserId, error: serializeError(error) })` so both the `details.reason` string and the `logMeta.error` payload match today.
  - Preserve the `logger.info({ authUserId, payload: toPayloadLog(parsedBody) }, 'Plan stream request payload received')` call. Move it to immediately after the helper returns (before `createLearningPlanSchema.parse(parsedBody)`) so the log line still fires only on successful JSON parse.
  - Keep the route-local `createLearningPlanSchema.parse(...)` call and its existing `ZodError` handling that emits `'Invalid request body.'` with `error.flatten()` as `details`. The message string is intentionally the same as the malformed-JSON path; the distinguishing field is `details`.
  - Keep `toPayloadLog` and `serializeError` in the route module — they are not general-purpose helpers and should not migrate into `src/lib/api/`.
4. If forcing `stream` onto the helper would make the helper too clever, keep the stream route on a thin wrapper around the helper rather than expanding the helper's scope. Given the factory-based API shape in F.2, a direct call should be sufficient; revisit only if preserving the payload log or error shape requires it.

### Step F.5 — Clean up the lifecycle barrel exports

1. Audit current barrel consumers (post-Slice-D). Real importers of `@/features/plans/lifecycle` today:
  - `src/app/api/v1/plans/stream/route.ts` — types only (`GenerationAttemptResult`, `ProcessGenerationInput`)
  - `src/app/api/v1/plans/[planId]/retry/route.ts` — types only (`GenerationAttemptResult`, `ProcessGenerationInput`)
  - `src/features/plans/session/plan-generation-session.ts` — `createPlanLifecycleService`, `JobQueuePort`, and several result-type imports
  - `src/features/plans/session/stream-cleanup.ts` — `markPlanGenerationFailure`
  - `src/features/plans/session/stream-outcomes.ts` — generation result types
  - `src/features/jobs/regeneration-worker.ts` — `createPlanLifecycleService`, `GenerationAttemptResult`, `JobQueuePort`
  - `src/features/plans/api/preflight.ts` — `atomicCheckAndInsertPlan`, `checkPlanDurationCap`
  - Tests: `tests/integration/api/plans-retry.spec.ts`, `tests/integration/api/plans-stream.spec.ts`, `tests/integration/stripe/usage.spec.ts`, `tests/integration/db/usage.spec.ts`, `tests/integration/plans/plan-limit-race-condition.spec.ts`, `tests/unit/plans/duration-caps.spec.ts`
  - Note: `src/app/api/v1/plans/stream/helpers.ts` and `src/features/plans/session/server-session.ts` are now **thin re-export shims** (post-Slice-D) and do not import from the barrel. Do not treat them as consumers.
2. Decide the smallest public lifecycle surface that still makes those imports obvious.
  - Keep truly shared lifecycle entry points on the barrel: `createPlanLifecycleService`, `PlanLifecycleService`, `PlanLifecycleServicePorts`, `isRetryableClassification`, and the result/port types the above consumers pull.
  - Move specialized imports to direct module paths where that makes ownership clearer. Candidates that appear in exactly one feature module and should stop being barrel-exported:
    - `PlanPersistenceAdapter`, `GenerationAdapter`, `QuotaAdapter`, `UsageRecordingAdapter`, `PdfOriginAdapter` — only imported by the factory and tests; tests already import adapters by direct path.
    - `atomicCheckAndInsertPlan`, `checkPlanLimit`, `findRecentDuplicatePlan`, `markPlanGenerationSuccess`, `markPlanGenerationFailure`, `checkPlanDurationCap` — move call sites that still use the barrel to import from `@/features/plans/lifecycle/plan-operations` directly (preflight, stream-cleanup already pattern-matched elsewhere).
    - Rarely-used result types (`DuplicateDetected`, `AttemptCapExceeded`, `QuotaRejection`, `AlreadyFinalized`, `PdfQuotaReservationResult`, `PlanInsertData`, etc.) can stay on the barrel if consumers still need them; prune only the ones with zero current importers to keep the diff small.
  - If narrowing the barrel forces import churn across more than ~6 files outside the consumer list above, pause and keep those exports on the barrel. The goal is clarity, not a barrel-wide rename.
3. Remove the duplicated `// ─── ... ─────` section comments from `src/features/plans/lifecycle/index.ts` (the current file repeats every section header on two consecutive lines). One comment per section is enough.
4. Do not split lifecycle internals or create a new sub-architecture here unless a compile fix absolutely requires it. In particular, do not introduce sub-barrels under `src/features/plans/lifecycle/` as part of this slice.
5. Update importers in lockstep with any removed exports; run `pnpm check:type` after the barrel edit to confirm no consumer was missed.

## Dependencies

- Hard sequencing dependency: Slices A-E are already merged. Treat this as a post-Slice-E cleanup, consistent with the shared prelim plan's execution order.
- Implementation guardrails (formerly "soft dependencies", now concrete because prior slices are done):
  - Import existing Slice A helpers (`src/lib/errors/normalize-unknown.ts`, `src/lib/api/coerce-unknown-to-message.ts`) if a route factory needs them. Do not re-implement unknown-error coercion inside `parseJsonBody()`.
  - `src/app/api/v1/plans/stream/route.ts` and `src/app/api/v1/plans/[planId]/retry/route.ts` now delegate streaming through `createAndStreamPlanGenerationSession` / `retryAndStreamPlanGenerationSession` (Slice D). Slice F must not touch that delegation — it only replaces the inline `req.json()` block.
  - `src/app/api/v1/plans/stream/helpers.ts` is now a thin re-export shim after Slice D. Leave it alone.

## Cross-slice coordination points

- **Slice A done:** keep `parseJsonBody()` focused on request parsing and reuse, not replace, the existing unknown-error helpers.
- **Slice D done:** do not touch stream/retry orchestration, session wiring, lifecycle ownership, or SSE behavior beyond the malformed-JSON parsing call sites and the payload-log repositioning called out in F.4.
- **Slice E done:** client-side lifecycle changes landed; Slice F should not need to touch any hook, component, or client-side controller file.
- **Implementation guardrail:** if the helper design starts requiring changes in lifecycle/session architecture or shared error contracts, stop and re-scope rather than letting Slice F become a stealth rewrite.

## Likely commit split

1. `test:` lock JSON parsing behavior with helper/unit + targeted route coverage.
2. `refactor:` introduce `parseJsonBody()` and migrate the route call sites.
3. `refactor:` narrow lifecycle barrel exports and update imports.

If the barrel cleanup is tiny, commits 2 and 3 can be combined, but keep route parsing and barrel cleanup logically separable in the diff.

## Open decisions

1. **Stream-route adoption shape:** plan direction is to call `parseJsonBody()` directly with a route-supplied `onMalformedJson` factory (see F.2/F.4). Fall back to a route-local wrapper only if the payload-log repositioning can't be done cleanly without one.
2. **Helper API shape:** resolved — use a route-supplied `onMalformedJson: (err: unknown) => Error` factory rather than `message` / `details` / `logMeta` option flags. Factories close over authenticated user context and keep per-route response shapes verbatim. See F.2 for the full signature.
3. **Barrel breadth:** keep one slim `index.ts` and opportunistically move the lowest-traffic specialized exports (adapters, `plan-operations` functions) to direct imports only when the consumer list is ≤6 files. Favor the smallest diff that clarifies ownership; if narrowing would require more churn, leave the export on the barrel.
4. **`SyntaxError` vs all-errors catch for strict routes:** keep the current all-errors behavior (match `} catch {`). Tightening to `err instanceof SyntaxError` is a real behavior change (a non-`SyntaxError` rejection would bubble up as a 500 instead of a 400). Defer that tightening to a dedicated follow-up rather than bundling it into Slice F.

## Validation steps

- Unit helper coverage:
  - `pnpm exec tsx scripts/tests/run.ts unit tests/unit/lib/api/parse-json-body.spec.ts`
- Targeted integration suites for touched routes:
  - `pnpm exec tsx scripts/tests/run.ts integration tests/integration/stripe/create-checkout.spec.ts`
  - `pnpm exec tsx scripts/tests/run.ts integration tests/integration/stripe/api-routes.spec.ts`
  - `pnpm exec tsx scripts/tests/run.ts integration tests/integration/api/user-profile.spec.ts`
  - `pnpm exec tsx scripts/tests/run.ts integration tests/integration/api/user-preferences.spec.ts`
  - `pnpm exec tsx scripts/tests/run.ts integration tests/integration/api/plans.regenerate.spec.ts`
  - `pnpm exec tsx scripts/tests/run.ts integration tests/integration/api/plans-stream.spec.ts`
- Repo validation before closing:
  - `pnpm check:type`
  - `pnpm check:lint`
  - `pnpm test:changed`
  - `pnpm check:full`

## Verification / closure

- **AC: shared route JSON parsing is standardized without flattening route semantics.**
  - Proof: all listed routes use the shared helper (or an intentionally tiny stream wrapper around it), and targeted route tests remain green. No malformed-JSON message string, `details` shape, or `logMeta` triple changes relative to pre-slice behavior.
- **AC: billing portal optional-body behavior is preserved.**
  - Proof: `tests/integration/stripe/api-routes.spec.ts` covers empty-body success/fallback (no throw), malformed-body rejection only when the request appears to contain JSON, and silent fall-through when the rejection is a non-`SyntaxError`.
- **AC: strict routes still reject malformed JSON immediately.**
  - Proof: targeted route tests for checkout/profile/preferences/regenerate confirm their current 400-path behavior, including the per-route trailing-period/no-period wording.
- **AC: stream route keeps its current validation split and payload logging.**
  - Proof: `tests/integration/api/plans-stream.spec.ts` continues to distinguish malformed JSON (`details.reason`) from schema validation (`details = error.flatten()`) without changing SSE/lifecycle behavior, and the `'Plan stream request payload received'` log line still fires exactly once per successful parse.
- **AC: `AbortError` and non-parse rejections are not misclassified as malformed JSON.**
  - Proof: `tests/unit/lib/api/parse-json-body.spec.ts` covers abort re-throw; strict-route tests still 400 on non-`SyntaxError` rejections (matching current `} catch {` behavior).
- **AC: lifecycle barrel cleanup stays cleanup-sized.**
  - Proof: `src/features/plans/lifecycle/index.ts` is smaller/clearer, the known consumers compile against the narrowed surface, duplicated section comments are gone, and no lifecycle internals are rewritten. `pnpm check:type` passes without changes to any non-enumerated file.
- **AC: Slice F remains aligned with the prelim execution order and does not become a backdoor rewrite.**
  - Proof: the final diff is limited to `src/lib/api/parse-json-body.ts`, the enumerated route call sites, new/extended tests in the paths listed in F.1, the lifecycle barrel, and minimal import updates only.
