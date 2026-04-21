# 004 — Deepen Billing Account Snapshot Read Model

Source: GitHub issue [#305](https://github.com/saldanaj97/atlaris/issues/305).

## Acceptance Criteria

- [x] `getBillingAccountSnapshot` exposes discriminated projection (`full` default, `subscription` opt-in)
- [x] Boundary owns subscription fields, Stripe ids, portal eligibility for read consumers
- [x] Full projection passes loaded tier into `getUsageSummary` so limits do not re-resolve tier
- [x] `src/app/pricing/page.tsx` uses subscription projection; anon users null-guard (`?? false`)
- [x] BillingCards, PlansContent, subscription API use args-object boundary (full projection)
- [x] `create-portal` left direct; rationale in Review
- [x] Integration tests: full + subscription projections, tier coherence, pre-created customer, missing user
- [x] Usage integration tests: explicit-tier short-circuit; metrics tests unchanged in intent
- [x] `pnpm test:changed` + `pnpm check:full` green

## Phases

- [x] Phase 0 — Plan artifacts + implementation
- [x] Phase 4 — Validation commands
- [ ] Phase 5 — Close issue #305 on GitHub after merge (manual)

## Review

### create-portal (intentional exclusion)

`src/app/api/v1/stripe/create-portal/route.ts` keeps `canOpenBillingPortalForUser(user)` on the auth-loaded row. Mutation-adjacent; no need to route through the read snapshot boundary.

### Verification notes

- Full snapshot path: `getUsageSummary(userId, dbClient, billingRow.tier)` — no second `resolveUserTier` for that request.
- `BillingSnapshotNotFoundError` exported for tests/assertions.

### Status

Implemented. Run `pnpm test:changed` and `pnpm check:full` before closing #305.
