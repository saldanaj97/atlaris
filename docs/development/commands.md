# Common Commands Reference

Quick reference for all common development commands.

See [deploy.md](./deploy.md) for rollout notes that need ordered app-vs-migration deploys.

## Package manager

- CI pins **pnpm 9** (see `.github/workflows/ci-pr.yml`).
- Supply-chain release-age policy (`minimumReleaseAge`) is **deferred** until a pnpm 10.16+ upgrade — see [supply-chain policy](../security/supply-chain-policy.md).

## Development Server

> **Note**: Do not auto-run these commands; listed for reference only.

```bash
pnpm dev              # Next.js dev server (Turbopack enabled)
pnpm dev:workflow     # Webpack dev server — use when testing Workflow SDK flags locally
pnpm dev:full         # Start Supabase local stack, then run the Next.js dev server
```

When any workflow feature flag is enabled, prefer `pnpm dev:workflow` over `pnpm dev`; see [environment variables](./environment.md#workflow-sdk) and [Workflow SDK local development](../architecture/workflow-sdk.md#local-development).

## Build & Production

```bash
pnpm build            # Build for production (Turbopack enabled)
pnpm start            # Start production server
```

## Code Quality

### Linting & Formatting

```bash
pnpm check:full         # Lint + TypeScript checks in parallel (check:lint + check:type)
pnpm check:lint         # Oxlint: lint source, script, Supabase, and test code
pnpm check:lint:ci      # Oxlint with GitHub annotations for Actions
pnpm check:type         # TypeScript type checking only
```

Local Git hooks run through Husky in `.husky/`. **Pre-commit** runs `lint-staged`: Oxlint with `--fix` plus oxfmt on **staged** files only, then `ggshield` when installed. For repo-wide formatting without staging everything, run oxfmt explicitly, for example `pnpm exec oxfmt --no-error-on-unmatched-pattern .`. For repo-wide Oxlint fixes, run `pnpm exec oxlint src tests scripts supabase --fix --max-warnings=0`.

## Database (Supabase migrations)

```bash
supabase migration new <name> # Create a new SQL migration file
supabase db diff -f <name>    # Generate a migration from local DB changes
supabase db reset             # Recreate local Supabase DB from migrations + seed.sql
```

Migration authoring uses the Supabase CLI. Package scripts still use Drizzle Kit for local/test migration application and CI schema push where documented below.

### Local dev database (Supabase local)

See [local-database.md](./local-database.md) for ports, env vars, and local vs hosted Supabase.

```bash
pnpm db:dev:start     # Start Supabase local stack
pnpm db:dev:stop      # Stop Supabase local stack
pnpm db:dev:reset     # Recreate local Supabase DB from migrations + seed.sql
pnpm db:dev:seed      # Re-seed the deterministic local product-testing user
```

## Testing

See [docs/testing/test-standards.md](../testing/test-standards.md) for comprehensive testing documentation.

### Quick Reference

```bash
pnpm test                     # Run changed unit + integration-class tests
pnpm test:unit                # Run all unit tests
pnpm test:unit:changed        # Run unit tests for changed files only
SKIP_DB_TEST_SETUP=true NODE_ENV=test pnpm vitest --config vitest.config.ts --project unit tests/unit  # Unit watch mode
pnpm test:integration:changed # Run changed integration + Workflow SDK tests
pnpm test:integration         # Run the full DB/API integration suite (heavier; use sparingly)
pnpm test:workflow            # Run Workflow SDK wiring + production entrypoints (Testcontainers)
pnpm test:security            # Run RLS policy tests
pnpm test:smoke               # Run Playwright smoke coverage
pnpm test:all                 # Run lint, typecheck, unit, integration, workflow, and security suites
pnpm test:all:e2e             # Full suite plus E2E tests
```

Workflow SDK test layout and env flags: [Workflow SDK](../architecture/workflow-sdk.md#testing) · [tests/AGENTS.md](../../tests/AGENTS.md#workflow-sdk-tests).

### Targeted Vitest commands

Use native Vitest arguments for single-file or watch runs:

```bash
SKIP_DB_TEST_SETUP=true NODE_ENV=test pnpm vitest run --config vitest.config.ts --project unit tests/unit/path/to/file.spec.ts
SKIP_DB_TEST_SETUP=true NODE_ENV=test pnpm vitest --config vitest.config.ts --project unit tests/unit  # watch
NODE_ENV=test pnpm vitest run --config vitest.config.ts --project integration tests/integration/path/to/file.spec.ts
NODE_ENV=test pnpm vitest run --config vitest.workflow.config.ts tests/workflow/path/to/file.workflow.spec.ts
```

## Local API Testing Guidance

- Prefer local product-testing auth for broad authenticated smoke flows. Use Clerk's `@clerk/testing` helper with `emailAddress` only for the focused `smoke-clerk` parity project when `CLERK_SECRET_KEY` is available.
- For targeted backend verification, prefer unit or integration tests over ad-hoc curl scripts.
- If you use local auth overrides such as `DEV_AUTH_USER_ID`, make sure the referenced user already exists in the database before invoking authenticated routes.
- With `LOCAL_PRODUCT_TESTING=true`, `supabase db reset` seeds the canonical user from `supabase/seed.sql`; use `pnpm db:dev:seed` if you need to re-run only the seed. See [environment.md](./environment.md) and [local-database.md](./local-database.md).
