# Plan: Billing Account State Deepening

> **Status:** Implementation-ready
> **Scope:** Architecture shortlist candidate `#3` — not GitHub issue `#3`.
> **Last updated:** 2026-04-05

## Goal

Create a real billing-account boundary so authenticated surfaces, Stripe entry points, and quota-consuming workflows stop manually coordinating subscription state, usage state, and reconciliation rules.

---

## Scope Decisions

### First-pass boundary: Canonical snapshot + Stripe/account transitions (combined)

The first deep module owns **both** the read side (one canonical billing-account snapshot) and the write side (Stripe-to-local transitions). Rationale:

- **Snapshot-only** would fix consumer drift but leave transition logic fragmented across `subscriptions.ts` and inline webhook updates. Callers would still need to know which helpers touch Stripe vs local.
- **Transition-only** would unify writes but not solve the problem of four surfaces assembling billing state differently.
- **Combined** is the right size because the snapshot defines what the module owns and the transitions define how that state changes. They share the same DB authority concerns and the same test surface. The webhook processor is the natural transition point; the snapshot is the natural read point.

### Quota reservation: OUT for the first pass

Regeneration/PDF quota reservation (`atomicCheckAndIncrementUsage`, `atomicCheckAndIncrementPdfUsage`, rollback helpers) remains in `billing/quota.ts` and `billing/usage-metrics.ts` as-is. These are transactional enforcement functions deeply embedded in caller flows (regenerate route, PDF origin, `QuotaAdapter`). Moving them into a billing-account module would mean those callers go through an additional indirection for a concern that is not broken the same way the snapshot and transitions are broken.

Deferred to **Slice 2** (separate planning cycle).

### Active-plan quota: STAYS in `features/plans`

`countPlansContributingToCap()` and `checkPlanLimit()` in `plan-operations.ts` count `learning_plans` rows — that is plan-domain logic. Only tier resolution (`resolveUserTier`, `TIER_LIMITS`, `selectUserSubscriptionTierForUpdate`) crosses from billing. That cross-domain import is acceptable and already clean via the `QuotaAdapter` port.

No change in the first pass.

### Portal eligibility semantics: PRESERVED

The product rule — pre-created Stripe customer does not imply portal eligibility — is encoded in `portal-eligibility.ts:canOpenBillingPortalForUser()`. The snapshot will expose this as a derived boolean (`canOpenBillingPortal`) so callers stop re-evaluating the type guard. The underlying rule is not changed.

### Plans-page usage affordances: INCLUDED if clean, otherwise deferred

`PlansContent.tsx` and `PlanCountBadgeContent()` call `getUsageSummary()` for plan-count badges. If the snapshot contract covers this cleanly (it will — same data), these callers migrate in Slice 1B. If the snapshot shape doesn't fit, they stay on direct `getUsageSummary()` and get a follow-up ticket.

### Row-only consumers: explicitly out of scope for Slice 1

These files read subscription tier/status from an already-loaded user row, but they do not assemble the fractured billing-account view that motivated this refactor:

- `src/app/api/v1/user/profile/route.ts`
- `src/app/api/v1/user/preferences/route.ts`
- `src/components/shared/SiteHeader.tsx`
- `src/app/api/v1/stripe/create-portal/route.ts`

They stay on direct user-row access in Slice 1. The first canonical snapshot is for callers that currently stitch together multiple billing helpers or need one stable billing-facing contract.

---

## Rejected Alternatives

### Alt A: `BillingAccountService` class

A single class wrapping all billing functions (reads, transitions, quota, Stripe ops). Rejected because:
- It conflates read and write authority models (runtime RLS DB for reads vs service-role DB for transitions).
- It would absorb quota reservation prematurely.
- "Service" label without ownership decisions is fake progress — it just moves the same helpers behind a constructor.

### Alt B: Snapshot-only first, transitions later

Create the snapshot read model but leave transitions split. Rejected because:
- The webhook processor's split transitions (`syncSubscriptionToDb()` for some events, inline updates for others) are the most dangerous inconsistency. Deferring them means the write side continues to drift.
- Snapshot consumers would still depend on stale data if the transition path has bugs, and we can't test the full round-trip without owning both.

### Alt C: Transition-only first, snapshot later

Unify webhook transitions but leave consumers assembling their own reads. Rejected because:
- Consumer drift is the most visible symptom (four surfaces reading the same state differently). Fixing transitions without fixing reads delivers invisible value.

---

## Target Interface Shape

### Read side: `BillingAccountSnapshot`

```typescript
// src/features/billing/account-snapshot.ts

type BillingAccountSnapshot = {
  tier: SubscriptionTier;
  subscriptionStatus: string | null;
  subscriptionPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  canOpenBillingPortal: boolean;
  usage: {
    activePlans: { current: number; limit: number };
    regenerations: { used: number; limit: number };
    exports: { used: number; limit: number };
  };
};

/**
 * Canonical billing-account read.
 * Replaces caller-owned assembly of billing row fields + getUsageSummary()
 * + canOpenBillingPortalForUser().
 * Uses RLS-scoped DB by default (callers in server components pass their
 * withServerComponentContext DB).
 */
async function getBillingAccountSnapshot(
  userId: string,
  db?: DbClient,
): Promise<BillingAccountSnapshot>;
```

### Write side: Named transition functions

```typescript
// src/features/billing/account-transitions.ts

/**
 * Reconcile a Stripe subscription to local users row.
 * Extracted from subscriptions.ts:syncSubscriptionToDb().
 * Uses service-role DB (injected).
 */
async function applySubscriptionSync(
  subscription: Stripe.Subscription,
  deps: TransitionDeps,
): Promise<void>;

/**
 * Handle subscription deletion — downgrade to free.
 * Extracted from stripe-webhook-processor.ts inline update.
 */
async function applySubscriptionDeleted(
  subscriptionId: string,
  deps: TransitionDeps,
): Promise<void>;

/**
 * Handle payment failure — mark past_due.
 * Extracted from stripe-webhook-processor.ts inline update.
 */
async function applyPaymentFailed(
  subscriptionId: string,
  deps: TransitionDeps,
): Promise<void>;

type TransitionDeps = {
  db: ServiceRoleDb;
  users: typeof users;
  stripe?: Stripe;
  logger: Logger;
};
```

### Stripe interaction helpers (unchanged location)

`createCustomer()`, `getCustomerPortalUrl()`, `cancelSubscription()` stay in `subscriptions.ts` in the first pass to avoid path churn while the boundary settles. These are Stripe API calls, not local state transitions. The webhook processor and routes call them directly.

---

## Implementation Slices

### Slice 1A — Create the canonical snapshot read model

**Goal:** One function replaces the ad hoc assembly pattern.

**New file:** `src/features/billing/account-snapshot.ts`
- Export `BillingAccountSnapshot` type
- Export `getBillingAccountSnapshot(userId, db?)` function
- Internally reads the required billing row fields directly from `users` so the snapshot owns `cancelAtPeriodEnd` and other canonical fields without stretching `getSubscriptionTier()` further.
- Reuses `getUsageSummary()` for usage counts and limits.
- Derives `canOpenBillingPortal` from the selected row via `canOpenBillingPortalForUser()`.
- Uses RLS-scoped DB by default (same authority model as current reads)

**Files changed:**
| File | Change |
|---|---|
| `src/features/billing/account-snapshot.ts` | NEW — snapshot type + function |
| `src/features/billing/usage-metrics.ts` | No API change. Snapshot reuses `getUsageSummary()`. |
| `src/features/billing/portal-eligibility.ts` | No API change. Snapshot reuses `canOpenBillingPortalForUser()`. |
| `src/features/billing/subscriptions.ts` | No Slice 1A change required. `getSubscriptionTier()` remains for legacy callers/tests until migration completes. |

**New test:** `tests/integration/stripe/account-snapshot.spec.ts`
- Test `getBillingAccountSnapshot()` returns correct tier, usage, portal eligibility
- Test with free user (no stripe customer)
- Test with active subscriber
- Test with canceled subscriber (past_due, canceled states)
- Uses real DB integration like existing `subscriptions.spec.ts`

**Validation:**
- `pnpm type-check`
- `pnpm test:changed`

### Slice 1B — Migrate consumers to canonical snapshot

**Goal:** Eliminate caller-owned assembly. Each consumer calls `getBillingAccountSnapshot()` instead of 2-3 separate functions.

**Files changed:**
| File | Current pattern | New pattern |
|---|---|---|
| `src/app/settings/billing/components/BillingCards.tsx` | `getUsageSummary()` + `getSubscriptionTier()` + `canOpenBillingPortalForUser()` (3 calls) | `getBillingAccountSnapshot()` (1 call) |
| `src/app/api/v1/user/subscription/route.ts` | `getUsageSummary()` + user row fields | `getBillingAccountSnapshot()` — return shape derived from snapshot |
| `src/app/plans/components/PlansContent.tsx` | `getUsageSummary()` for plan count badge and list affordance | `getBillingAccountSnapshot()` — use `snapshot.usage.activePlans` if the migration is low-churn; otherwise defer cleanly |

**Explicit Slice 1B exclusions:**
- `src/app/pricing/page.tsx` stays on direct `canOpenBillingPortalForUser(user)` for now because it only needs one derived boolean and migrating it to the full snapshot would force extra usage queries it does not display.
- `src/app/api/v1/stripe/create-portal/route.ts` stays on auth-loaded user row access for the same reason.

**API contract note:** `GET /api/v1/user/subscription` response shape must remain backward-compatible. The route maps from snapshot to its existing response JSON — no breaking change.

**Validation:**
- `pnpm type-check`
- `pnpm lint:changed`
- `pnpm test:changed`
- Manual: verify settings/billing page, pricing page, and plans list page render correctly

### Slice 1C — Extract named transition functions

**Goal:** Webhook processor delegates to named transition functions instead of mixing `syncSubscriptionToDb()` delegation with inline row updates.

**New file:** `src/features/billing/account-transitions.ts`
- Export `applySubscriptionSync(subscription, deps)` — extracted from `subscriptions.ts:syncSubscriptionToDb()`
- Export `applySubscriptionDeleted(subscriptionId, deps)` — extracted from inline update in `stripe-webhook-processor.ts` (lines ~117-140)
- Export `applyPaymentFailed(subscriptionId, deps)` — extracted from inline update in `stripe-webhook-processor.ts` (lines ~148-175)
- All accept `TransitionDeps` with service-role DB

**Files changed:**
| File | Change |
|---|---|
| `src/features/billing/account-transitions.ts` | NEW — named transition functions |
| `src/features/billing/stripe-webhook-processor.ts` | `applyStripeWebhookEvent()` calls `applySubscriptionSync()`, `applySubscriptionDeleted()`, `applyPaymentFailed()` instead of mixed delegation + inline updates |
| `src/features/billing/subscriptions.ts` | Remove `syncSubscriptionToDb()` (moved to transitions). Keep `createCustomer()`, `getCustomerPortalUrl()`, `cancelSubscription()`. |

**Naming note:** Keep `subscriptions.ts` in the first pass to avoid path churn while the boundary settles. A later cleanup pass can rename it to `stripe-operations.ts` if the remaining contents make that worthwhile.

**Files that import moved transition functions and need updates:**
- `src/features/billing/stripe-webhook-processor.ts` — imports `syncSubscriptionToDb` (now from `account-transitions.ts` as `applySubscriptionSync`)
- `tests/integration/stripe/subscriptions.spec.ts` — any `syncSubscriptionToDb` coverage must import from `account-transitions.ts`

**Transition-path validation targets:**
- `src/app/api/v1/stripe/create-checkout/route.ts`
- `src/app/api/v1/stripe/create-portal/route.ts`
- `src/app/api/v1/stripe/local/complete-checkout/route.ts`
- `src/app/api/v1/stripe/webhook/route.ts`

**Validation:**
- `pnpm type-check`
- `pnpm test:changed`
- `pnpm lint:changed`

### Slice 1D — Migrate and update tests

**Goal:** Tests shift from protecting internal helper handoffs to protecting the billing-account boundary.

**Test fallout matrix:**

| Test file | Action | Rationale |
|---|---|---|
| `tests/integration/stripe/subscriptions.spec.ts` (~489 lines) | **KEEP + UPDATE** — Preserve the existing file in the first pass; update imports so transition coverage points at `account-transitions.ts` and Stripe-operation coverage stays on `subscriptions.ts`. | This keeps regression coverage without paying rename/split churn during the first boundary extraction. |
| `tests/unit/stripe/stripe-webhook-processor.spec.ts` (~300 lines) | **KEEP + UPDATE** — Update imports to use `applySubscriptionSync` from `account-transitions.ts`. Verify mock contract matches new `TransitionDeps` shape. | Still valuable: tests idempotency, rollback, and event routing. The processor is still a module, just with cleaner delegation. |
| `tests/integration/stripe/usage.spec.ts` (~532 lines) | **KEEP AS-IS** — No changes needed. | Tests quota enforcement and usage summary, which are out of scope for this slice. |
| `tests/integration/stripe/create-checkout.spec.ts` (~396 lines) | **KEEP AS-IS** — No path change expected in the first pass. Verify checkout still provisions customers correctly. | Route-level test. Still valid. |
| `tests/integration/stripe/api-routes.spec.ts` (~496 lines) | **KEEP + VERIFY** — Verify portal route tests and subscription API tests still pass. Subscription API response shape must not change. | Route-level test. Consumer migration is internal; API contract is stable. |
| `tests/integration/api/user-subscription.spec.ts` (~183 lines) | **KEEP + VERIFY** — Continue asserting tier, status, `cancelAtPeriodEnd`, and usage shape for `/api/v1/user/subscription`. | This is a direct contract test for the route and must stay aligned when the route starts reading from the snapshot. |

**New tests:**

| New test file | Coverage |
|---|---|
| `tests/integration/stripe/account-snapshot.spec.ts` | `getBillingAccountSnapshot()` with free/starter/pro users, various subscription states, usage levels, portal eligibility edge cases |
| `tests/integration/stripe/account-transitions.spec.ts` | Optional in the first pass. Add only if updating `subscriptions.spec.ts` becomes too awkward after extraction. |

**Validation:**
- `./scripts/test-integration.sh tests/integration/stripe/subscriptions.spec.ts`
- `./scripts/test-integration.sh tests/integration/stripe/api-routes.spec.ts`
- `./scripts/test-integration.sh tests/integration/api/user-subscription.spec.ts`
- `pnpm type-check`
- `pnpm lint:changed`

---

## Migration Order

```
1A: Create account-snapshot.ts (additive, no callers changed yet)
 ↓
1B: Migrate consumers to snapshot (BillingCards, subscription API, plans)
 ↓
1C: Extract transitions while keeping subscriptions.ts in place
 ↓
1D: Split/update tests to match new boundaries
```

Each slice is independently committable and deployable. 1A is purely additive. 1B changes consumer imports but not behavior. 1C restructures billing internals. 1D adjusts test organization.

---

## DB Authority Model

The snapshot boundary intentionally preserves the current authority split:

| Concern | DB authority | Rationale |
|---|---|---|
| `getBillingAccountSnapshot()` | RLS-scoped `getDb()` or caller-injected DB | Reads are user-scoped. Server components pass `withServerComponentContext` DB. |
| `applySubscriptionSync()` | Service-role `db` (injected via `TransitionDeps`) | Webhook-driven writes are not user-initiated — they come from Stripe events processed by a service-role route. |
| `createCustomer()` | Service-role `db` (internal to function) | Advisory lock + customer provisioning needs service-role for cross-user safety. |
| `getCustomerPortalUrl()` | No DB access | Pure Stripe API call. |

This is not a bug — it reflects the real authorization boundary. The plan does not collapse these into one authority model.

---

## What This Plan Does NOT Change

- `billing/quota.ts` — Transactional quota enforcement stays as-is (Slice 2).
- `billing/usage-metrics.ts` counter mutations — `incrementUsage`, `decrementRegenerationUsage`, etc. stay as-is.
- `features/plans/lifecycle/plan-operations.ts` — Active-plan quota stays in plans.
- `features/plans/lifecycle/adapters/quota-adapter.ts` — Port/adapter stays as-is.
- `billing/tier.ts`, `billing/tier-limits.ts` — Tier resolution stays as-is. Snapshot uses it internally.
- `billing/price-catalog.ts`, `billing/local-catalog.ts`, `billing/client.ts` — Stripe infrastructure stays.
- `billing/errors.ts` — Error types stay.
- `billing/validation/` — Validation stays.
- Portal eligibility product rule — Preserved exactly.
- `TIER_LIMITS` values — No policy changes.

---

## Validation Commands

After each slice:
```bash
pnpm type-check
pnpm lint:changed
pnpm test:changed
```

Targeted integration checks for this workstream:
```bash
./scripts/test-integration.sh tests/integration/stripe/account-snapshot.spec.ts
./scripts/test-integration.sh tests/integration/stripe/subscriptions.spec.ts
./scripts/test-integration.sh tests/integration/stripe/api-routes.spec.ts
./scripts/test-integration.sh tests/integration/api/user-subscription.spec.ts
```

`pnpm test:integration` remains useful as a changed-files helper, but in this repo it is not a full-suite command.

---

## Risk Mitigations

| Risk | Mitigation |
|---|---|
| Dirty worktree with unrelated changes | Only stage files under `src/features/billing/`, consumer files being migrated, and test files. Never touch plan/session/read-model files. |
| Snapshot becomes a god object | Snapshot is a data type, not a service. It composes three existing reads. No methods, no behavior, no state. |
| API contract break on `GET /api/v1/user/subscription` | Route maps snapshot → existing JSON shape. Response contract is tested in `api-routes.spec.ts`. |
| Future file rename breaks imports | Keep `subscriptions.ts` in this first pass. If a later cleanup renames it to `stripe-operations.ts`, do that as a separate low-risk follow-up. |
| Tests become stale during migration | Each slice has explicit validation steps. Slice 1D is dedicated to test reorganization. |
