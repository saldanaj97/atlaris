# Common Commands Reference

Quick reference for all common development commands.

## Development Server

> **Note**: Do not auto-run these commands; listed for reference only.

```bash
pnpm dev              # Next.js dev server (Turbopack enabled)
pnpm dev:stripe       # Stripe webhook listener for local testing
```

## Build & Production

```bash
pnpm build            # Build for production (Turbopack enabled)
pnpm start            # Start production server
```

## Code Quality

### Linting & Formatting

```bash
pnpm lint             # Run ESLint (type-aware, flat config)
pnpm lint:fix         # Auto-fix lint issues
pnpm format           # Run Prettier (Tailwind class sorting enabled)
pnpm type-check       # TypeScript type checking only
```

## Database (Drizzle)

```bash
pnpm db:generate      # Generate migrations from schema changes
pnpm db:migrate       # Apply migrations to database
pnpm db:push          # Push schema directly to database
```

## Testing

See [docs/testing/test-standards.md](../testing/test-standards.md) for comprehensive testing documentation.

### Quick Reference

```bash
pnpm test                # Run unit tests
pnpm test:changed        # Run unit tests for changed files only
pnpm test:watch          # Run unit tests in watch mode
pnpm test:integration    # Run integration tests for changed files
pnpm test:all            # Run full test suite (unit + integration)
```

### Direct Script Usage

The test scripts can also be invoked directly with additional options:

```bash
./scripts/test-unit.sh              # Run all unit tests
./scripts/test-unit.sh --changed    # Run tests for changed files
./scripts/test-unit.sh --watch      # Watch mode
./scripts/test-integration.sh       # Run integration tests
./scripts/full-test-suite.sh        # Full test suite
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
