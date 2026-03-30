# Local Product-Testing Hosted-Service Mocks — Todos

## Notes

- This PRD is now scoped to **local product testing**, not local auth/session parity.
- Staging remains the place for real Neon Auth and hosted-provider end-to-end verification.
- Seeded local users are part of the foundation, not a later DX add-on.
- Reuse existing seams wherever possible: auth wrappers, RLS context, Stripe DI, AI runtime mock, and AV scanner factory.

## Execution Order Summary

```text
Phase 1:
  1. Local product-testing contract and bootstrap
  2. Seeded local identity path
  3. Stripe / billing local provider and webhook simulator

Phase 2:
  4. AI runtime mock hardening
  5. AV mock provider improvements

Phase 3:
  6. Docs, observability, smoke workflow, and DX polish
```

---

## Phase 1: Foundation and Core Product Flows

### 1. Local Product-Testing Contract and Bootstrap

- **Blocked by:** None
- **Parallel candidate:** No

**Summary:** Define the local product-testing mode, config rules, seeded-data expectations, and bootstrap path that the rest of the PRD relies on.

**Acceptance criteria:**

- [ ] Local product-testing mode is explicit and fails closed outside development/test
- [ ] Config precedence is documented for new local-mode settings versus existing service-specific env vars
- [ ] Local bootstrap defines the required DB, env, and seeded-user prerequisites
- [ ] At least one deterministic seeded local user exists for smoke testing
- [ ] Minimal docs explain how to start local mode before later polish work begins

---

### 2. Seeded Local Identity Path

- **Blocked by:** Local Product-Testing Contract and Bootstrap
- **Parallel candidate:** No

**Summary:** Let local product flows resolve to an existing seeded user through an explicit local identity override, without pretending to provide real hosted auth/session parity.

**Acceptance criteria:**

- [ ] A seeded local user can access protected product routes needed for local testing
- [ ] Protected API routes and protected page flows use the same local user identity source in development
- [ ] Missing or invalid local user selections fail fast and do not auto-provision users
- [ ] Real-session-only paths remain real-session-only
- [ ] Local shell/header auth affordances stay consistent with the active local user state

---

### 3. Stripe / Billing Local Provider and Webhook Simulator

- **Blocked by:** Local Product-Testing Contract and Bootstrap, Seeded Local Identity Path
- **Parallel candidate:** Partial

**Summary:** Add a local Stripe path that keeps pricing, checkout, portal, and webhook-driven subscription state changes believable and internally consistent without real Stripe.

**Acceptance criteria:**

- [ ] Local pricing renders from a canonical local billing catalog without live Stripe calls
- [ ] Checkout returns a local-safe flow that still leads to webhook-driven DB updates
- [ ] Portal supports local subscription-management smoke testing
- [ ] Local webhook simulation reuses the app's normal event-processing logic, including dedupe and rollback behavior
- [ ] Local billing failure scenarios are testable: bad price, duplicate event, sync failure, payment failure, and cancellation/deletion

---

## Phase 2: AI and Upload Safety Flows

### 4. AI Runtime Mock Hardening

- **Blocked by:** Phase 1 foundation
- **Parallel candidate:** Yes

**Summary:** Expand the runtime AI mock so it is useful for deliberate local product testing, not only generic success-path demos.

**Acceptance criteria:**

- [ ] Local AI output remains deterministic when configured to be deterministic
- [ ] Named local scenarios exist for success and important failures
- [ ] Streaming behavior remains believable through the real route/orchestrator path
- [ ] Usage and provider metadata are realistic enough for local product smoke checks
- [ ] Failure scenarios are triggerable without editing code

---

### 5. AV Mock Provider Improvements

- **Blocked by:** None
- **Parallel candidate:** Yes

**Summary:** Preserve heuristic-only scanning as the local default, while adding a richer AV mock provider for product-testing scenarios.

**Acceptance criteria:**

- [ ] `AV_PROVIDER=none` continues to mean heuristic-only scanning
- [ ] A separate local mock AV provider supports clean, infected, timeout, and malformed-provider cases
- [ ] PDF extraction continues to fail closed on malware or scan failure
- [ ] Local AV behavior is visible in logs or debug output
- [ ] Core AV scenarios are covered by tests

---

## Phase 3: Developer Experience, Docs, and Verification

### 6. Docs, Observability, Smoke Workflow, and DX Polish

- **Blocked by:** Local Product-Testing Contract and Bootstrap
- **Parallel candidate:** No

**Summary:** Turn the local product-testing system into a repeatable developer workflow with clear docs, visible mock-state diagnostics, and explicit boundaries.

**Acceptance criteria:**

- [ ] `.env.example` and dev docs explain local mode and required bootstrap steps
- [ ] Docs list which flows are local-safe and which still require staging or real providers
- [ ] A recommended manual smoke-test workflow exists for auth-adjacent flows, billing, AI, and PDF upload
- [ ] Logs or UI diagnostics make it obvious which local mock paths are active
- [ ] A fresh developer can reproduce the local workflow without tribal knowledge
