# PRD: Local High-Fidelity Hosted-Service Mocks

## Problem Statement

Atlaris can already run a meaningful portion of its product locally, but the day-to-day development loop still depends too heavily on hosted services for realistic smoke testing. The application uses a local database only in test-specific paths today, while important user-facing flows still lean on managed Neon Auth, Stripe, Google OAuth, OpenRouter, and MetaDefender-backed PDF scanning behavior. That means a developer can often build UI and isolated units locally, but cannot confidently click through the app and exercise the same end-to-end workflows that matter in production without touching external infrastructure.

This is not just a convenience problem. It is a speed, reliability, and confidence problem. If the local environment cannot simulate the real behavior of auth, billing, integrations, AI generation, and upload security closely enough, developers end up either avoiding manual smoke testing, depending on shared hosted services, or carrying around brittle one-off environment setups. That slows feedback loops, hides integration bugs until late, and makes local debugging of unhappy paths much harder than it should be.

The goal is therefore not to achieve perfect 1:1 hosted parity. The goal is to make the local environment behave closely enough that a developer can run the app, sign in or simulate a signed-in user, perform common CRUD and workflow actions, and exercise realistic success and failure paths for the major external dependencies without needing the real hosted services for every step.

## Solution

Introduce a coherent local mock architecture for hosted dependencies, using the smallest credible set of changes that maximize manual smoke-testability while minimizing drift and blast radius.

The solution centers on seven decisions:

1. Add a **single local-mock mode contract** so service-specific mocks are coordinated instead of being enabled ad hoc through unrelated flags.
2. Build on the existing `DEV_AUTH_USER_ID` seam to provide a **higher-fidelity local auth/session path** that supports route protection, user provisioning, and common signed-in flows without requiring real Neon Auth for routine local work.
3. Add a **mock Stripe client path** that preserves the current billing route/service architecture, including checkout, portal, pricing, and webhook-driven state transitions, while avoiding live Stripe calls in local mode.
4. Add a **mock Google integration path** for OAuth initiation/callback/disconnect flows so local users can connect and disconnect a simulated Google Calendar integration without hitting Google.
5. Treat PDF malware scanning as a **local-safe, testable provider boundary**, expanding the existing factory/context seams so developers can simulate clean, infected, timeout, and invalid-provider cases locally.
6. Extend the existing AI mock provider so it is **high-fidelity enough for manual product testing**, not just unit tests — realistic streaming, deterministic scenarios, richer failure injection, and usage/cost signals that better resemble production behavior.
7. Ship the mock system with **developer-facing docs, env examples, and a recommended smoke-test workflow**, so the local experience is intentional and repeatable instead of tribal knowledge.

The solution is explicitly biased toward local product behavior, not full infrastructure parity. Real hosted services remain the source of truth for production-only behavior and final verification, but local development should no longer require them for the majority of manual smoke testing.

## User Stories

1. As a developer, I want to run the app locally and exercise major signed-in flows without provisioning real Neon Auth for every local session.
2. As a developer, I want to create, view, update, and retry plans locally while seeing behavior that is close enough to production to trust my manual smoke testing.
3. As a developer, I want local billing flows to behave like real checkout, portal, and subscription updates so I can validate UI and server behavior without touching Stripe.
4. As a developer, I want Google integration flows to be locally testable so I can validate connect/disconnect UX and token persistence behavior without real OAuth setup.
5. As a developer, I want PDF upload security flows to support clean and failing local scenarios so I can test malware handling, timeouts, and invalid responses without a real AV service.
6. As a developer, I want AI generation mocks to be realistic enough that the product feels believable in local mode, including streaming, timing, usage accounting, and failure modes.
7. As a developer, I want failure scenarios such as rate limits, provider outages, webhook problems, and expired integrations to be reproducible locally so I can debug them on demand.
8. As a support/debugging engineer, I want local mocks to preserve the app’s database writes and state transitions where practical so I can reason about persisted side effects, not just mocked UI responses.
9. As a maintainer, I want each hosted-service mock to fit the codebase’s existing abstractions and dependency injection seams so we do not create parallel architectures that drift from production code.
10. As a maintainer, I want mock mode to be explicit and documented so developers know which behaviors are simulated and which still require real hosted services.
11. As a product owner, I want local manual testing to cover as much real user behavior as possible so feature validation does not bottleneck on hosted quotas or shared environments.
12. As an operator, I want local mocks to reduce accidental calls to paid or quota-limited providers during development so local work does not burn budget or create noisy data.

## Implementation Decisions

- Introduce one top-level local mock mode concept for hosted dependencies instead of adding isolated booleans with inconsistent semantics across services.
- Preserve existing production code paths where possible; favor **provider/factory selection** over broad route forks.
- Reuse the current `DEV_AUTH_USER_ID` development seam instead of trying to replace Neon Auth entirely for local work.
- Keep Neon Auth, Stripe, Google OAuth, OpenRouter, and MetaDefender integrations as the canonical production paths; local mocks should be opt-in, explicit, and non-production-only.
- Prefer **service-level mock implementations** (e.g. mock Stripe client, mock Google OAuth adapter) that still drive the app’s normal route/service code rather than bypassing business logic entirely.
- Keep webhook, subscription sync, integration status, and persisted state changes observable in local mode when the real product behavior depends on them.
- Reuse the existing AI mock provider and expand it, rather than introducing a second AI mock architecture.
- Reuse the existing malware-scan factory/context seams and non-production `AV_PROVIDER=none` behavior, expanding them only where realism gaps matter for local smoke testing.
- Avoid mixing this initiative with unrelated database-parity work. The local DB plan is complementary, but this PRD focuses on hosted-service mocks.
- Explicitly document the remaining non-mocked or low-fidelity areas so developers know where local behavior still diverges from production.

## Testing Decisions

- Good tests for this initiative should validate **observable local behavior**, not just that a mock object was called.
- Route and service tests should confirm that local mock mode still drives normal business logic, persistence paths, and user-visible responses.
- Auth tests should cover signed-in route access, middleware bypass behavior, user auto-provisioning, and known limitations around true cookie/session refresh parity.
- Billing tests should cover checkout URL creation, portal URL creation, webhook-driven subscription sync, pricing-page fallback behavior, and failure scenarios such as bad price IDs or price lookup timeouts.
- Google integration tests should cover OAuth initiation, callback token storage, disconnect cleanup, and local mocked redirect semantics.
- AV tests should cover heuristic-only mode, mock provider clean/infected responses, timeout behavior, and invalid provider payload handling.
- AI tests should cover deterministic local content generation, realistic SSE chunking, error injection, and usage metadata behavior under local mock mode.
- Favor TDD around seams that already exist in the codebase: optional client injection, route handler factories, provider factories, and context injection.
- Keep a small number of high-value integration tests that prove the local mock mode still exercises the real app layers end to end.

## Out of Scope

- Replacing managed Neon Auth with a fully local auth server.
- Achieving perfect cookie/session-refresh parity with Neon Auth internals.
- Building a full Google Calendar sync engine if that functionality is not yet implemented in the app.
- Replacing production webhook infrastructure with a separate queue or event platform.
- General refactors of billing, auth, or integrations code that do not materially improve local mock fidelity.
- Full “everything local” infrastructure parity for every external service.
- Broader staging or CI strategy changes unrelated to local mockability.

## Further Notes

- This PRD should be executed in phases. Phase 1 should focus on the **foundational local mock contract and the highest-value user-facing hosted dependencies**: auth/session behavior, Stripe/billing, and the local-mode architecture that ties these mocks together. Phase 2 should extend local fidelity into Google integrations, AV scanning, and AI realism. Phase 3 should focus on polish, developer ergonomics, and documentation.
- Success for this initiative is not “all hosted services replaced.” Success is that a developer can run `pnpm dev`, point the app at local-safe dependencies, and manually exercise the majority of product flows with believable behavior and persisted state changes.
- The implementation should stay biased toward **minimum additional architecture**. Wherever the codebase already exposes test seams or factory patterns, those should become the production local-mock seams rather than inventing a new abstraction stack.
