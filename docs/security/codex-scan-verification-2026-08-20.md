# Codex Security Scan Verification

## Baseline

- Scan ID: `1ebeff2f-25a0-4eff-bdb5-efabddda8453`
- Sealed scan SHA: `ce21da6d24560abcd36f6ad6bfdab6538badf951`
- Current develop SHA: `0a2a6a3cc23ff6b7f582a171a57de1766984a23e` (`HEAD` and `origin/develop` were identical at report draft; `0/0` divergence)
- Verification branch: `security/codex-security-scan-fixes`
- Date: 2026-08-20 (America/Chicago)
- Test environment: Local working tree on the verification branch, started from the develop SHA above. Focused Vitest unit and integration runs recorded in worker handoffs. No preview or production deployment was authorized. Canonical scan artifacts (`report.md`, `findings.json`, `scan-manifest.json`, `coverage.json`) were not modified.
- External controls inspected: Read-only. Vercel CLI 53.2.0 listed a published rate-limit rule on `^/ingest(?:/|$)` (100 requests / 60 seconds / IP, action `rate_limit`) and a published method-deny rule on the same path that rejects methods other than GET, HEAD, POST, and OPTIONS. No draft rules; `pendingChanges = 0`. The Firewall overview was unavailable because the CLI required an IP bypass; that limitation is recorded, not inferred. PostHog project `551450` settings were inspected without recording secrets; session replay and masking were enabled. This report records no token, session material, or credential value.

This report does **not** declare the scan fully remediated. Local source fixes and automated tests exist for all six findings, and `pnpm test` plus `pnpm check:full` later exited 0 (see Full Validation). Hosted sentinel capture, live Vercel rate-threshold exercise, preview smoke tests, and firewall overview remain deferred without deployment authorization. The scan is not fully remediated until those hosted gates are proven.

## Summary

| Finding ID | Original severity | Final disposition | Current severity | Fix PR/commit | Evidence |
|---|---:|---|---:|---|---|
| `csf_fd68543d3520e162ac2643c4` | High | Confirmed — Fixed | Residual until hosted sentinel proof | Pending — local working tree only | Application-owned `/ingest` proxy; unit header-strip tests (33 passed in `ingest-proxy.spec.ts` last worker run). Hosted session-header capture not run. |
| `csf_d96410ccc4c1e9180d9b2348` | Medium | Confirmed — Fixed | None (local automated) | Pending — local working tree only | `providerStartedAt` settlement + stale-marker cleanup + ns3 lifecycle lock. Unit 33 + 55; lesson boundary 19/19 after stale-assert fix; lifecycle lock integration 9/9; abandoned-marker cleanup integration 6/6. |
| `csf_5a4d4ce1935028ded77c7665` | Medium | Confirmed — Fixed | Residual until live rate-threshold proof | Pending — local working tree only | Same `/ingest` proxy path/method/body allowlists; Vercel rule inspected read-only. Live threshold not crossed. |
| `csf_c5b56b8805301b01be4acfa6` | Medium | Confirmed — Fixed | None (local automated) | Pending — local working tree only | Per-user admission lock + atomic last-good failure UPDATE. Quota-cap / persistence / cleanup integration: 22 passed. |
| `csf_57cb64ce0282ad978f485c72` | Medium | Confirmed — Fixed | None (local automated) | Pending — local working tree only | Namespace-2 payer lock + bounded Clerk refresh. Unit 16; webhook-claims integration 17, including reverse-completion and hung-fetch cases. |
| `csf_b2d5b3cb56a146e0ea1edbd5` | Low | Already Remediated After Scan | None | Production `maxBytes` already on develop; test-only local additions pending commit | All seven production `parseJsonBody` callers pass a finite cap. Focused run: 38 tests passed across `tests/unit/lib/api/parse-json-body.spec.ts` and `tests/unit/api/plans.bulk-delete-route.spec.ts`, including malformed, negative, overflow, and unsafe `Content-Length` bodies. |

## Finding 1: PostHog Credential Forwarding

### Current Code

The sealed scan described Next.js external rewrites of `/ingest/*` with Clerk middleware excluding that prefix and no application-owned outbound header allowlist.

Current working-tree code replaces those rewrites with an application-owned proxy:

- `src/app/ingest/[...path]/route.ts` — public catch-all that delegates GET/HEAD/POST/PUT/PATCH/DELETE/OPTIONS to `proxyIngestRequest`.
- `src/lib/posthog/ingest-proxy.ts` — path, method, body, origin, redirect, timeout, and header policy. `buildOutboundHeaders` constructs a new `Headers` object and, for body-bearing paths, copies only `content-type` and `content-encoding` after allowlist checks. Session, identity, and forwarding inbound headers are never copied.
- `next.config.ts` — external PostHog rewrites removed; `skipTrailingSlashRedirect` retained so exact `/e/`, `/s/`, and `/flags/` are not redirected before the proxy.
- `src/proxy.ts` — Clerk matcher still excludes `/ingest`; the comment states the ingest route owns validation.

Origins come from `resolvePostHogRewriteDestinations` only. HTTPS is required except http loopback in non-production.

### Reproduction Method

Local unit tests in `tests/unit/lib/posthog/ingest-proxy.spec.ts` send mocked requests that include session, identity, Clerk-prefixed, and forwarding headers, then assert those names are absent from the upstream `fetch` headers. Downstream tests assert Set-Cookie, WWW-Authenticate, Server, Location, and tracing headers are stripped from the client response.

Controlled hosted reproduction (preview deployment, non-production sentinel session headers, disposable upstream receiver) was **not** executed. No deployment was authorized.

### Sanitized Hosted Evidence

Not collected. Hosted sentinel session-header capture against a controlled receiver is deferred without deployment authorization. No session material was generated or retained.

### Result

Confirmed in source: the rewrite vector is gone, and the application proxy does not forward session-bearing headers. Hosted Vercel behavior of this new function path is unproven.

### Root Cause

Same-origin `/ingest` plus a catch-all external rewrite could attach application session headers to an upstream PostHog origin. Middleware exclusion meant no application code inspected that hop.

### Implemented Fix

One constrained PostHog proxy (shared with Finding 3). Outbound headers are built from scratch. Response headers are copied only from `cache-control`, `content-encoding`, `content-type`, `etag`, and `last-modified`. Upstream fetch uses `redirect: 'manual'` and a 10s timeout.

### Regression Tests

Last worker run: `SKIP_DB_TEST_SETUP=true NODE_ENV=test pnpm vitest run --config vitest.config.ts --project unit tests/unit/lib/posthog/ingest-proxy.spec.ts` — 33 passed. Coverage includes inbound session/identity/Clerk/forwarding strip, outbound Set-Cookie strip, known capture/replay/flags/asset paths, unknown/backslash/dot-segment reject before fetch, 405 for unsupported methods, declared and streamed 1 MiB body caps, exact-at-cap success, redirect reject, and timeout 504.

### Residual Risk

Hosted proof that the deployed Vercel function actually runs this code, and that no platform hop re-attaches credentials, is missing. `loadSiteApp` arbitrary API URLs are not proxied. Nested `/s/*` and slashless `/ingest/s` are rejected; only exact `/ingest/s/` is allowed. Upstream PostHog sees the Vercel function IP/UA, not the browser (intentional).

### Final Disposition

**Confirmed — Fixed.** Local automated proof only. Hosted sentinel evidence remains an open acceptance gate.

## Finding 2: Provider Work Refund

### Current Code

`runModuleLessonGenerationWork` writes `providerStartedAt` onto owned module JSON immediately before provider invocation (`markModuleLessonProviderStarted`). The existing `lessonGeneration` reservation is the durable attempt token. After that marker, failures return `disposition: 'consumed'` with `provider_started_failure` and do not compensate. Failures before the marker return `revert` and compensate. Existing plan-cleanup maintenance now settles stale generating modules that retain this marker by marking them failed without touching `usageMetrics`; a later retry must reserve a new slot.

Parent-plan / child-lesson races use PostgreSQL transaction advisory lock namespace `3` keyed by `hashtext(planId)` with a 15s `lock_timeout` (`src/lib/db/queries/helpers/plan-lifecycle-lock.ts`). Child claim, `reserveAttemptSlot` (ns1 then ns3), successful module replacement, and deletion take the same lock. An active `lessonGenerationStatus = 'generating'` child blocks reservation (`active_child_generation` → retryable rate_limit), success persist, and delete.

### Deterministic Race

Lesson-settlement tests fail the provider/parser/persist path after the marker and assert the reservation stays consumed. Lifecycle-lock integration claims a child only when the parent is `ready`; non-ready parent returns `in_flight` with no mutation; regeneration reservation and success persist refuse an active child; delete refuses an active child; same-plan lock serialization is observed via `pg_locks` (granted + waiting), with different plan IDs taking independent locks. Three deterministic ordering cases additionally prove delete-before-claim, provider-start-before-delete, and provider-start-before-regeneration behavior. Cleanup integration proves stale provider-started state is classified without refund and a later retry consumes another slot.

### Database State Before and After

| Timing | Failure | Work disposition | Compensate | Module |
| --- | --- | --- | --- | --- |
| Before marker (provider resolve/init, lifecycle, marker persist) | error | `revert` | yes | failure persist, then quota compensate |
| After marker (provider/parse/success persist) | error | `consumed` `provider_started_failure` | no | failure persist best-effort |
| After marker + failure persist fails | error | `consumed` `provider_started_failure` | no | logged, not thrown |
| Process crash after marker | n/a | process dies, then existing cleanup settles stale marker | no | marker remains durable; module is classified failed and the consumed reservation is not refunded |

Parser failure after provider start retains the reservation. The stale boundary assertion that expected compensation back to count `2` was corrected to consumed count `3`; 19/19 tests in `tests/integration/db/module-lesson-generation.boundary.spec.ts` then passed.

### Result

Confirmed. Post-provider parse and persistence failures cannot restore the provider-attempt budget. Existing maintenance reconciliation classifies stale provider-started modules without refunding their reservation, and parent deletion/regeneration coordinate with active child jobs under the same durable lock.

### Root Cause

Quota compensation ran after provider work had started, and parent plan mutations were not serialized with child lesson jobs, so a refund or replacement could race an in-flight child.

### Implemented Fix

Durable `providerStartedAt` marker plus consumed-on-started settlement. Existing plan-cleanup maintenance settles stale provider-started modules as failed without compensation, so retries follow the normal reservation path. Namespace-3 advisory lock around child claim, reservation, success persist, and delete. Lifecycle finalization skips plan-only completion for `active_child_generation` so last-good ready plans stay intact.

### Regression Tests

- Lesson settlement unit (3 owned specs): 33 passed; flag spec: 3 passed.
- Lesson boundary integration: 19 passed (19).
- Lifecycle lock unit (`delete-plan`, `attempts-persistence`, `write-service`, `process-generation`): 4 files, 55 passed.
- The original combined lifecycle integration run had 52 passed and 1 failed. It preceded the stale assertion correction and the three deterministic lock-order tests; the single failure was the old parser-refund expectation of count `2`. The assertion was corrected to consumed count `3`; targeted reruns passed: lesson boundary 19/19, lifecycle lock 9/9, and cleanup/reconciliation 6/6. The final full changed-test run then passed 52 integration files / 298 tests.
- Slice `oxlint`, `pnpm exec tsc --noEmit`, and `git diff --check`: pass. Final orchestrator `pnpm test` and `pnpm check:full` both exited 0; see Full Validation.

### Residual Risk

An abandoned provider-started module is now settled by the existing plan-cleanup maintenance boundary after the shared 15-minute stale window; the usage reservation remains consumed and is never compensated. If maintenance is unavailable, the generating state remains until that boundary runs. Hosted/preview proof of ordinary lesson generation is deferred. No production provider charges were incurred.

### Final Disposition

**Confirmed — Fixed.**

## Finding 3: Public PostHog Relay

### Current Source Controls

Same proxy as Finding 1. Allowlist matches installed `posthog-js` 1.415.1:

- POST `/e/`, `/s/`, `/flags/` (query allowlist only)
- GET/HEAD `/array/{token}/config` and `config.js`
- GET/HEAD `/static/{version}/{kind}.js` and `/static/{kind}.js`

Unknown paths return 404 before fetch. Unsupported methods return 405 with `Allow` before fetch. OPTIONS is not relayed. Body cap is 1 MiB (declared Content-Length and streamed). Origins are resolver-owned; request-selected hosts are ignored.

### Current Vercel Controls

Read-only CLI inspection (Vercel CLI 53.2.0), not a dashboard overview:

- Rate-limit rule: path `^/ingest(?:/|$)`, 100 requests / 60 seconds / IP, action `rate_limit`.
- Method-deny rule on the same path: methods other than GET, HEAD, POST, and OPTIONS rejected.
- No draft rules; `pendingChanges = 0`.
- Firewall overview unavailable (CLI required an IP bypass). Coverage of preview vs production, fail-open behavior, and regional durability were therefore not confirmed from the overview UI.
- Neither rule is encoded in application source or `vercel.json`.

### Path/Method/Body/Rate Tests

Path, method, and body policy: unit tests in `tests/unit/lib/posthog/ingest-proxy.spec.ts` (same 33-passed run as Finding 1), including unknown/dot-segment/backslash reject before fetch, 405 before fetch, declared oversized 413, streamed oversized 413 with reader cancel, exact 1 MiB success, and asset-path body reject.

Live Vercel rate-threshold test (crossing the published limit by one or two requests) was **not** run. No attack traffic was sent to production.

### Result

Source relay is no longer unrestricted. Edge rate-limit and method-deny rules were observed as published. Live threshold enforcement is unproven.

### Implemented Fix

Application-owned constrained proxy plus documented dashboard-managed `/ingest` rate-limit and method-deny rules. Rewrites removed.

### Regression Tests

Same ingest-proxy unit suite as Finding 1 (33 passed). Oxlint on changed files and `pnpm check:type` passed in that worker slice.

### Residual Risk

Live rate-limit action, preview/production parity, and fail-open behavior are unverified. Rate limiting does not stop accepted PostHog payloads from polluting analytics below the threshold. Hosted path-normalization variants against the edge rule were not exercised.

### Final Disposition

**Confirmed — Fixed.** Local source and unit proof only. Live rate-threshold remains an open acceptance gate.

## Finding 4: Active-Plan Cap Reactivation

### State Transition

Retry previously restored a hidden plan above `maxActivePlans` because regeneration/reservation failure marked last-good plans `failed` + `isQuotaEligible=false`, retry of ineligible plans did not atomically reserve a cap slot before provider work, and success finalization could set `isQuotaEligible=true` without a reservation.

Current behavior:

- Shared `lockUserPlanAdmission` + `countPlansContributingToCap` + `planOwnsActiveCapSlot` in `src/lib/db/queries/helpers/plan-generation-status.ts`.
- New-plan insert and `reserveAttemptSlot` take the same per-user advisory lock (namespace 1).
- `reserveAttemptSlot` locks the plan row; if the plan does not already own a slot (`isQuotaEligible` or `generationStatus === 'generating'`), it rejects with `plan_limit` before provider work.
- Failure marking is one UPDATE: `generationStatus` is `ready` if currently eligible, otherwise `failed`; `isQuotaEligible` is left unchanged (`applyPlanGenerationFailureUpdate`).
- Success sets eligible true only when already eligible or `generationStatus=generating`.

### Deterministic Reproduction

`tests/integration/features/plans/lifecycle/quota-cap-reservation.spec.ts`: populated ready plans stay ready and eligible on rate-limited regeneration; failed ineligible retry is blocked when slots are full without invoking the provider; retry reserves a generating slot before provider work; concurrent failed-plan reactivations with one slot admit exactly one; successful regeneration replaces content without hiding last-good from quota; failure after reservation follows last-good policy.

### Result

Confirmed. Populated plans remain quota-accounted during failed regeneration. Every quota-eligibility reactivation is atomically capped. Concurrent retries cannot exceed `maxActivePlans`.

### Implemented Fix

Per-user admission lock shared by insert and reservation; last-good failure UPDATE that never clears eligibility; success eligibility only for plans that already own a slot.

### Concurrency Tests

Integration (quota-cap-reservation, persistence store, cleanup): 22 passed. Worker `oxlint` on `plan-persistence-store.ts`, `pnpm check:type`, and `git diff --check` passed.

### Residual Risk

Preview smoke of plan creation/retry is deferred. Over-cap eligible plans already in the database are kept and still block new inserts (documented in the quota-cap spec).

### Final Disposition

**Confirmed — Fixed.**

## Finding 5: Clerk Entitlement Ordering

### Event Interleaving

Distinct Clerk billing events for one payer could refresh Clerk concurrently, then apply outside a payer-scoped transaction. An older refresh could land last and overwrite a newer entitlement. Reconciliation had the same fetch-then-write gap. After a payer lock existed, a hung `getUserBillingSubscription` could still hold the transaction lock until the function died.

### Deterministic Reproduction

`tests/integration/db/clerk-billing-webhook-claims.spec.ts` serializes distinct billing events for one payer so the latest Clerk snapshot wins; allows different payers to refresh concurrently; serializes reconciliation behind the same payer lock; does not write unlocked state when the lock times out; times out a hung Clerk refresh, releases the lock, and lets a later retry apply. Unit `reconciliation.spec.ts` covers the same timeout/no-write path.

### Result

Confirmed. Clerk projection updates are serialized per payer. The reverse-completion tests prove stale state cannot win. Hung Clerk fetch times out with no entitlement write, event uncompleted, claim released, then retry acquires the released lock.

### Implemented Fix

`lockAndRefreshClerkBillingSource` in `src/features/billing/clerk-billing/reconciliation.ts`:

1. start transaction
2. `SET LOCAL lock_timeout` (default 15s)
3. `pg_advisory_xact_lock(2, hashtext(payerUserId))`
4. fetch Clerk with `Promise.race` plus timeout cleanup (default 10s; Clerk exposes no AbortSignal)
5. claim/event ledger (webhook only)
6. select local user → project → update
7. commit (lock released)

Lock or network timeout rejects the transaction: no entitlement write, webhook not completed, claim released, retryable. Same-event-id dedupe unchanged. Identity events still do not write billing columns. Sole production updater of `subscriptionTier` / `subscriptionStatus` / `subscriptionPeriodEnd` / `cancelAtPeriodEnd` is `applyClerkBillingSource` after this locked refresh.

### Concurrency Tests

- `tests/unit/features/billing/clerk-billing/reconciliation.spec.ts`: 16 passed
- `tests/integration/db/clerk-billing-webhook-claims.spec.ts`: 17 passed
- Changed-file oxlint, `pnpm check:type`, `git diff --check` on the three owned files: pass

### Residual Risk

Preview smoke of ordinary billing is deferred. No real billing transitions were performed. Clerk has no AbortSignal; timeout is `Promise.race` plus cleanup.

### Final Disposition

**Confirmed — Fixed.**

## Finding 6: JSON Body Limit

### Post-Scan Code Change

`parseJsonBody` on current develop already accepts optional `maxBytes`, rejects oversized declared `Content-Length` without reading the body, and counts actual streamed UTF-8 bytes. Production `parse-json-body.ts` was not changed in this working tree. Test-only gap closure was added in `tests/unit/lib/api/parse-json-body.spec.ts` and `tests/unit/api/plans.bulk-delete-route.spec.ts`.

### Caller Inventory

No wrappers, aliases, or re-exports. Direct `parseJsonBody` only:

| Path | Route | maxBytes |
|---|---|---|
| `src/app/api/internal/maintenance/notifications/email/route.ts` | POST `/api/internal/maintenance/notifications/email` | 256 KiB |
| `src/app/api/v1/plans/bulk-delete/route.ts` | POST `/api/v1/plans/bulk-delete` | 256 KiB |
| `src/app/api/v1/user/preferences/notifications/route.ts` | PATCH `/api/v1/user/preferences/notifications` | 256 KiB |
| `src/app/api/v1/user/preferences/route.ts` | PATCH `/api/v1/user/preferences` | 256 KiB |
| `src/app/api/v1/user/profile/route.ts` | PUT `/api/v1/user/profile` | 256 KiB |
| `src/app/api/v1/plans/[planId]/regenerate/route.ts` | POST `/api/v1/plans/:planId/regenerate` | 1 MiB |
| `src/app/api/v1/plans/stream/route.ts` | POST `/api/v1/plans/stream` | 1 MiB |

No production caller omits `maxBytes` or passes `Infinity`. No `request.json()` / `request.text()` in this route family. Clerk billing webhook uses a separate `WEBHOOK_MAX_BYTES` path, not `parseJsonBody`.

### Test Results

Specs cover below-cap parse, exact-cap parse, oversized Content-Length 413 without reading, invalid/negative/overflow/unsafe Content-Length with bounded over-cap bodies, chunked body that understates Content-Length, undeclared multi-chunk stream over the cap (413 even if cancel rejects), UTF-8 byte counting, omitted-`maxBytes` unbounded `req.json()` behavior, and a bulk-delete route 413 for an oversized declared JSON body.

Focused run: 38 tests passed across `tests/unit/lib/api/parse-json-body.spec.ts` and `tests/unit/api/plans.bulk-delete-route.spec.ts`. Final orchestrator `pnpm test` unit changed phase: 45 test files passed, 410 tests passed (`pnpm test` exit 0).

### Remaining Gaps

A single huge stream chunk is still allocated by the runtime before `byteLength` is visible. Optional `maxBytes` still allows unbounded `req.json()` if a future caller omits it.

### Final Disposition

**Already Remediated After Scan.**

## Full Validation

- Install: Passed (`pnpm install --frozen-lockfile`) at baseline.
- Typecheck: Passed. Orchestrator reran `pnpm check:full` afterward; `check:type` exit 0. `pnpm check:full` exit 0.
- Lint: Passed. Same `pnpm check:full` rerun; `check:lint` exit 0.
- Unit tests: Passed. `pnpm test` exit 0. Unit changed phase: 45 test files passed, 410 tests passed.
- Integration tests: Passed. `pnpm test` exit 0. Integration changed phase: 52 test files passed, 298 tests passed. Workflow changed phase: 1 test file passed, 4 tests passed. Overall phase runner: Passed: `test:unit:changed` `test:integration:changed`.
- Preview smoke tests: Deferred — no deployment authorization (normal PostHog, billing, plan creation/retry, and lesson generation not exercised on a preview host)
- Hosted security tests: Deferred — no deployment authorization (sentinel session-header capture; live Vercel rate-threshold crossing by one or two requests)

Worker slice targeted results after this delta: parser 35 tests, lifecycle lock 9 tests, and abandoned provider-start cleanup 6 tests passed. Changed-file oxlint, `pnpm exec tsc --noEmit`, and `git diff --check` passed. The orchestrator then reran `pnpm test` (exit 0: unit 45/410, integration 52/298, workflow 1/4) and `pnpm check:full` (exit 0). No hosted preview or deployment was authorized.

## Remaining Security Work

- Deferred hosted or operational checks:
  - Controlled hosted sentinel session-header capture for credential stripping
  - Live Vercel rate-threshold test crossing the published `/ingest` limit by only one or two requests
  - Preview smoke tests for normal PostHog, billing, plan creation/retry, and lesson generation
  - Firewall overview inspection (CLI required an IP bypass)
- Accepted residual risks:
  - Hosted proof of Findings 1 and 3 is missing; do not treat production `/ingest` as verified
  - PostHog function IP/UA replaces browser identity on proxied requests
  - `loadSiteApp` arbitrary API URLs are not proxied
  - Analytics pollution via accepted PostHog payloads below the rate threshold
  - JSON parser: one huge stream chunk may allocate before the cap is visible; omitted `maxBytes` remains unbounded
  - Over-cap eligible plans already present remain counted and block new inserts
- Follow-up issues: None opened. Canonical scan artifacts remain historical and unchanged. Fix commit/PR for local remediations is still pending.
