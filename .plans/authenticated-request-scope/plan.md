# Plan: Authenticated Request Scope Deepening

> **Status:** COMPLETED. This planning-phase plan has been fully executed. The implementation-ready plan is at [implementation-plan.md](./implementation-plan.md). The analysis and resolved decisions are in [analysis.md](./analysis.md).

## Goal

Produce an execution-grade planning package for refactoring authenticated request scope so callers no longer need tribal knowledge about wrapper selection, request-context setup, RLS client availability, or runtime-specific `getDb()` behavior.

## Step 1.0 — Confirm the corrected problem surface and acceptance criteria

- Re-read the current auth, request-context, runtime, and RLS implementations against the updated research artifact.
- Confirm the verified caller counts and classifications for the active wrappers, the redirect-only escape hatch, internal-only helpers, and dead code.
- Confirm the acceptance criteria in `todos.md` match the real problem surface.
- Output: a corrected `research.md` and `todos.md` that future design work can trust.

## Step 1.1 — Produce the lifecycle-and-surface matrix

- Map the authenticated-request-scope lifecycle end-to-end:
  - auth identity resolution
  - user-record provisioning
  - RLS client creation
  - request-context installation
  - `getDb()` access and cleanup
- Inventory each relevant export and its verified caller count.
- Group call sites by usage pattern:
  - API routes
  - server actions
  - server components
  - redirect-only identity checks
  - ambient `getDb()` consumers
- Output: a written lifecycle-and-surface matrix in the planning artifacts.

## Step 1.2 — Produce the ambiguity-and-contradiction analysis

- Identify each place where the interface still depends on tribal knowledge.
- Capture contradictions between code, docs, durable learnings, and tests.
- Include concrete examples of:
  - wrapper choice changing runtime behavior
  - `authUserId` vs `user.id` boundary confusion
  - ambient `getDb()` legality depending on hidden request context
  - tests encoding primitive choice because the wrong primitive was historically dangerous
- Output: a contradiction list with file references and why each seam matters.

## Step 1.3 — Decide the exported surface and migration boundaries

- Decide what happens to exported dead code such as `getCurrentUserRecordSafe()`.
- Confirm which direct helper calls remain valid escape hatches, including `getEffectiveAuthUserId()` for redirect-only checks.
- Separate the authenticated-request-scope design from orthogonal composition helpers such as `withErrorBoundary()`.
- Output: a documented target surface that distinguishes core boundary APIs from co-located utilities.

## Step 1.4 — Decide the `getDb()` and test-runtime contract

- Audit the 43 `getDb()` call sites and classify how they currently rely on ambient request context or test-mode fallback.
- Compare the current `isTest` behavior in `withAuth()`, `withServerComponentContext()`, and `getDb()`.
- Decide whether the future contract keeps ambient `getDb()`, narrows it, or makes DB access explicit.
- Output: a migration-boundary note that estimates blast radius and records the target runtime/test contract.

## Step 1.5 — Resolve the architectural decision tree

- Compare the real branches that remain after the corrected research:
  - one deeper boundary vs multiple specialized boundaries
  - callback wrappers vs an explicit authenticated-session object
  - keep route/action/component-specific adapters vs collapse behind one core abstraction
  - preserve or reduce ambient `getDb()`
- Evaluate each branch against:
  - security and RLS correctness
  - misuse resistance
  - migration cost
  - testability
  - compatibility with stream or long-lived request flows
- Ask the user only the questions the codebase cannot answer.
- Output: a resolved decision tree with rationale.

## Step 1.6 — Draft the implementation-ready plan

- Convert the resolved direction into a concrete implementation plan.
- Define:
  - migration order
  - touched-file categories
  - expected test changes
  - documentation updates
  - validation commands
- Ensure the output is a plan that can guide implementation without another open-ended research phase.
- Output: the next implementation-ready plan or RFC artifact.

## Validation Steps

- Verify every claim against current code references, not memory.
- Verify the lifecycle-and-surface matrix matches the real caller counts.
- Verify every ambiguity item names the concrete file references and misuse mode.
- Verify the exported-surface decision accounts for dead code, valid escape hatches, and orthogonal helpers.
- Verify the `getDb()` decision includes blast-radius analysis and a test-runtime story.
- Verify the final recommendation resolves each decision-tree branch with explicit rationale.
- Verify the resulting implementation-ready plan includes concrete migration order and validation commands rather than “research more.”

## Issue Verification and Closure

- Walk through each acceptance criterion in `todos.md` and confirm the artifact or note that satisfies it.
- Confirm the plan defines:
  - target abstraction boundaries
  - migration sequence
  - expected test changes
  - documentation updates
  - validation commands
- If the design is accepted, move directly into the implementation-ready planning or RFC phase instead of restarting discovery.
