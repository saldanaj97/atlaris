# Common Commands Reference

Quick reference for all common development commands.

See [deploy.md](./deploy.md) for rollout notes that need ordered app-vs-migration deploys.

## Development Server

> **Note**: Do not auto-run these commands; listed for reference only.

```bash
pnpm dev              # Next.js dev server (Turbopack enabled)
pnpm dev:full         # Start local dev Postgres, then run the Next.js dev server
```

## Build & Production

```bash
pnpm build            # Build for production (Turbopack enabled)
pnpm start            # Start production server
```

## Code Quality

### Linting & Formatting

```bash
pnpm check:full         # Lint + TypeScript checks in parallel (check:lint + check:type)
pnpm check:lint         # Oxlint: lint source, script, and test code
pnpm check:lint:ci      # Oxlint with GitHub annotations for Actions
pnpm check:type         # TypeScript type checking only
```

Local Git hooks run through Husky in `.husky/`. **Pre-commit** runs `lint-staged`: Oxlint with `--fix` plus Prettier on **staged** files only, then `ggshield` when installed. For repo-wide formatting without staging everything, run Prettier explicitly, for example `pnpm exec prettier . --write --ignore-unknown`. For repo-wide Oxlint fixes, run `pnpm exec oxlint src tests scripts --fix --max-warnings=0`.

## Database (Drizzle)

```bash
pnpm db:generate      # Generate migrations from schema changes
pnpm db:migrate       # Apply migrations to database
pnpm db:push          # Push schema directly to database
```

### Local dev database (native Postgres)

See [local-database.md](./local-database.md) for ports, env vars, and Neon vs local.

```bash
pnpm db:dev:start     # Start/check local PostgreSQL 17 (atlaris_dev on localhost:54331)
pnpm db:dev:stop      # Stop local PostgreSQL service
pnpm db:dev:reset     # Drop and recreate atlaris_dev
pnpm db:dev:bootstrap # Extensions, roles, migrations, RLS grants (localhost only)
```

## Testing

See [docs/testing/test-standards.md](../testing/test-standards.md) for comprehensive testing documentation.

### Quick Reference

```bash
pnpm test                     # Run changed unit + integration tests
pnpm test:changed             # Explicit alias for the changed unit + integration bundle
pnpm test:unit                # Run all unit tests
pnpm test:unit:changed        # Run unit tests for changed files only
pnpm exec tsx scripts/tests/run.ts unit --watch # Unit tests watch mode (no dedicated package.json alias)
pnpm test:integration:changed # Run integration tests for changed files
pnpm test:integration         # Run the full integration suite (heavier; use sparingly)
pnpm test:security            # Run RLS policy tests
pnpm test:smoke               # Run Playwright smoke coverage
pnpm test:all                 # Run lint, typecheck, unit, integration, and security suites
```

### Direct Script Usage

The unified test runner can also be invoked directly with additional options:

```bash
pnpm exec tsx scripts/tests/run.ts changed                                # Changed unit + integration bundle
pnpm exec tsx scripts/tests/run.ts unit                                   # Run all unit tests
pnpm exec tsx scripts/tests/run.ts unit --changed                         # Run tests for changed files
pnpm exec tsx scripts/tests/run.ts unit --watch                           # Watch mode
pnpm exec tsx scripts/tests/run.ts integration tests/integration/path/to/file.spec.ts  # Targeted integration file
pnpm exec tsx scripts/tests/run.ts all --with-e2e                         # Full suite (+ optional E2E)
```

## Local API Testing Guidance

- Prefer testing authenticated flows through the application UI so Neon Auth session cookies are established naturally.
- For targeted backend verification, prefer unit or integration tests over ad-hoc curl scripts.
- If you use local auth overrides such as `DEV_AUTH_USER_ID`, make sure the referenced user already exists in the database before invoking authenticated routes.
- With `LOCAL_PRODUCT_TESTING=true`, you can seed the canonical user via `pnpm db:dev:bootstrap` and exercise local-safe billing and AI flows without using hosted providers. See [environment.md](./environment.md) and [local-database.md](./local-database.md).
