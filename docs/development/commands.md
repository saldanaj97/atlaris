# Common Commands Reference

Quick reference for all common development commands.

## Development Server

> **Note**: Do not auto-run these commands; listed for reference only.

```bash
pnpm dev              # Next.js dev server
pnpm dev:stripe       # Stripe webhook listener for local testing
```

## Build & Production

```bash
pnpm build            # Build for production
pnpm start            # Start production server
```

## Local CI Simulation

These commands mirror GitHub Actions workflows:

```bash
pnpm local-ci:pr      # PR CI: lint, type-check, build, unit tests (sharded), integration tests (light)
pnpm local-ci:main    # Main branch CI: full suite including e2e tests
```

## Code Quality

### Linting & Formatting

```bash
pnpm lint             # Run ESLint (type-aware, flat config)
pnpm lint:fix         # Auto-fix lint issues
pnpm format           # Run Prettier (Tailwind class sorting enabled)
pnpm type-check       # TypeScript type checking only
```

### Quality Checks (Warnings Only)

```bash
pnpm check:duplication   # Detect copy-pasted code (threshold: 5%)
pnpm check:complexity    # Check file sizes >500 LOC
pnpm check:quality       # Run both duplication and complexity checks
```

## Database (Drizzle)

### Migrations

```bash
pnpm db:generate         # Generate migrations from schema changes
pnpm db:migrate          # Apply migrations to main DB
pnpm db:migrate:test-db  # Apply migrations to test DB
pnpm db:push             # Push schema directly to main DB
pnpm db:push:test-db     # Push schema directly to test DB
```

### Seeding

```bash
pnpm seed                # Seed database (development mode)
pnpm seed:custom         # Custom seed
pnpm seed:reset          # Reset database
pnpm seed:refresh        # Full refresh (reset + seed)
```

## Testing

See [docs/testing/testing.md](../testing/testing.md) for comprehensive testing documentation.

### Quick Reference

```bash
pnpm test                    # All tests
pnpm test:unit:full          # All unit tests with DB setup
pnpm test:unit:fast          # Unit tests (skip DB setup)
pnpm test:unit:related       # Unit tests for changed files
pnpm test:integration:full   # All integration tests
pnpm test:integration:related # Integration tests for changed files
pnpm test:e2e:full           # All e2e tests
pnpm test:e2e:related        # E2E tests for changed files
pnpm test:rls:full           # Row Level Security tests
pnpm test:rls:related        # RLS tests for changed files
pnpm test:suite:full         # Full test suite (without e2e)
pnpm test:suite:all          # Complete suite (including e2e)
pnpm test:watch              # Watch mode
```

## Manual API Testing

For rapid iteration on plan generation without the UI:

```bash
pnpm test-plan-generation                                    # Stream generate with defaults
./scripts/test-plan-generation.sh stream --topic "Topic"     # Custom topic
./scripts/test-plan-generation.sh list                       # List all plans
./scripts/test-plan-generation.sh status --plan-id UUID      # Check generation status
./scripts/test-plan-generation.sh --help                     # All options
```

### Setup Requirements

1. Create a JWT template in Clerk Dashboard (name: `testing`, lifetime: 3600s)
2. Get token from browser console: `await window.Clerk.session.getToken({ template: 'testing' });`
3. Add to `.env.local`: `CLERK_SESSION_TOKEN=eyJhbGciOi...`

### Available Options

| Option      | Values                                  | Default                         |
| ----------- | --------------------------------------- | ------------------------------- |
| `--topic`   | Any string (3-200 chars)                | "Learn TypeScript fundamentals" |
| `--skill`   | `beginner`, `intermediate`, `advanced`  | `beginner`                      |
| `--hours`   | 0-80                                    | 10                              |
| `--style`   | `reading`, `video`, `practice`, `mixed` | `mixed`                         |
| `--notes`   | Any string (max 2000 chars)             | none                            |
| `--plan-id` | UUID (required for `status` command)    | none                            |
