# Common Commands Reference

Quick reference for all common development commands.

See [deploy.md](./deploy.md) for rollout notes that need ordered app-vs-migration deploys.

## Package manager

- CI pins **pnpm 11.9.0** (see `.circleci/config.yml`).
- Supply-chain release-age policy (`minimumReleaseAge`) is configured in `pnpm-workspace.yaml`; see [supply-chain policy](../security/supply-chain-policy.md).

## Development Server

> **Note**: Do not auto-run these commands; listed for reference only.

```bash
pnpm dev              # Portless + Next.js Webpack + Workflow SDK
pnpm dev --ui         # Portless + Turbopack UI-only (no Workflow SDK callbacks)
pnpm dev --db         # Start/ensure Supabase, then run the normal pnpm dev path
pnpm dev doctor       # Read-only local toolchain, Portless, and 1Password diagnostics
pnpm deploy:preview   # Deploy the current worktree to Vercel's Preview environment
```

`pnpm install` does not install Portless or 1Password. Before the first
`pnpm dev`, install Portless globally
([portless-overview.md](../third-party-services/portless-overview.md#install))
and run `scripts/dev/install-local-op.sh` so `OP_EXECUTABLE` points at the
keychain-backed wrapper and `OP_ENVIRONMENT_ID` lives in
`~/.config/atlaris/dev.sh`. Setup:
[1password-local-dev.md](../third-party-services/1password-local-dev.md).
`pnpm dev doctor` checks those prerequisites. `PORTLESS=0` is rejected by the
launcher.

`pnpm dev` is the canonical local development path and always uses Portless. The
default URL is `https://atlaris.localhost`; linked worktrees receive Portless's
worktree-prefixed hostname.

### Local product testing + billing fixtures

Requires fixture-mode env (`LOCAL_PRODUCT_TESTING=true` + seeded `DEV_AUTH_USER_ID`). See [environment.md](./environment.md#clerk-development-checkout-fixture-vs-real-payment-flow) and [clerk-billing-architecture.md](../architecture/clerk-billing-architecture.md).

```bash
pnpm db fixture starter  # intentionally set the local starter fixture
pnpm db fixture pro      # intentionally set the local pro fixture
pnpm db fixture --user-id <users.auth_user_id> --plan pro
# optional: --status active|past_due|canceled|ended  --period-end <iso>
pnpm dev                 # start the app through Portless after fixture setup
```

Starting the app does not reset, seed, or mutate billing fixtures. Use the DB
commands explicitly when local product-testing state needs to change.

Use `pnpm deploy:preview` to test Workflow SDK feature flags against Vercel's hosted Preview environment. It requires the Vercel CLI to be installed and the checkout to be linked to the intended project.

### Post-push Production rehearsal

Do not use `pnpm deploy:preview` for Production. To run a post-push, unaliased rehearsal from a clean `main` checkout after the exact SHA exists on `origin/main`, follow [staged-production-deployment.md](../ci-cd/staged-production-deployment.md):

```bash
# After the exact SHA exists on origin/main and documented preflight on a clean main checkout:
vercel --prod --skip-domain
```

Do not promote the rehearsal or treat it as a traffic gate. Only JCS-52's native Vercel Deployment Check enforced by Deployment Protection can gate live alias assignment.

## Build & Production

```bash
pnpm build            # Build for production (Turbopack enabled)
pnpm start            # Start production server
```

## Code Quality

### Linting & Formatting

```bash
pnpm lint               # Oxlint: lint source, scripts, Supabase, and tests
pnpm lint --format=github # Oxlint with GitHub annotations for CI
pnpm typecheck          # TypeScript type checking only
pnpm check               # Lint and typecheck in parallel
```

Local Git hooks run through Husky in `.husky/`. **Pre-commit** runs `lint-staged`: Oxlint with `--fix` plus oxfmt on **staged** files only, then `ggshield` when installed. **Post-merge** prunes `origin` and deletes safe, fully merged local branches after `develop` is updated. For repo-wide formatting without staging everything, run oxfmt explicitly, for example `pnpm exec oxfmt --no-error-on-unmatched-pattern .`. For repo-wide Oxlint fixes, run `pnpm exec oxlint src tests scripts supabase --fix --max-warnings=0`.

## Database (Supabase migrations)

```bash
supabase migration new <name> # Create a new SQL migration file
supabase db diff -f <name>    # Generate a migration from local DB changes
supabase db reset             # Recreate local Supabase DB from migrations + seed.sql
```

Migration authoring and deployment use the committed Supabase migration chain. `pnpm db migrate` uses Drizzle Kit for local and test migration application; CI database setup also applies migrations rather than using a schema-push shortcut.

### Local dev database (Supabase local)

See [local-database.md](./local-database.md) for ports, env vars, and local vs hosted Supabase.

```bash
pnpm db start          # Start Supabase local stack
pnpm db stop           # Stop Supabase local stack
pnpm db reset          # Recreate local Supabase DB from migrations + seed.sql
pnpm db seed           # Re-seed the deterministic local product-testing user
pnpm db migrate        # Apply Drizzle migrations to the configured test/runtime DB
pnpm db fixture starter # Set the local starter billing fixture
pnpm db fixture pro     # Set the local pro billing fixture
pnpm db reconcile-clerk # Reconcile Clerk users against the local DB
```

### Cursor Cloud Agent database

These commands operate only on the fixed, task-local PostgreSQL 17 target documented in [local-database.md](./local-database.md). They reject hosted credentials and arbitrary database URLs.

```bash
pnpm db agent preflight # Read-only runtime and safety checks
pnpm db agent up        # Idempotent start, migrate, grant, seed, and verify
pnpm db agent status    # Read-only database status
pnpm db agent reset     # Recreate only the managed agent database
```

## Testing

See [docs/testing/test-standards.md](../testing/test-standards.md) for comprehensive testing documentation.

### Quick Reference

```bash
pnpm test                     # Run changed unit + integration-class tests
pnpm test unit                # Run all unit tests
pnpm test unit --changed      # Run unit tests for changed files only
SKIP_DB_TEST_SETUP=true NODE_ENV=test pnpm vitest --config vitest.config.ts --project unit tests/unit  # Unit watch mode
pnpm test integration --changed # Run changed integration + Workflow SDK tests
pnpm test integration         # Run the full DB/API integration suite (heavier; use sparingly)
pnpm test workflow            # Run Workflow SDK wiring + production entrypoints (Testcontainers)
pnpm test security            # Run RLS policy tests
pnpm test smoke               # Run Playwright smoke coverage
pnpm test e2e                 # Run the E2E Vitest project
pnpm test all                 # Run lint, typecheck, unit, integration, workflow, and security suites
pnpm test all --e2e           # Full suite plus E2E tests
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
- With `LOCAL_PRODUCT_TESTING=true`, `supabase db reset` seeds the canonical user from `supabase/seed.sql`; use `pnpm db seed` if you need to re-run only the seed. See [environment.md](./environment.md) and [local-database.md](./local-database.md).
