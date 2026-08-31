# Unit and workflow-script test results — JCS-51 PR #550 final local audit — 08-31-2026

Uncommitted local evidence only. Hosted GitHub Actions and Vercel behavior remain unverified until an authorized push. No JUnit artifacts or hosted results are recorded.

- Command: `node --test .github/scripts/dependency-remediation.test.mjs .github/scripts/deployment-classifier.test.mjs`
- Result: passed — 42 tests, 42 pass, 0 fail, 0 skipped; duration_ms 1192.814791.
- Command: `SKIP_DB_TEST_SETUP=true NODE_ENV=test pnpm exec vitest run --config vitest.config.ts --project unit tests/unit/architecture/db-migration-workflows.spec.ts tests/unit/architecture/ci-pr-candidate-count.spec.ts tests/unit/db/email-notification-delivery-runs.spec.ts`
- Result: passed — 3 test files, 53 tests; 0 fail; Vitest duration 5.43s.
- Validation: uncommitted local evidence only — `pnpm check:lint` exit 0 (oxlint, no diagnostics); `pnpm check:type` exit 0 (`tsc --noEmit`, no diagnostics); `actionlint` exit 0 on `.github/workflows/vercel-deploy.yml`, `.github/workflows/production-db-migrations.yaml`, and `.github/workflows/staging-db-migrations.yaml`; `circleci config validate` valid for `.circleci/config.yml` and `.circleci/code-config.yml`; `git diff --check` exit 0.
- Scope: local contracts for deployment classification, CircleCI PR-candidate counting and continuation, phased migration workflows, and email-notification delivery-run advancement against the uncommitted PR #550 working tree. Hosted Actions/Vercel behavior is out of scope until an authorized push.
