# Unit and workflow-script test results — JCS-51 deployment review follow-up — 08-28-2026

- Command: `node --test .github/scripts/dependency-remediation.test.mjs .github/scripts/deployment-classifier.test.mjs` with the CircleCI spec + JUnit reporters.
- Result: passed — 34 tests; normalized JUnit XML parsed successfully.
- Command: `pnpm exec vitest run --config vitest.config.ts --project unit tests/unit/architecture/db-migration-workflows.spec.ts tests/unit/architecture/ci-pr-candidate-count.spec.ts`.
- Result: passed — 2 test files, 31 tests; Vitest duration 1.13s.
- Validation: `actionlint` passed for all changed workflows; CircleCI config validation, repository lint, TypeScript typecheck, covering/stale Production-expand fixtures, large-output pipefail reproduction, paginated GitHub response shape, live Vercel inspection shape, and `git diff --check` passed.
- Scope: deployment classification, deploy-aware automatic Staging eligibility, credential-safe remote Preview builds, non-persisted checkout credentials, step-scoped Vercel and Supabase credentials, least-privilege deployment-job permissions, honest checkout-SHA inspection evidence, per-lane concurrency, outer timeout budgets, exact-SHA CircleCI gates, exact-SHA Staging evidence, cumulative Production expand coverage, immutable migration workflow identity, and CircleCI test-result collection.
