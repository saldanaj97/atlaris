# Progress Overview

- [x] Task 1: Define tier caps and priority topics
- [x] Task 2: Enforce free-tier cap at API validation
- [x] Task 3: Regeneration API + job + worker
- [x] Task 4: UI controls and copy
- [x] Task 5: Queue priority behavior verification
- [ ] Task 6: Stripe webhook and gates coherence check
- [x] Task 7: Developer ergonomics and scripts

---

# Task 1: Define Tier Caps and Priority Topics

- [x] Step 1: Write the failing test (caps)
- [x] Step 2: Run test to verify it fails
- [x] Step 3: Implement tier caps + helper
- [x] Step 4: Run test to verify it passes
- [x] Step 5: Commit
- [x] Step 6: Write the failing test (priority)
- [x] Step 7: Run test to verify it fails
- [x] Step 8: Implement priority helper
- [x] Step 9: Run test to verify it passes
- [x] Step 10: Commit

Notes:

- Added `checkPlanDurationCap` and exported `resolveUserTier` wrapper in `src/lib/stripe/usage.ts`.
- Introduced `PRIORITY_TOPICS`, `isPriorityTopic`, and `computeJobPriority` in `src/lib/queue/priority.ts`.
- Unit tests added under `tests/unit/stripe/usage.caps.spec.ts` and `tests/unit/queue/priority.spec.ts`.
- Fixed export of Tier type in priority.ts per CodeRabbit review.

# Task 2: Enforce Free-Tier Cap at API Validation

- [x] Step 1: Write the failing integration test
- [x] Step 2: Run test to verify it fails
- [x] Step 3: Implement server validation
- [x] Step 4: Run test to verify it passes
- [x] Step 5: Commit

Notes:

- Added integration test `tests/integration/api/plans.caps.spec.ts` to verify free-tier cap enforcement.
- Updated POST /api/v1/plans route to validate plan duration cap before plan creation.
- Added job priority computation based on user tier and priority topic status.
- Free-tier requests exceeding 2-week cap now return 403 with descriptive error message.

# Task 3: Regeneration API + Job + Worker

- [x] Step 1: Write the failing test (API)
- [x] Step 2: Run test to verify it fails
- [x] Step 3: Add job type and processing
- [x] Step 4: Implement route
- [x] Step 5: Run tests
- [ ] Step 6: Commit

Notes:

- Added `plan_regeneration` to `job_type` enum in `src/lib/db/enums.ts`; migration generated (`0010_friendly_silverclaw.sql`).
- Added `PLAN_REGENERATION` constant and `PlanRegenerationJobData` interface in `src/lib/jobs/types.ts`.
- Implemented `processPlanRegenerationJob` in `src/lib/jobs/worker-service.ts` that fetches current plan, merges with overrides, and runs generation attempt.
- Created `src/workers/plan-regenerator.ts` worker that polls for `PLAN_REGENERATION` jobs.
- Implemented `POST /api/v1/plans/[planId]/regenerate` route that validates ownership, parses overrides, computes priority, and enqueues job.
- Created integration test `tests/integration/api/plans.regenerate.spec.ts` with 3 test cases (all passing).
- Added `ensureJobTypeEnumValue()` helper in test setup to ensure enum value exists in test database.

# Task 4: UI Controls and Copy

- [x] Step 1: Write the failing e2e test outline
- [x] Step 2: Implement components
- [x] Step 3: Verify locally (manual)
- [x] Step 4: Commit

Notes:

- Created `RegenerateButton` component in `src/components/plans/RegenerateButton.tsx` that POSTs to regeneration API and shows loading state.
- Wired `RegenerateButton` into `PlanDetails` component after export controls.
- Added free-tier cap prompt in `OnboardingForm` step 5 that fetches user tier on mount and shows upgrade message when deadline exceeds 2 weeks.
- Updated pricing page copy for Starter/Pro tiers to include "Priority topics and faster queue".
- Added e2e test file `tests/e2e/regeneration.ui.spec.tsx` with tests for free-tier cap prompt and regenerate button functionality.

# Task 5: Queue Priority Behavior Verification

- [x] Step 1: Extend existing test to prove priority > FIFO
- [x] Step 2: Run tests
- [x] Step 3: Commit

Notes:

- Added test case 'picks paid+priority before free' to verify queue priority behavior.
- Test enqueues free user job with non-priority topic first, then paid (pro) user job
  with priority topic second, and verifies paid job is selected first.
- All 8 tests in queue.test.ts passing (including new test).

# Task 6: Stripe Webhook and Gates Coherence Check

- [ ] Step 1: Fetch docs with Context7 MCP (Stripe webhooks)
- [ ] Step 2: Ensure subscription tier updates flow to UI usage summary
- [ ] Step 3: Commit (if changes)

# Task 7: Developer Ergonomics and Scripts

- [x] Step 1: Add worker script
- [ ] Step 2: Commit

Notes:

- Added `dev:regenerator` script: `tsx watch src/workers/plan-regenerator.ts`.
- Updated `dev:all` script to include `pnpm dev:regenerator` alongside existing services.
