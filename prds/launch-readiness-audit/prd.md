# PRD: Launch Readiness Hardening and Cost Guardrails

## Problem Statement

Atlaris is carrying avoidable launch risk in the exact places that hurt the most: plan creation and generation do not have a single authoritative lifecycle, AI usage accounting is not reliably correct across the main generation path, and several expensive request paths do unnecessary work before they know whether the request should be allowed to proceed.

From a user perspective, this creates a bad kind of unpredictability. A generation can be rejected after a plan shell already exists. Different entry points can enforce lifecycle rules differently. Retries and regenerations can multiply work. Status updates rely on hot polling instead of a cheaper and more deliberate contract. If these gaps stay in place, users will see phantom plans, confusing retry behavior, inconsistent quota outcomes, and slower or noisier status updates.

From the business perspective, the same gaps create blind AI spend, unnecessary database/runtime cost, and support pain right before launch. AI usage and cost data must be trustworthy. Expensive generation work must be gated before new records are created. Observability volume must be tuned for signal, not vanity. The launch problem is not generic cleanup. The launch problem is closing the specific correctness and cost gaps that can damage margin, reliability, and trust.

## Solution

Run a focused launch-readiness hardening initiative that converts the audit findings into one execution plan with a clear priority order.

The solution centers on five changes:

1. Make the existing plan lifecycle service the single owner of create, generate, retry, and regeneration orchestration.
2. Introduce one canonical AI usage contract and one shared cost-accounting path so every provider result is recorded consistently.
3. Move durable gating, idempotency, and retry policy ahead of expensive work so invalid or duplicate requests do not create junk records or multiply provider spend.
4. Reduce avoidable infrastructure burn by replacing aggressive polling with a cheaper status strategy and by tightening request-time database boundaries.
5. Trim observability and third-party read costs so pre-launch operations preserve critical signal without burning budget.

The goal is not a sweeping rewrite. The goal is to ship the minimum set of structural fixes that materially reduce launch risk now, while explicitly deferring lower-return cleanup until after launch.

## User Stories

1. As a learner, I want plan creation and generation to follow one consistent lifecycle, so that I do not get different behavior depending on which entry point I use.
2. As a learner, I want rejected generations not to leave behind phantom or stuck plans, so that my plan list reflects real work.
3. As a learner, I want retries and regenerations to avoid duplicate work, so that I do not see duplicated plans, confusing failures, or wasted quota.
4. As a learner, I want my generation request to fail fast when I am over a durable limit, so that I do not wait on work that was never allowed.
5. As a learner, I want generation status updates to feel timely without excessive refresh loops, so that the app feels responsive and stable.
6. As a learner, I want failed generations to end in a clear and consistent state, so that I understand whether I can retry.
7. As a learner using PDF input, I want proof, quota, and plan creation behavior to be consistent with normal generation flows, so that the system feels predictable.
8. As a paying user, I want my AI usage to reflect real work only, so that billing and usage limits feel fair.
9. As a paying user, I want abandoned or duplicated generations not to consume unnecessary budget, so that refreshes and disconnects do not silently waste value.
10. As a paying user, I want model constraints and output limits to be enforced consistently, so that plan generation remains reliable across tiers.
11. As a support agent, I want one lifecycle record to inspect when a user reports a plan-generation problem, so that I can diagnose issues quickly.
12. As a support agent, I want usage and quota outcomes to line up with real generation attempts, so that I can explain charges and limits confidently.
13. As an operator, I want AI token and cost metrics to be accurate for every generation path, so that I can monitor margin and detect regressions.
14. As an operator, I want the system to avoid unnecessary database churn on status and stream flows, so that growth does not turn into a boring cost leak.
15. As an operator, I want observability settings to preserve failures and high-value traces without flooding Sentry, so that monitoring stays useful and affordable.
16. As an operator, I want duplicate or abandoned generation work to be minimized, so that infrastructure spend tracks real user value.
17. As an operator, I want subscription status reads to avoid unnecessary live provider calls, so that the billing experience stays fast and resilient.
18. As a developer, I want one module to own the plan lifecycle, so that fixes land once instead of being reimplemented across routes and workers.
19. As a developer, I want AI usage normalization and cost calculation to live behind one contract, so that providers and persistence cannot silently drift apart.
20. As a developer, I want durable limits, idempotency, and retry rules to be centralized, so that thin callers do not need to coordinate policy.
21. As a developer, I want request-time database boundaries to be explicit, so that request-scoped and worker-scoped behavior is easy to reason about.
22. As a developer, I want status reads to depend on a small and stable contract, so that I am not rebuilding expensive summaries on every poll.
23. As a developer, I want launch-blocking fixes to be separated from post-launch cleanup, so that the team does not confuse urgency with scope creep.
24. As a finance owner, I want output-token ceilings, AI spend visibility, and observability budgets in place before launch, so that unit economics are not guesswork.
25. As a product owner, I want the launch hardening plan to target reliability and cost control first, so that we ship a stable product instead of polishing around structural risk.
26. As a future maintainer, I want the remaining debt to be explicitly documented as deferred, so that the launch plan remains realistic and the follow-up work is not lost.

## Implementation Decisions

- Make the plan lifecycle service the authoritative owner of plan creation, generation execution, retry handling, and regeneration execution. Legacy orchestration paths become thin adapters or are removed.
- Introduce a canonical generation-usage model at the provider boundary. Every AI provider returns the same usage fields, and all persistence/billing code consumes that shared shape.
- Centralize AI cost calculation in one place. Missing usage data is treated as an explicit error or alert condition rather than being silently recorded as zero.
- Enforce durable generation limits, quota checks, and idempotency before a new plan shell is created. The system should not create user-facing plan records for requests that are going to be rejected.
- Define a single retry owner across provider calls, lifecycle attempts, and queued jobs. Retry multiplication must be intentional and bounded, not accidental.
- Add explicit output-token ceilings based on model and expected plan shape so provider defaults cannot drive runaway output spend.
- Tighten request-time database ownership so the generation flow does not open extra database contexts unless there is a hard requirement. If multiple contexts remain necessary, their roles must be explicit and observable.
- Introduce a cheaper status contract. Prefer event-driven status delivery where practical; otherwise use stronger backoff, jitter, and a simplified read model instead of a hot polling loop.
- Add default pagination and lighter-weight plan summaries for plan-list reads so read cost grows with intent, not with total historical rows.
- Serve subscription status primarily from local state synchronized by webhooks, using live provider reads only for repair, administrative, or bounded fallback cases.
- Reduce observability volume before launch. Keep exception reporting and high-value tracing, but lower replay, trace, and log-shipping defaults to a level that matches expected launch traffic.
- Allow lightweight supporting persistence changes only where they materially enable idempotency, status snapshots, or lifecycle invariants. Avoid broad schema redesign in this initiative.
- Sequence work by launch risk, not architectural purity. Accuracy of usage accounting, lifecycle consistency, and cost guardrails take precedence over deeper refactors with weaker near-term ROI.

## Testing Decisions

- Good tests for this work assert external behavior, persisted invariants, and user-visible state transitions rather than helper call order or internal sequencing.
- Lifecycle tests should verify that the authoritative lifecycle boundary accepts validated input, enforces gating, creates or rejects plans correctly, finalizes generation state correctly, and records usage consistently across success and failure outcomes.
- Usage-accounting tests should verify that provider results normalize into the canonical usage model, that cost calculation is deterministic, and that missing usage becomes an explicit failure path instead of a silent zeroed write.
- Idempotency and retry-policy tests should verify duplicate submission handling, abandoned-request behavior, and bounded retry semantics across stream, retry, and regeneration flows.
- Status-delivery tests should verify observable status behavior under pending, ready, failed, and retryable states while avoiding tests that depend on implementation-specific polling internals.
- Read-path tests should verify pagination defaults, lightweight summaries, and billing-status fallback behavior based on stable response contracts.
- Observability tests should focus on contract-level behavior where meaningful, such as environment-based sampling decisions or whether high-severity failures are still captured after volume reductions.
- Similar prior art already exists in the codebase for plan streaming integration coverage, lifecycle race-condition coverage, worker processing coverage, and DB query helper testing. Reuse those behavioral patterns instead of introducing mock-heavy choreography tests.
- Favor boundary tests around deep modules and thin adapter tests for wiring. Do not grow a new forest of shallow unit tests that only prove one helper called another helper.

## Out of Scope

- Rewriting the entire AI orchestration stack beyond the usage contract, retry ownership, and launch-critical guardrails.
- Replatforming background jobs onto a different queue or worker system.
- Redesigning pricing, tier packaging, or subscription product strategy.
- Performing a full persistence rewrite for regeneration or attempt finalization when a smaller hardening step is sufficient for launch.
- Rebuilding preview and CI infrastructure beyond low-effort cost controls and obvious launch-facing waste reduction.
- Expanding PDF processing into a larger async platform initiative unless launch traffic proves it necessary.
- General UI polish work unrelated to lifecycle consistency, status behavior, or user-visible reliability.
- Broad architecture cleanup that does not directly reduce launch risk, operating cost, or billing correctness.

## Further Notes

- This PRD should be executed in phases. Phase 1 is launch-blocking correctness and spend visibility: canonical usage accounting, output-token caps, pre-creation gating, and clear lifecycle ownership. Phase 2 is pre-launch hardening: status-cost reduction, request-time DB boundary cleanup, retry/idempotency policy, and observability tuning. Phase 3 is post-launch cleanup: deeper persistence simplification, queue consolidation, and broader operational cost trimming.
- Success criteria for launch readiness should be explicit. At minimum: every generation path records trustworthy usage or raises an explicit accounting failure, rejected requests do not create user-facing junk plans, one lifecycle boundary owns create and generate behavior, and status traffic no longer depends on an aggressive fixed poll loop.
- This initiative is intentionally biased toward reducing real launch risk. If a proposed change is elegant but does not improve correctness, cost visibility, or operating leverage before launch, it belongs in follow-up work, not in the critical path.
