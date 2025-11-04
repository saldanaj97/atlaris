# Progress Overview

- [x] Task 1: Define tier caps and priority topics
- [x] Task 2: Enforce free-tier cap at API validation
- [ ] Task 3: Regeneration API + job + worker
- [ ] Task 4: UI controls and copy
- [ ] Task 5: Queue priority behavior verification
- [ ] Task 6: Stripe webhook and gates coherence check
- [ ] Task 7: Developer ergonomics and scripts

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

- [ ] Step 1: Write the failing test (API)
- [ ] Step 2: Run test to verify it fails
- [ ] Step 3: Add job type and processing
- [ ] Step 4: Implement route
- [ ] Step 5: Run tests
- [ ] Step 6: Commit

# Task 4: UI Controls and Copy

- [ ] Step 1: Write the failing e2e test outline
- [ ] Step 2: Implement components
- [ ] Step 3: Verify locally (manual)
- [ ] Step 4: Commit

# Task 5: Queue Priority Behavior Verification

- [ ] Step 1: Extend existing test to prove priority > FIFO
- [ ] Step 2: Run tests
- [ ] Step 3: Commit

# Task 6: Stripe Webhook and Gates Coherence Check

- [ ] Step 1: Fetch docs with Context7 MCP (Stripe webhooks)
- [ ] Step 2: Ensure subscription tier updates flow to UI usage summary
- [ ] Step 3: Commit (if changes)

# Task 7: Developer Ergonomics and Scripts

- [ ] Step 1: Add worker script
- [ ] Step 2: Commit
