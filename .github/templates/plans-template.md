# Feature Implementation Plan Template

> Use this template to plan and execute a feature end‑to‑end. Keep it general, but concrete enough that anyone can follow and implement. Follow a strict TDD loop for each task: write failing test → see it fail → implement → see it pass → commit.

---

## Overview

**Feature Name:** [FEATURE_NAME]

**Goal:** [Describe the high‑level outcome and user value. What is the feature supposed to achieve?]

**Success Criteria:**
- [Measurable outcome 1]
- [Measurable outcome 2]
- [Non‑functional target: performance, accessibility, etc.]

**Scope:**
- In‑scope: [bullet list]
- Out‑of‑scope: [bullet list to prevent scope creep]

**Risks/Assumptions:**
- Assumptions: [environment, data availability, feature flags, etc.]
- Risks + mitigations: [top 2‑3]

---

## Architecture

Describe how the feature fits into the system. Be specific about boundaries and contracts, but keep tech choices generic and swappable.

- Approach: [e.g., compute‑on‑read, compute‑on‑write, or hybrid]
- Caching: [e.g., write‑through/read‑through JSON cache per entity; invalidation keyed by deterministic hash]
- Data flow: [request → API → queries → core logic → cache → response]
- Determinism: [note if outputs must be deterministic and how you ensure it]
- Security: [authn/authz strategy; data access via RLS/policies]
- Error handling: [validation boundaries, typed errors, retries]
- Observability: [logging, metrics, tracing, usage tracking]

---

## Tech Stack

List the primary technologies you will use, aligned to this repo.

- Runtime/UI: Next.js App Router (React), TypeScript
- Data: Drizzle ORM, PostgreSQL (JSONB allowed), RLS policies
- API: Server functions/routes, composable data loaders
- Testing: Vitest (+ Testing Library for React)
- Utilities: [libraries needed for dates, hashing, parsing, etc.]

Note: Prefer small, focused deps. Justify each addition.

---

## Milestones & Tasks

Use the following task pattern. Add/omit tasks as needed. Keep task descriptions technology‑agnostic but precise. For each task, follow the TDD steps provided.

### Task 1: Dependencies and Core Types

Purpose: establish minimal deps and shared types used across the feature.

Files:
- Modify: `package.json`
- Create: `src/lib/[feature]/types.ts`
- Test: `tests/unit/[feature]/types.spec.ts`

Steps:
1) Add dependency (if any)
   - Run: `pnpm add [package]`
   - Expected: dependency installed
2) Write failing test (types)
   - Run: `pnpm vitest run tests/unit/[feature]/types.spec.ts`
   - Expected: FAIL (module not found or type mismatch)
3) Implement types
4) Re‑run test
   - Expected: PASS
5) Commit
   - Message: `feat: add [FEATURE_NAME] core types and deps`

---

### Task 2: Deterministic Input Hashing (for cache/invalidations)

Purpose: create a stable hash of inputs that affect outputs to drive cache keys and change detection.

Files:
- Create: `src/lib/[feature]/hash.ts`
- Test: `tests/unit/[feature]/hash.spec.ts`

Tests should cover:
- Same inputs → same hash
- Meaningful order changes → different hash
- Critical field changes → different hash

TDD Steps:
1) Write failing test → run with `pnpm vitest run tests/unit/[feature]/hash.spec.ts`
2) Implement hash function (e.g., canonicalize inputs → JSON stringify → SHA‑256)
3) Re‑run test → PASS
4) Commit

---

### Task 3: Core Utilities (dates, math, formatting, parsing)

Purpose: add deterministic helper utilities used by business logic.

Files:
- Create: `src/lib/[feature]/utils.ts` (or split modules like `dates.ts`)
- Test: `tests/unit/[feature]/utils.spec.ts`

Tests should cover normal cases, boundaries, and negative cases.

TDD Steps: failing test → implement → pass → commit.

---

### Task 4: Core Business Logic

Purpose: implement the core transformation/decision logic that produces the feature’s output given validated inputs.

Files:
- Create: `src/lib/[feature]/core.ts`
- Test: `tests/unit/[feature]/core.spec.ts`

Guidance:
- Keep pure and deterministic where possible
- No I/O in core logic (inject data via parameters)
- Validate invariants; prefer typed errors

TDD Steps: failing test → implement → pass → commit.

---

### Task 5: Persistence – Schema and Migrations (if needed)

Purpose: add/modify tables to store data and/or caches.

Files:
- Modify: `src/lib/db/schema.ts`
- Generate: `src/lib/db/migrations/*`
- Test: `tests/unit/[feature]/schema.spec.ts`

Guidance:
- Favor JSONB for cache blobs when row granularity isn’t needed
- Add indexes aligned to query patterns
- Define RLS policies and constraints (non‑negative, uniqueness, stable ordering)

Commands:
- Generate: `pnpm db:generate`
- Push: `pnpm db:push`
- Tests: `pnpm vitest run tests/unit/[feature]/schema.spec.ts`

Commit with a clear migration summary.

---

### Task 6: Data Access – Queries

Purpose: implement typed queries that join/compose data for the core logic.

Files:
- Create: `src/lib/db/queries/[feature].ts`
- Test: `tests/integration/[feature]/queries.spec.ts`

Guidance:
- Keep query functions small and composable
- Enforce auth/ownership checks at the edge or via RLS

TDD Steps: failing integration test → implement query → pass → commit.

---

### Task 7: Caching (optional but recommended)

Purpose: speed up compute‑heavy or deterministic logic with a write‑through/read‑through cache.

Files:
- Create: `src/lib/[feature]/cache.ts`
- Test: `tests/integration/[feature]/cache.spec.ts`

Guidance:
- Compute‑on‑read: compute result server‑side, store JSON in cache table, return
- Invalidate when input hash changes
- Store cache metadata (inputs hash, generatedAt, params affecting output)

TDD Steps as usual.

---

### Task 8: API Composition

Purpose: expose a server‑side function/route that composes queries, core logic, and caching.

Files:
- Create: `src/lib/api/[feature].ts` (or `src/app/api/[feature]/route.ts`)
- Test: `tests/integration/[feature]/api.spec.ts`

Guidance:
- Validate inputs (zod or typed guards)
- Enforce authz; return typed errors
- Compose: query → core → cache → return

TDD Steps: failing test → implement → pass → commit.

---

### Task 9: UI Components

Purpose: render data and interactions. Keep components small, typed, and accessible.

Files:
- Create: `src/components/[feature]/[Component].tsx`
- Test: `tests/unit/components/[feature]/[Component].spec.tsx`

Guidance:
- Separate data fetching (server) from presentation (client)
- Consider feature toggles/variants (e.g., alternate views)
- Accessibility and empty states

TDD Steps: failing test → implement → pass → commit.

---

### Task 10: Background Work (optional)

Purpose: offload long‑running or async tasks.

Files:
- Create: `src/workers/[feature].ts`
- Test: `tests/integration/[feature]/worker.spec.ts`

Guidance:
- Idempotent handlers; retries with backoff
- Persist job status; instrument duration and failures

---

### Task 11: E2E/Flow Validation

Purpose: verify end‑to‑end behavior through the public API surface.

Files:
- Create: `tests/e2e/[feature]/flow.spec.ts`

Run: `pnpm vitest run tests/e2e/[feature]/flow.spec.ts`

---

### Task 12: Documentation & Ops

Purpose: document testing, usage, and operational runbooks.

Files:
- Modify: `docs/testing/testing.md`
- Modify: additional docs as needed

Include:
- Test locations and how to run focused tests
- Any env vars or flags
- Operational notes (migrations, cache warmup, worker start)

Commit with a docs‑scoped message.

---

## Quality Gates

Before marking done, ensure:
- Tests: unit, integration, e2e pass (run focused; avoid full suite unless required)
- Types: `pnpm type-check` clean
- Lint/format: `pnpm lint` and `pnpm format` clean
- Migrations applied and reversible
- RLS/auth verified for data boundaries
- Performance within targets (cold/hot paths)
- Accessibility checks for UI

---

## Commit Guidelines

Follow `.github/instructions/commit-message.instructions.md` format. Summaries are imperative and ≤ 50 chars. Scope narrowly to files changed by the task.

Example:
```
feat: add [FEATURE_NAME] core types and hashing

Adds shared types and deterministic input hash for cache keys.

Changes:
- Create src/lib/[feature]/types.ts
- Create src/lib/[feature]/hash.ts
- Add unit tests for both

Tests cover:
- Hash determinism and change sensitivity
- Type structure and required fields
```

---

## Exit Criteria

- [ ] Feature delivers stated goal and success criteria
- [ ] All scoped tests green (unit, integration, e2e)
- [ ] Docs updated (including testing section)
- [ ] Code reviewed and approved
- [ ] Ready for deploy; rollout plan noted (flags/migrations)
