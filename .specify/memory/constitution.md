<!--
Sync Impact Report
Version change: (none prior) -> 1.0.0
Modified principles: (initial set)
Added sections: Core Principles, Technology & Architectural Constraints, Delivery Workflow & Quality Gates, Governance
Removed sections: None
Templates requiring updates:
 - .specify/templates/plan-template.md ✅ (no outdated references; will consume principles dynamically)
 - .specify/templates/spec-template.md ✅ (no hard-coded principle names)
 - .specify/templates/tasks-template.md ✅ (references constitution generically)
Follow-up TODOs:
 - TODO(RATIFICATION_DATE): Need original adoption date (set when team formally approves). Using today's date as provisional.
-->

# Learning Path App Constitution

## Core Principles

### 1. Minimal Surface Area First

All new functionality MUST start with the smallest viable UI and API surface. Avoid premature
abstractions, background services, or layering until a real user path demands it. Reject additions
that serve only hypothetical future features. Complexity must be explicitly justified in PRs.
Rationale: Keeps velocity high, reduces maintenance cost, and aligns with a focused MVP.

### 2. Single Backend: Supabase-Centric

All persistence, auth, row level security (RLS), and edge functions MUST run via Supabase
capabilities unless a documented limitation blocks progress. No standalone custom servers or
ancillary managed backends may be introduced without a governance-approved exception record.
Rationale: Consolidation minimizes operational burden and leverages proven hosted primitives.

### 3. Server Actions over REST Endpoints

Wherever feasible, Next.js Server Actions MUST be preferred over creating bespoke API route
handlers. API routes are allowed only when (a) external webhook integration requires a public
endpoint, (b) streaming protocols unsupported by actions are needed, or (c) explicit caching/
edge behavior mandates it. Each exception MUST cite which criterion applies.
Rationale: Reduces boilerplate and keeps logic colocated with React components.

### 4. Auth via Clerk Only

User authentication, session management, and identity MUST be implemented exclusively with Clerk.
No custom JWT minting, password flows, or parallel auth providers unless an exception is approved.
Rationale: Eliminates security foot‑guns and accelerates delivery with a dependable managed layer.

### 5. Type Safety & Data Integrity

All domain data access MUST flow through Drizzle ORM + generated types. Direct SQL strings (except
in migrations/seed scripts) are prohibited. Zod (or equivalent) MUST validate all external inputs
at boundaries (server actions, webhooks). Dangerous casts (as any) are disallowed in domain code.
Rationale: Strong typing prevents drift between schema, validation, and runtime usage.

### 6. RLS-Backed Security Is Testable

Every table protected by row level security MUST have executable test coverage proving: (a) owner
read/write allowed, (b) unauthorized access denied, (c) enumerability prevented. New schema objects
without accompanying RLS tests CANNOT merge. Tests MUST run locally using Supabase test scripts.
Rationale: Enforces least privilege and prevents silent security regressions.

### 7. Accessible & Lean UI

All UI components MUST meet basic accessibility: semantic HTML, labels for inputs, color contrast
considerations. Avoid over-styling and heavy UI libraries; prefer existing primitives first. Any
third-party UI lib addition requires a bundle cost note (< +30kb gz) in the PR description.
Rationale: Ensures inclusive experience and keeps performance budget intact.

### 8. Observability Lite

Errors surfaced to users MUST include a stable correlation identifier logged server-side. Logging
MUST avoid sensitive PII. Expensive instrumentation (tracing platforms, metrics SaaS) is deferred
until a scaling threshold is documented (>1k DAU or sustained perf issues). Until then, rely on
structured console logging + Supabase logs.
Rationale: Provides actionable diagnostics without premature ops complexity.

### 9. Incremental AI Integration

AI-generated plan or content features MUST run server-side, never expose raw provider keys to
clients, and MUST include usage caps or guardrails. Each AI addition MUST document: provider, cost
estimation path, and fallback UX if the model call fails.
Rationale: Controls cost and mitigates security + reliability risks.

### 10. Test Discipline: Security & Critical Paths First

Prioritized tests include: (a) RLS security, (b) learning plan creation/update flows, (c) billing &
subscription logic (Stripe), (d) data migrations. Broader unit tests are added only after these
critical paths have coverage. Failing tests MUST block merge; flaky tests MUST be quarantined
within 24h or removed with issue link + justification.
Rationale: Focuses limited testing capacity on highest risk areas.

## Technology & Architectural Constraints

1. Stack: Next.js (App Router), TypeScript, Supabase (Postgres + Auth + Storage), Drizzle ORM,
  Clerk for auth, Stripe for billing (if/when billing introduced), minimal UI components.
2. No additional persistent stores (Redis, Mongo, etc.) without governance exception.
3. Database schema changes MUST be codified via Drizzle migrations committed in version control.
4. Secrets MUST be managed via environment variables; never commit .env values or keys.
5. Async/background work MUST first attempt: (a) edge functions (Supabase), (b) incremental static
  regeneration, (c) scheduled functions—before adding external queues.
6. Feature flags: use simple boolean/config in code until >3 flags exist; then propose a flag
  system. Keep a running list in docs if flags exceed 2.
7. Performance budget: initial page TTFB < 300ms (local dev baseline), Largest Contentful Paint
  target < 2.5s on a mid‑tier device. PRs introducing regressions must include mitigation plan.

## Delivery Workflow & Quality Gates

1. All feature specs MUST define testable functional requirements; ambiguous items blocked.
2. Each PR MUST reference either a spec or a clearly scoped issue with acceptance criteria.
3. Schema-affecting PRs MUST include: migration file, updated Drizzle types, and (if RLS impacted)
  updated RLS tests.
4. Server actions MUST include input validation + error boundary narrative (what user sees on
  failure).
5. New external dependency additions MUST include: purpose, lighter alternative considered, bundle
  or cold-start impact summary.
6. Security-impacting changes (auth logic, RLS policy, role expansion) REQUIRE reviewer with
  security context sign-off (document reviewer in PR body).
7. Pre-merge checklist (automated or manual): build passes, lint clean, type check passes, RLS test
  suite passes, no TODOs referencing "TEMP" or "HACK" remain without linked issue.
8. Post-merge monitoring: verify logs for correlation ID anomalies or elevated error rates within
  first 30 minutes of deployment.

## Governance

Amendments: Any change to Core Principles requires a PR labeled "governance" with a diff summary,
version bump rationale (major/minor/patch), and impact audit across templates. Minor clarifications
that do not alter intent = patch; adding a new principle = minor; redefining or removing an
existing principle = major.

Enforcement: Reviewers MUST block merges violating explicit MUST statements unless an exception
record is appended in the PR describing scope, duration (time-boxed), and rollback trigger.

Compliance Review: Quarterly (or before major version tag) run an architectural audit: inventory
exceptions, verify RLS coverage, dependency creep, performance budget adherence.

Exception Handling: Approved exceptions MUST be logged in a `docs/exceptions.md` file with: date,
owner, rationale, expiry/review date.

Versioning Policy: Semantic versioning (MAJOR.MINOR.PATCH) applied to this constitution. Latest
version supersedes prior; superseded versions remain in git history.

Audit Hooks: Plan and tasks templates rely on principles generically; no hard-coded names beyond
referencing the constitution path. Update references if file path changes.

Development Guidance: Use `.rules/*-instructions.md` for runtime development guidance, and current technology guidance.

**Version**: 1.0.0 | **Ratified**: 2025-09-27 | **Last Amended**: 2025-09-27
