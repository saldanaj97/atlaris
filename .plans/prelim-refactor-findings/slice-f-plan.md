# Slice F — API polish and cleanup

## Step F.0 — Confirm scope / acceptance criteria

- Primary source of truth: `.plans/prelim-refactor-findings/prelim-plan.md` and `.plans/prelim-refactor-findings/prelim-research.md` (Slice F section, lines 425-490).
- Keep Slice F in the suggested execution order: after Slices A-E, as post-structure cleanup rather than a new architecture pass.
- In scope:
  - Standardize repeated route JSON parsing in:
    - `src/app/api/v1/stripe/create-checkout/route.ts`
    - `src/app/api/v1/stripe/create-portal/route.ts`
    - `src/app/api/v1/user/profile/route.ts`
    - `src/app/api/v1/user/preferences/route.ts`
    - `src/app/api/v1/plans/[planId]/regenerate/route.ts`
    - `src/app/api/v1/plans/stream/route.ts` (malformed-JSON boundary only; keep route-local schema handling)
  - Clean up `src/features/plans/lifecycle/index.ts` so the barrel only exposes the lifecycle surface that real consumers still need, without duplicated section comments.
- Explicitly preserve current route-specific behavior:
  - `create-portal` must continue to allow missing/empty bodies and only reject malformed JSON when the request appears to contain JSON.
  - Strict routes must continue to fail immediately on malformed JSON.
  - `plans/stream` must keep its current `ZodError` vs malformed-JSON response split.
  - `plans/[planId]/regenerate` must keep its current `"Invalid JSON in request body."` / `"Invalid overrides."` behavior split.
- Out of scope:
  - Pulling Slice A error-normalization work into this helper.
  - Lifecycle consolidation, route/session rewrites, or any other Slice D backfill.
  - Reorganizing lifecycle internals beyond the barrel/export surface and the minimum import updates required to keep it compiling.

## Steps F.1–F.5 — Implementation sequence

### Step F.1 — Lock current behavior with focused tests

1. Add a focused helper spec for the shared parser (likely `tests/unit/lib/api/parse-json-body.spec.ts`).
2. Cover a route-behavior matrix before migrating call sites:
   - required body + valid JSON
   - required body + malformed JSON
   - optional body + empty request body
   - optional body + malformed JSON when `content-type`/`content-length` indicates a real body
   - optional body + empty/non-signaled body falling back to `{}` (or the chosen default)
3. Add or extend integration assertions in existing route suites so behavior is pinned at the HTTP layer:
   - `tests/integration/stripe/create-checkout.spec.ts`
   - `tests/integration/stripe/api-routes.spec.ts` (`create-portal`)
   - `tests/integration/api/user-profile.spec.ts`
   - `tests/integration/api/user-preferences.spec.ts`
   - `tests/integration/api/plans.regenerate.spec.ts`
   - `tests/integration/api/plans-stream.spec.ts`
4. Prefer adding only the assertions needed to lock existing malformed-JSON/empty-body behavior; do not broaden route coverage beyond Slice F.

### Step F.2 — Introduce the shared JSON-body helper

1. Add `src/lib/api/parse-json-body.ts`.
2. Keep the helper intentionally narrow:
   - own only `req.json()` / malformed-JSON handling
   - return `unknown` so route-level Zod/schema parsing stays in the route
   - throw `ValidationError` (or a route-supplied builder) for malformed JSON only
3. Support the minimum configuration needed by the existing route matrix:
   - `mode: 'required' | 'optional'`
   - optional fallback value for empty/missing body
   - request-aware body-presence detection for the `create-portal` semantics
   - customizable malformed-JSON message/details/log metadata so routes can preserve current response shapes
4. Do **not** fold in shared unknown-error normalization from Slice A; if the helper needs any error coercion, keep it local and small.

### Step F.3 — Migrate the low-risk strict routes first

1. Switch these routes to the helper in required-body mode:
   - `src/app/api/v1/user/profile/route.ts`
   - `src/app/api/v1/user/preferences/route.ts`
   - `src/app/api/v1/stripe/create-checkout/route.ts`
2. Preserve each route’s current outward behavior:
   - same malformed-JSON message text
   - same schema-validation path after parsing
   - no unrelated logging or auth changes
3. After each migration batch, run the matching targeted tests before moving on.

### Step F.4 — Migrate the custom routes without flattening their differences

1. Update `src/app/api/v1/stripe/create-portal/route.ts` to use optional-body mode.
   - Preserve the current `hasBody` detection based on request headers.
   - Preserve the current `"Malformed JSON body"` `ValidationError` path only when the request appears to include JSON content.
   - Preserve `returnUrl`-specific validation/log metadata.
2. Update `src/app/api/v1/plans/[planId]/regenerate/route.ts`.
   - Use the shared helper only for malformed-JSON handling.
   - Keep the separate `planRegenerationRequestSchema` parsing and existing `"Invalid overrides."` responses.
3. Update `src/app/api/v1/plans/stream/route.ts`.
   - Reuse the shared helper only up to the raw JSON parse boundary.
   - Keep route-local `createLearningPlanSchema.parse(...)` handling and current `ValidationError('Invalid request body.', ...)` shapes for both malformed JSON and Zod failures.
4. If forcing `stream` onto the helper would make the helper too clever, keep the stream route on a thin wrapper around the helper rather than expanding the helper’s scope.

### Step F.5 — Clean up the lifecycle barrel exports

1. Audit current barrel consumers first:
   - `src/app/api/v1/plans/stream/route.ts`
   - `src/app/api/v1/plans/[planId]/retry/route.ts`
   - `src/app/api/v1/plans/stream/helpers.ts`
   - `src/features/jobs/regeneration-worker.ts`
   - `src/features/plans/api/preflight.ts`
   - `src/features/plans/session/server-session.ts`
2. Decide the smallest public lifecycle surface that still makes those imports obvious.
   - Keep truly shared lifecycle entry points/types on the barrel.
   - Move specialized imports to direct module paths where that makes ownership clearer.
3. Remove the duplicated section comments from `src/features/plans/lifecycle/index.ts`.
4. Do not split lifecycle internals or create a new sub-architecture here unless a compile fix absolutely requires it.

## Dependencies

- Hard sequencing dependency: treat this as a post-Slice-E cleanup, consistent with the shared prelim plan’s execution order.
- Soft dependency on Slice A: if Slice A changes shared API error helpers, re-read those utilities before finalizing `parseJsonBody()` so Slice F does not reintroduce duplicate normalization.
- Soft dependency on Slice D: re-check `plans/stream` and `plans/[planId]/regenerate` immediately before implementation because those are overlap hotspots.

## Cross-slice coordination points

- **Slice A overlap:** keep `parseJsonBody()` focused on request parsing, not general unknown-error normalization.
- **Slice D overlap:** avoid touching stream/retry orchestration, session wiring, lifecycle ownership, or SSE behavior beyond malformed-JSON parsing call sites.
- **Implementation guardrail:** if the helper design starts requiring changes in lifecycle/session architecture or shared error contracts, stop and re-scope rather than letting Slice F become a stealth rewrite.

## Likely commit split

1. `test:` lock JSON parsing behavior with helper/unit + targeted route coverage.
2. `refactor:` introduce `parseJsonBody()` and migrate the route call sites.
3. `refactor:` narrow lifecycle barrel exports and update imports.

If the barrel cleanup is tiny, commits 2 and 3 can be combined, but keep route parsing and barrel cleanup logically separable in the diff.

## Open decisions

1. **Stream-route adoption shape:** use the helper directly with route-supplied malformed-JSON error config, or keep a tiny route-local wrapper if that preserves today’s `ValidationError` payloads more cleanly.
2. **Helper API shape:** whether malformed-JSON customization is best expressed as option flags (`message`, `details`, `logMeta`) or a single route-supplied error factory.
3. **Barrel breadth:** keep one slim `index.ts` or move one or two consumers to direct imports and leave only the genuinely shared lifecycle API on the barrel. Favor the smallest diff that clarifies ownership.

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
  - Proof: all listed routes use the shared helper (or an intentionally tiny stream wrapper around it), and targeted route tests remain green.
- **AC: billing portal optional-body behavior is preserved.**
  - Proof: `tests/integration/stripe/api-routes.spec.ts` covers empty-body success/fallback and malformed-body rejection only when the request appears to contain JSON.
- **AC: strict routes still reject malformed JSON immediately.**
  - Proof: targeted route tests for checkout/profile/preferences/regenerate confirm their current 400-path behavior.
- **AC: stream route keeps its current validation split.**
  - Proof: `tests/integration/api/plans-stream.spec.ts` continues to distinguish malformed JSON from schema validation without changing SSE/lifecycle behavior.
- **AC: lifecycle barrel cleanup stays cleanup-sized.**
  - Proof: `src/features/plans/lifecycle/index.ts` is smaller/clearer, the known consumers compile against the narrowed surface, and no lifecycle internals are rewritten.
- **AC: Slice F remains aligned with the prelim execution order and does not become a backdoor rewrite.**
  - Proof: the final diff is limited to the shared parse helper, the enumerated route call sites/tests, the lifecycle barrel, and minimal import updates only.
