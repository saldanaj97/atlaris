# Unit and workflow-script test results — JCS-51 deployment review follow-up — 08-28-2026

- Command: `node --test .github/scripts/dependency-remediation.test.mjs .github/scripts/deployment-classifier.test.mjs` with the CircleCI spec + JUnit reporters.
- Result: passed — 33 tests; normalized JUnit XML parsed successfully.
- Command: `pnpm exec vitest run --config vitest.config.ts --project unit tests/unit/architecture/db-migration-workflows.spec.ts tests/unit/architecture/ci-pr-candidate-count.spec.ts`.
- Result: passed — 2 test files, 31 tests; Vitest duration 2.33s.
- Validation: `actionlint` passed for all changed workflows; CircleCI config validation, repository lint, TypeScript typecheck, exact Production-expand predicate fixtures, and `git diff --check` passed.
- Scope: deployment classification, credential-safe remote Preview builds, per-lane concurrency, exact-SHA CircleCI gates, exact-SHA Staging and Production expand evidence, immutable migration workflow identity, and CircleCI test-result collection.
