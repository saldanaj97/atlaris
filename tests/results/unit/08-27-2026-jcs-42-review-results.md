# Unit test results — JCS-42 review follow-up — 08-27-2026

- Command: `SKIP_DB_TEST_SETUP=true NODE_ENV=test pnpm exec vitest run --config vitest.config.ts --project unit tests/unit/features/billing/clerk-billing/projection.spec.ts`
- Result: passed — 1 test file, 27 tests; Vitest duration 1.08s.
- Scope: retained canceled free-trial status and cancellation propagation from matching past-due items.
