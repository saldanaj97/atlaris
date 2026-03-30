# Local High-Fidelity Hosted-Service Mocks — Todos

## Notes

- This PRD is planning work only. No implementation has started.
- The goal is to maximize **local manual smoke-testability** while preserving production paths and minimizing drift.
- Prefer reusing existing seams (`DEV_AUTH_USER_ID`, optional Stripe client injection, AI mock provider, AV scanner factory/context) over creating parallel architectures.

## Execution Order Summary

```text
Phase 1 (recommended order):
  1. Local mock mode contract & env surface
  2. Local auth/session mock path
  3. Stripe/billing mock provider + webhook simulator

Phase 2 (parallel after Phase 1 foundations):
  4. Google OAuth / integration mock path
  5. AI mock fidelity hardening
  6. AV scanner mock mode improvements

Phase 3:
  7. Docs, local smoke workflow, and DX cleanup
```

---

## Phase 1: Core Local Hosted-Mock Foundations

### 1. Local Mock Mode Contract & Env Surface

- **Blocked by:** None
- **Parallel candidate:** No — should land first

**Summary:** Define one coherent local mock contract, env surface, and service-selection pattern so auth, billing, integrations, AI, and AV mocks do not evolve as unrelated toggles.

**Acceptance criteria:**

- [ ] One explicit local mock mode contract exists and is documented
- [ ] Service-specific mock flags/config are grouped under a coherent pattern
- [ ] Production behavior remains unchanged when local mock mode is off
- [ ] Existing service seams are reused where possible instead of introducing duplicate abstractions
- [ ] Tests cover environment selection behavior

---

### 2. Local Auth / Session Mock Path

- **Blocked by:** Local Mock Mode Contract & Env Surface
- **Parallel candidate:** No — depends on slice 1

**Summary:** Extend the existing dev auth bypass into a higher-fidelity local signed-in flow that supports route protection, request auth resolution, and user provisioning without real Neon Auth for routine local work.

**Acceptance criteria:**

- [ ] Local dev can enter an authenticated app state without real Neon Auth
- [ ] Protected API routes and page flows behave consistently in local mock mode
- [ ] User provisioning works with local auth metadata
- [ ] Known limitations around real cookie/session parity are documented
- [ ] Tests cover signed-in local flows and route protection behavior

---

### 3. Stripe / Billing Mock Provider and Webhook Simulation

- **Blocked by:** Local Mock Mode Contract & Env Surface
- **Parallel candidate:** Yes — can run after slice 1, in parallel with slice 2 where file overlap allows

**Summary:** Add a mock Stripe client path that preserves checkout, portal, pricing, and webhook-driven subscription state transitions locally without hitting Stripe.

**Acceptance criteria:**

- [ ] Checkout route returns realistic local mock session URLs
- [ ] Portal route returns realistic local mock portal URLs
- [ ] Pricing page can render without live Stripe calls in local mock mode
- [ ] Subscription lifecycle events can be simulated locally and still update DB state through the app’s normal sync paths
- [ ] Tests cover success and failure paths for checkout, portal, pricing, and subscription sync

---

## Phase 2: High-Fidelity Integrations

### 4. Google OAuth / Integration Mock Path

- **Blocked by:** Local Mock Mode Contract & Env Surface, Local Auth / Session Mock Path
- **Parallel candidate:** Yes — after auth foundation is stable

**Summary:** Make Google integration connect/disconnect flows locally testable by simulating OAuth initiation, callback token exchange, token storage, and disconnect cleanup.

**Acceptance criteria:**

- [ ] Local users can connect a simulated Google Calendar integration
- [ ] Callback flow stores realistic mock tokens via the normal app paths
- [ ] Disconnect flow revokes or simulates revocation and deletes stored tokens
- [ ] Integration status endpoint reflects local mocked connection state
- [ ] Tests cover connect, callback, status, and disconnect behavior

---

### 5. AI Mock Fidelity Hardening

- **Blocked by:** None
- **Parallel candidate:** Yes — can run in parallel with slice 4

**Summary:** Extend the existing AI mock provider so local manual testing sees more realistic streaming, content generation, usage accounting, and failure behavior.

**Acceptance criteria:**

- [ ] AI mock output varies meaningfully with input topic and difficulty
- [ ] Mock mode supports deterministic and scenario-driven failures
- [ ] SSE/streaming behavior remains believable for local product testing
- [ ] Usage metadata is realistic enough for local billing/quota smoke checks
- [ ] Tests cover realistic success and failure scenarios

---

### 6. AV Scanner Mock Mode Improvements

- **Blocked by:** Local Mock Mode Contract & Env Surface
- **Parallel candidate:** Yes — can run in parallel with slice 4 or 5

**Summary:** Expand the AV scanner’s existing seams so local dev can simulate clean, infected, timeout, and invalid-provider responses without external AV dependencies.

**Acceptance criteria:**

- [ ] Local PDF flows can run with no external AV provider
- [ ] Mock mode can simulate clean and infected outcomes
- [ ] Timeout and malformed-provider scenarios are locally testable
- [ ] Existing heuristic protections still run in local mode where appropriate
- [ ] Tests cover the key scan scenarios

---

## Phase 3: Developer Experience & Verification

### 7. Docs, Env Examples, and Local Smoke Workflow

- **Blocked by:** Phase 1 and enough of Phase 2 to describe real workflows
- **Parallel candidate:** No — should land after behavior settles

**Summary:** Document how to run the app locally with high-fidelity mocks, what remains mocked vs real, and how to manually smoke-test major flows.

**Acceptance criteria:**

- [ ] `.env.example` or equivalent documents local mock settings
- [ ] Docs explain which services are mocked and which are still real
- [ ] A recommended manual smoke-test flow exists for auth, plans, billing, integrations, and PDF upload
- [ ] Known non-parity areas are explicitly called out
- [ ] Local workflow is reproducible by a fresh developer without tribal knowledge

---

## Audit Review (2026-03-30)

Status: Not planning-ready yet. Phase 1 research has several blocking gaps that should be corrected before detailed implementation plans are written.

### Blocking findings to resolve first

- Local auth is currently described too loosely. `DEV_AUTH_USER_ID` is a server-side identity override seam, not a real session system, and the docs do not yet define how protected non-API routes will work without creating server/client auth drift.
- The shared local mock contract is missing hard safety rules. The docs need explicit fail-closed behavior in production, precedence rules against existing env flags, and invalid-state handling for mixed old/new config.
- Phase 1 research drifts past the PRD boundary by pulling Google, AI, and AV selector work into the foundational slice even though the PRD puts those in Phase 2.
- Google local-mock planning does not yet preserve the real callback security boundary. The real callback currently requires a real authenticated user plus state-token validation, and the docs do not clearly protect that boundary.
- Stripe webhook simulation is under-specified. The current no-secret dev webhook path is effectively a noop for DB sync, so Phase 1 cannot claim local subscription-state fidelity until it defines a stateful simulator path.
- Billing mock design is missing a canonical local billing catalog for price IDs, amounts, interval metadata, and tier mapping. Without that, pricing, checkout, and webhook sync will drift.
- The testing plan is not credible yet. `pnpm test:changed` is not enough for the route, middleware, DB, and webhook behaviors being changed; targeted integration validation needs to be defined per slice.
- Fresh-developer local bootstrap is pushed too late. Local prerequisites such as auth user provisioning expectations, billing config, DB requirements, and OAuth token-encryption setup need to be documented as part of the foundation, not only in a later docs phase.

### Required doc corrections before planning

- Add explicit config-precedence and production-safety rules to the PRD/research.
- Tighten acceptance criteria so they are observable and testable instead of relying on terms like `realistic`, `believable`, or `behave consistently`.
- Re-scope Phase 1 research to the actual Phase 1 surface: mock contract, local auth path, and Stripe/billing.
- Add a dedicated Google security-boundary design note before any future Google mock planning.
- Expand Stripe research to cover event dedupe, retry/rollback behavior, delete-event state clearing, and local pricing-source invariants.
- Replace generic validation steps with concrete slice-specific test commands and expected outcomes.
