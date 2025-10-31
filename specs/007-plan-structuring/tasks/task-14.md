# Phase 14: Update Testing Documentation

**Files:**

- Modify: `docs/testing/testing.md`

## Step 1: Add scheduling test section

Modify `docs/testing/testing.md` - add new section:

````markdown
## Scheduling Tests

### Unit Tests

Located in `tests/unit/scheduling/`:

- **types.spec.ts** - Schedule type definitions
- **hash.spec.ts** - Inputs hash computation for cache validation
- **dates.spec.ts** - Date utility functions (add days, weeks, boundaries)
- **distribute.spec.ts** - Session distribution logic
- **generate.spec.ts** - Deterministic schedule generation
- **validate.spec.ts** - Schedule and resource validation
- **schema.spec.ts** - Database schema validation

### Integration Tests

Located in `tests/integration/scheduling/`:

- **queries.spec.ts** - Schedule cache database queries
- **api.spec.ts** - getPlanSchedule API composition with caching
- **end-to-end.spec.ts** - Full schedule generation flow with real DB

### E2E Tests

Located in `tests/e2e/`:

- **plan-schedule-view.spec.ts** - UI toggle between modules/schedule views

### Running Scheduling Tests

```bash
# All scheduling unit tests
pnpm vitest run tests/unit/scheduling

# All scheduling integration tests
pnpm vitest run tests/integration/scheduling

# Specific test file
pnpm vitest run tests/unit/scheduling/hash.spec.ts
```
````

````

## Step 2: Commit

```bash
git add docs/testing/testing.md
git commit -m "docs: add scheduling tests documentation"
````
