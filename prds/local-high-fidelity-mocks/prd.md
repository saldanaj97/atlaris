# PRD: Local Product-Testing Hosted-Service Mocks

## Problem Statement

Atlaris already has a staging environment for real auth and session smoke testing. The local problem is different: developers cannot reliably run the app against local-safe dependencies and click through believable product flows without touching hosted services.

Today, local development is a patchwork:

- auth has a partial development override through `DEV_AUTH_USER_ID`, but it is not a real session model and it breaks if the referenced DB user does not already exist;
- billing still assumes real Stripe unless tests inject a fake client;
- AI already has a runtime mock path, but it is not rich enough for deliberate local failure testing;
- AV scanning is local-safe through heuristic-only mode, but there is no high-fidelity mock provider for clean, infected, timeout, and malformed-provider scenarios.

That forces developers into a bad loop: either rely on staging for too much, avoid manual smoke testing entirely, or carry around brittle one-off setup. The result is slower feedback, less confidence in product behavior, and more late discovery of integration bugs.

## Goal

Make local development good at **product testing**, not fake infrastructure parity.

Success means a developer can:

1. start the app and local DB;
2. choose or configure a seeded local user;
3. exercise the main signed-in product flows locally;
4. test billing, AI, and PDF upload behavior through the app's normal business logic;
5. trigger realistic local success and failure scenarios on demand;
6. know clearly which flows still require staging or real providers.

## Non-Goal

This PRD does **not** attempt to recreate hosted auth/session behavior locally.

Staging remains the source of truth for:

- real Neon Auth cookie/session behavior;
- true OAuth provider behavior;
- final end-to-end verification against hosted infrastructure.

Local mode should stop short of that line and be honest about it.

## Solution

Introduce one coherent local product-testing mode built on seeded local data and explicit provider seams.

The key decisions are:

1. Use **seeded local users** as the foundation for authenticated local product flows.
2. Treat `DEV_AUTH_USER_ID` as a **local identity selector**, not a fake session system.
3. Reuse existing auth, RLS, route-handler, and service seams instead of creating parallel architectures.
4. Add a **billing-local path** that preserves checkout, portal, pricing, and webhook-driven subscription updates without real Stripe.
5. Expand the existing runtime AI mock into a **scenario-driven local testing tool**.
6. Keep AV heuristic-only mode intact, and add a **dedicated mock provider** instead of overloading `AV_PROVIDER=none`.
7. Move minimal bootstrap, env, and observability work earlier so the system is usable before the final docs-polish phase.

## User Stories

1. As a developer, I want to pick a seeded local user and reach the main signed-in product areas without using real hosted auth.
2. As a developer, I want local billing flows to exercise the same app logic and DB state transitions as production, without real Stripe.
3. As a developer, I want AI generation to feel believable locally and support explicit failure scenarios.
4. As a developer, I want PDF upload security flows to support clean, infected, timeout, and malformed-provider cases locally.
5. As a maintainer, I want local mocks to reuse existing seams so they stay aligned with production behavior.
6. As a maintainer, I want local mode to fail closed in production and be explicit about what is mocked.
7. As a fresh developer, I want a reproducible bootstrap path for local product testing without tribal knowledge.

## Implementation Decisions

- Staging covers real auth/session verification; local mode does not try to replace it.
- Seed local users in the database and require local product flows to use those records.
- Do not auto-provision users in local mode from fake identity metadata.
- Route local auth through existing server-side auth/RLS helpers where possible.
- Keep proxy bypasses narrow and explicit to the protected local product surfaces that need them.
- Preserve the webhook-driven billing write path; local checkout must not write subscription state directly.
- Introduce one canonical local billing catalog so pricing, checkout, portal, and webhook simulation stay aligned.
- Keep `AV_PROVIDER=none` meaning heuristic-only scanning; add a separate mock AV provider for richer local scenarios.
- Extend the runtime AI mock provider rather than moving test-helper-only logic into production code ad hoc.
- Add minimal local bootstrap and env documentation early, then finish polish and smoke-test workflow docs later.

## Testing Decisions

- Favor targeted integration tests for auth, billing, AI, and upload flows.
- Use `pnpm test:changed` only as a supplement, not as the acceptance gate for these slices.
- Validate local behavior through observable outputs: route access, DB writes, redirects, streamed output, token rows, and upload verdicts.
- Keep manual validation steps per slice because the point of this PRD is developer product-testing ergonomics.
- Explicitly test failure scenarios that matter in local mode: unknown local user, bad price ID, duplicate webhook, provider timeout, malformed responses, and disconnect cleanup.

## Out of Scope

- Recreating Neon Auth cookie/session refresh behavior locally.
- Replacing hosted auth with a local auth server.
- Full Stripe API parity.
- Third-party OAuth or Google Calendar integration work.
- Replacing production OpenRouter or MetaDefender integrations.
- Broad staging or CI changes unrelated to local product testing.

## Phase Breakdown

- **Phase 1:** Local product-testing contract, local bootstrap, seeded local identity path, and Stripe/billing mocks.
- **Phase 2:** AI mock hardening and AV mock provider improvements.
- **Phase 3:** Docs, observability, smoke workflow, and DX polish.

## Success Criteria

This PRD is successful when a developer can run `pnpm db:dev:up`, `pnpm db:dev:bootstrap`, and `pnpm dev`, choose a seeded local user, and manually exercise the main product flows locally with believable behavior and persisted state changes, while clearly knowing which auth/session and provider behaviors still require staging.
