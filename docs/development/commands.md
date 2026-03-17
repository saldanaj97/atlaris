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
pnpm test:all            # Run full suite (rare; avoid unless explicitly needed)
```

### Direct Script Usage

The test scripts can also be invoked directly with additional options:

```bash
./scripts/test-unit.sh              # Run all unit tests
./scripts/test-unit.sh --changed    # Run tests for changed files
./scripts/test-unit.sh --watch      # Watch mode
./scripts/test-integration.sh tests/integration/path/to/file.spec.ts  # Targeted integration file
./scripts/full-test-suite.sh        # Full test suite
```

## Local API Testing Guidance

- Prefer testing authenticated flows through the application UI so Neon Auth session cookies are established naturally.
- For targeted backend verification, prefer unit or integration tests over ad-hoc curl scripts.
- If you use local auth overrides such as `DEV_AUTH_USER_ID`, make sure the referenced user already exists in the database before invoking authenticated routes.
