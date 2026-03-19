# Slice 6: Retry & Idempotency Policy Centralization (#290)

## Tasks

- [x] Create `src/shared/constants/retry-policy.ts` + `src/features/plans/retry-policy.ts` — centralized retry policy
- [x] Fix `computeShouldRetry` bug in `src/lib/db/queries/jobs.ts` (CRITICAL)
- [x] Wire retry policy into regeneration worker (logging)
- [x] Wire provider retry config from centralized policy
- [x] Create `src/features/plans/cleanup.ts` — abandoned request cleanup
- [x] Write tests for retry-policy (17 tests)
- [x] Write tests for cleanup (8 tests)
- [x] Validate (lint ✓, type-check ✓, 200 tests pass ✓)
