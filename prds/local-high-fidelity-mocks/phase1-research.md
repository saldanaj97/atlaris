# Phase 1: Core Local Hosted-Mock Foundations — Research & Implementation Plans

> **Parent PRD:** `prds/local-high-fidelity-mocks/prd.md`
> **Research date:** 2026-03-30
> **Status:** Research complete — ready for implementation

---

## Slice 1: Local Mock Mode Contract & Env Surface

### 1. Current State

The repo already has **service-specific local/test toggles**, but they are inconsistent and not coordinated under one local-mock concept.

- **Auth:** `DEV_AUTH_USER_ID`, `DEV_AUTH_USER_EMAIL`, and `DEV_AUTH_USER_NAME` exist in `src/lib/config/env.ts:539-549`. `getEffectiveAuthUserId()` in `src/lib/api/auth.ts:27-44` uses `DEV_AUTH_USER_ID` in development and test to bypass real Neon Auth session lookup.
- **Proxy/middleware:** `src/proxy.ts:128-148` bypasses Neon Auth middleware for `/api/*` routes when `DEV_AUTH_USER_ID` is set in development.
- **AI:** `src/features/ai/providers/factory.ts:13-23` and `:62-73` default to `MockGenerationProvider` in development/test unless explicitly disabled. Env surface already exists in `src/lib/config/env.ts:414-452`.
- **AV scanning:** `src/lib/config/env.ts:454-494` defaults `AV_PROVIDER` to `none` in non-production. `src/features/pdf/security/scanner-factory.ts:18-49` returns `null` when the provider is `none`, causing `scanBufferForMalware()` to rely on heuristic-only scanning (`src/features/pdf/security/malware-scanner.ts:144-153`).
- **Stripe:** There is no top-level mock mode flag. Billing code uses optional `stripeInstance` injection at the service/route level, but production local dev still relies on real `getStripe()` by default (`src/features/billing/client.ts:15-31`).
- **Google OAuth:** `googleOAuthEnv` uses prod-only-required env behavior (`src/lib/config/env.ts:348-358`), but there is no local mock mode contract for OAuth routes or token storage.

Current behavior is therefore a patchwork: some services default to mock-like local behavior, some support test DI only, and some still assume real hosted dependencies in local dev.

### 2. Files to Change

| File | Change | Lines |
|------|--------|-------|
| `src/lib/config/env.ts` | Add coherent local-mock mode env surface and service-specific helpers | 388-549 |
| `src/features/ai/providers/factory.ts` | Align AI mock selection with the shared local-mock contract | 13-23, 62-73 |
| `src/features/pdf/security/scanner-factory.ts` | Align AV provider selection with shared local-mock contract | 18-49 |
| `src/features/billing/client.ts` | Route Stripe client selection through shared local-mock contract | 15-31 |
| `src/app/api/v1/auth/google/route.ts` | Use shared local-mock contract when deciding whether to use real Google OAuth | 17-59 |
| `src/app/api/v1/auth/google/callback/route.ts` | Same as above for callback flow | 41-188 |

**New files:**

| File | Purpose |
|------|---------|
| `src/lib/config/local-mock.ts` or similar | Central mock-mode helpers and service-specific selectors |
| `src/shared/types/local-mock.types.ts` | Shared type definitions for local mock modes/scenarios |

### 3. Implementation Steps (TDD)

1. **Write environment-selection tests first:**
   - Test: local mock mode off preserves current production behavior
   - Test: local mock mode on enables auth/billing/integrations selectors predictably
   - Test: existing AI/AV env semantics still work under the new shared contract

2. **Introduce a shared local-mock contract:**
   - Add one explicit top-level local mock concept
   - Preserve service-specific scenario control where it already exists
   - Avoid creating a giant config object that every runtime path must import if a small helper module will do

3. **Refactor service-selection call sites to use the shared contract:**
   - AI provider factory
   - Stripe client factory
   - Google OAuth route decision points
   - AV scanner factory

4. **Validate:**
   - `pnpm test:changed`
   - Spot-check env resolution in local dev without starting implementation-heavy mocks yet

### 4. Risk Areas

- **Behavioral drift:** HIGH — centralizing mock selection can accidentally change existing local AI or AV behavior if defaults are not preserved.
- **Import sprawl:** MEDIUM — if the new helper lives in the wrong layer, it could create dependency-direction issues.
- **Env ambiguity:** MEDIUM — if both old flags and new flags coexist without clear precedence, local behavior will become hard to reason about.

### 5. Estimated Overlap

- **With Slice 2:** shared overlap in `src/lib/config/env.ts`
- **With Slice 3:** shared overlap in env/config and service-selection logic
- **Merge recommendation:** land slice 1 first; it provides the contract that slices 2 and 3 build on

---

## Slice 2: Local Auth / Session Mock Path

### 1. Current State

Auth already has a **development seam**, but it is only partial.

- `src/lib/api/auth.ts:27-44` resolves the effective auth user via `DEV_AUTH_USER_ID` in development/test before falling back to `getSessionSafe()`.
- `src/proxy.ts:128-148` bypasses Neon Auth middleware for `/api/*` routes in development when `DEV_AUTH_USER_ID` is set.
- `src/lib/auth/server.ts:22-34` wraps `auth.getSession()` in `getSessionSafe()` because Neon Auth session refresh can throw when cookies are refreshed from plain Server Components.
- `src/lib/api/auth.ts:69-97` provisions the DB user record via `ensureUserRecord()`, but that path still calls `auth.getSession()` to obtain email/name if the DB record does not yet exist.
- `src/lib/api/auth.ts:144-168` uses a lighter test path under `appEnv.isTest`, but development still flows through the real auth code unless the env override is set.
- `src/app/layout.tsx:75-106` wraps the app in `NeonAuthUIProvider`, so a higher-fidelity local auth mode may also need a client-side UI strategy instead of only patching server-side auth resolution.
- The Google OAuth callback intentionally bypasses `DEV_AUTH_USER_ID` and requires a **real** session via `getAuthUserId()` (`src/app/api/v1/auth/google/callback/route.ts:46-55`), which is correct for security but blocks full local integration behavior today.

This means local auth is already “good enough” for some API smoke paths, but not yet a high-fidelity local signed-in mode for the wider app experience.

### 2. Files to Change

| File | Change | Lines |
|------|--------|-------|
| `src/lib/auth/server.ts` | Add a dev/local session injection path that can return richer mock session data | 1-34 |
| `src/lib/api/auth.ts` | Teach auth resolution and user provisioning to use local auth metadata safely | 27-44, 69-97, 144-168 |
| `src/proxy.ts` | Expand dev bypass strategy beyond the current API-only seam if needed | 128-172 |
| `src/lib/config/env.ts` | Extend dev auth env surface or map it into the new local-mock contract | 539-549 |
| `src/app/layout.tsx` | Potentially gate or adapt client-side auth UI/provider behavior in local mode | 75-106 |

**New files:**

| File | Purpose |
|------|---------|
| `src/lib/auth/local-session.ts` | Local mock session builder/normalizer |
| `tests/integration/auth/local-auth-mode.spec.ts` | Integration tests for local signed-in behavior |

### 3. Implementation Steps (TDD)

1. **Write auth-mode tests first:**
   - Test: protected API route works in local auth mode without real Neon Auth
   - Test: local auth mode auto-provisions a user when the DB user record is missing
   - Test: signed-out behavior still redirects/throws correctly when mock mode is off
   - Test: security-sensitive paths that must ignore dev auth remain explicit

2. **Implement local session injection:**
   - Keep `DEV_AUTH_USER_ID` as the anchor seam
   - Provide session-like metadata (id, email, name) through a shared local session helper
   - Avoid pretending this is full cookie/session refresh parity

3. **Align middleware and auth wrappers:**
   - Decide whether non-API protected routes should also bypass Neon Auth middleware in local auth mode
   - Keep handler-level auth checks intact even if middleware is relaxed

4. **Validate:**
   - `pnpm test:changed`
   - Manual local flow: boot app, access signed-in routes, verify user provisioning and CRUD read paths

### 4. Risk Areas

- **Cookie/session parity gap:** HIGH — local auth mode will still not perfectly emulate Neon Auth cookie refresh behavior.
- **Security-sensitive path confusion:** MEDIUM — some flows (especially OAuth callbacks) intentionally need real session semantics; the mock path must not blur that boundary.
- **Middleware divergence:** MEDIUM — over-broad bypass logic in `proxy.ts` could unintentionally make local behavior too permissive.

### 5. Estimated Overlap

- **With Slice 1:** shared env/config contract
- **With future Google OAuth slice:** high overlap around real-session vs local-session boundaries
- **Merge recommendation:** implement after slice 1, before Google integration mock work

---

## Slice 3: Stripe / Billing Mock Provider and Webhook Simulation

### 1. Current State

Billing is already structured around **optional Stripe client injection**, which is a strong seam for local mocking.

- `src/features/billing/client.ts:15-31` exposes `getStripe()` as a lazy singleton, but it always constructs a real Stripe client.
- `src/features/billing/subscriptions.ts:93-303` accepts optional `stripeInstance` parameters for subscription sync, customer creation, portal sessions, and cancellation.
- `src/app/api/v1/stripe/create-checkout/route.ts:24-129`, `src/app/api/v1/stripe/create-portal/route.ts:19-134`, and `src/app/api/v1/stripe/webhook/route.ts:25-310` are route factories that already accept optional Stripe clients.
- `src/app/api/v1/stripe/webhook/route.ts:154-185` uses the service-role DB client and a `stripeWebhookEvents` dedupe table, so webhook-driven state changes already have the right persistence shape.
- `src/features/billing/subscriptions.ts:138-180` performs live `stripe.prices.retrieve()` lookups during subscription sync to map price/product metadata back into local DB tier state.
- `src/app/pricing/components/stripe-pricing.ts:107-180` also hits Stripe at render time to resolve displayed pricing data.
- Current local workflow relies on `package.json:11` — `dev:stripe` using `stripe listen --forward-to ...` — which is useful but still depends on live Stripe tooling and setup.

The architecture is therefore already mock-friendly, but local dev still lacks a first-class mock Stripe path.

### 2. Files to Change

| File | Change | Lines |
|------|--------|-------|
| `src/features/billing/client.ts` | Route `getStripe()` through local mock selection instead of always constructing the real SDK | 15-31 |
| `src/lib/config/env.ts` | Add Stripe mock env/config selectors | 388-412 |
| `src/app/pricing/components/stripe-pricing.ts` | Support local-safe pricing data retrieval/fallback | 107-180 |
| `src/app/api/v1/stripe/webhook/route.ts` | Potentially add mock-event ergonomics while preserving existing handler behavior | 25-310 |
| `tests/helpers/subscription.ts` | Reuse and extend realistic Stripe ID builders for mock objects | 17-65 |

**New files:**

| File | Purpose |
|------|---------|
| `src/features/billing/mock.ts` | Mock Stripe client implementation |
| `src/features/billing/mock-factory.ts` | Billing mock selector / scenario helpers |
| `src/app/api/v1/stripe/_shared/mock-events.ts` | Local webhook event builders/templates |

### 3. Implementation Steps (TDD)

1. **Write billing mock tests first:**
   - Test: checkout route returns a valid local mock session URL
   - Test: portal route returns a valid local mock portal URL
   - Test: webhook route + mock subscription event updates DB state through existing sync logic
   - Test: pricing page renders from local-safe data when mock mode is enabled
   - Test: failure scenarios (bad price, lookup timeout, portal failure) surface correctly

2. **Implement mock Stripe client/factory:**
   - Keep production route/service code intact
   - Return realistic IDs (`cus_*`, `sub_*`) and URLs
   - Mock price/product metadata retrieval to preserve subscription tier sync behavior

3. **Add local webhook simulation helpers:**
   - Reuse current webhook route rather than bypassing it
   - Ensure idempotency and service-role DB writes still happen through the normal path

4. **Validate:**
   - `pnpm test:changed`
   - Manual local flow: simulate checkout, portal, and webhook-driven subscription updates

### 4. Risk Areas

- **Webhook/state divergence:** HIGH — if the mock path skips normal webhook-driven sync, local billing behavior will drift from production quickly.
- **Pricing fallback drift:** MEDIUM — pricing-page fallback data can become stale if not derived from one clear source.
- **Mock scope creep:** MEDIUM — billing can easily turn into “rebuild Stripe”; the slice should focus on app-observable behavior only.

### 5. Estimated Overlap

- **With Slice 1:** shared env/config contract
- **With Phase 2 docs/DX slice:** shared local workflow documentation
- **Merge recommendation:** after slice 1; can run alongside slice 2 with coordination around env/config edits

---

## Cross-Slice Analysis

### Recommended Implementation Order

```text
Slice 1: Local Mock Mode Contract & Env Surface
  ├── Slice 2: Local Auth / Session Mock Path
  └── Slice 3: Stripe / Billing Mock Provider and Webhook Simulation
```

**Rationale:** slice 1 establishes the contract and precedence rules that slices 2 and 3 rely on. Auth and billing can then proceed mostly in parallel, but both touch `src/lib/config/env.ts`, so they should either be coordinated carefully or landed sequentially if file churn becomes high.

### Shared File Map

| File | Slice 1 | Slice 2 | Slice 3 |
|------|---------|---------|---------|
| `src/lib/config/env.ts` | ✅ primary | ✅ secondary | ✅ secondary |
| `src/lib/api/auth.ts` | — | ✅ primary | — |
| `src/lib/auth/server.ts` | — | ✅ primary | — |
| `src/proxy.ts` | — | ✅ primary | — |
| `src/features/billing/client.ts` | ✅ secondary | — | ✅ primary |
| `src/app/api/v1/stripe/webhook/route.ts` | — | — | ✅ primary |

### Key Phase 1 Findings

- The repo already has a **real auth seam** in `DEV_AUTH_USER_ID`; the PRD should extend that, not replace it.
- Billing already has **the right DI shape** for local mocks through optional Stripe client injection and route factories.
- The highest-risk part of the local billing story is **preserving webhook-driven subscription sync behavior**, not generating fake checkout URLs.
- A single shared local-mock contract is necessary to prevent auth, billing, AI, and AV from becoming four unrelated local-mode systems.
