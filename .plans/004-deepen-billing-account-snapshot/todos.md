# 004 — Deepen Billing Account Snapshot Read Model

Source: GitHub issue [#305](https://github.com/saldanaj97/atlaris/issues/305) — RFC: deepen billing account snapshot read model.

## Acceptance Criteria

- [ ] `getBillingAccountSnapshot` exposes a discriminated projection contract (`full` default, `subscription` opt-in) instead of one always-full read
- [ ] The billing snapshot boundary owns subscription fields, Stripe identifiers, and billing-portal eligibility for authenticated read consumers
- [ ] The full projection derives usage limits from the already-loaded billing tier instead of re-resolving tier through a second user lookup
- [ ] `src/app/pricing/page.tsx` stops calling `canOpenBillingPortalForUser(user)` directly and uses the subscription projection instead
- [ ] `src/app/settings/billing/components/BillingCards.tsx`, `src/app/plans/components/PlansContent.tsx`, and `src/app/api/v1/user/subscription/route.ts` consume the billing boundary without caller-side billing assembly
- [ ] `src/app/api/v1/stripe/create-portal/route.ts` is either deliberately left direct as a mutation-adjacent path or migrated with rationale captured in the plan review
- [ ] Boundary integration coverage proves: full snapshot contract, subscription-only projection, coherent tier source, pre-created Stripe customer without lifecycle, and missing-user failure
- [ ] Redundant billing read-shape assertions move out of `tests/integration/stripe/usage.spec.ts`, leaving usage tests focused on metrics semantics
- [ ] `pnpm test:changed` and `pnpm check:full` finish green after the refactor

## Phases

- [ ] Phase 0 — Setup: confirm scope, create plan + todos artifacts
- [ ] Phase 1 — Boundary contract + internal composition (`account-snapshot.ts`, `usage-metrics.ts`)
- [ ] Phase 2 — Consumer migration (pricing, settings billing, plans surfaces, subscription API)
- [ ] Phase 3 — Test reshaping (boundary integration, consumer updates, usage test narrowing)
- [ ] Phase 4 — Validation (`pnpm test:changed` + `pnpm check:full`)
- [ ] Phase 5 — Verify ACs, close issue #305

## Review

### Status

- Planning drafted. No implementation started.

### Scope guardrails

- Keep this issue on the authenticated billing read boundary and its read consumers.
- Do not silently absorb quota reservation / rollback or broader Stripe webhook transition work into this slice.
- Do not widen the mutation-path `create-portal` route without concrete evidence that the read boundary should own it.
