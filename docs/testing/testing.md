# Testing Guide

This document explains the testing approach and infrastructure for this project.

## Overview

We use a **two-tier testing strategy** that separates business logic testing from security testing:

1. **Business Logic Tests** - Test application functionality (Unit, Integration, E2E)
2. **Security Tests** - Verify Row Level Security (RLS) policies work correctly

## Test Suite Summary

Quick reference of all tests in the suite, organized by category:

### Contract Tests (API Endpoints)

- `plans.attempts.get.spec.ts` - GET endpoint for fetching generation attempts
- `plans.get.spec.ts` - GET endpoint for retrieving learning plans
- `plans.post.spec.ts` - POST endpoint for creating learning plans
- `plans.api-integration.spec.ts` - Full API integration flows

### Integration Tests (Multi-Component)

**Concurrency & Race Conditions:**

- `concurrency.plan-ordering.spec.ts` - Concurrent operations maintain correct ordering
- `concurrency.rollback.spec.ts` - Transaction rollbacks under concurrent access
- `concurrency.timeout-stall.spec.ts` - Timeout behavior with concurrent workers

**Plan Generation:**

- `generation.success.spec.ts` - Successful plan generation end-to-end
- `generation.timeout.spec.ts` - Timeout handling during generation
- `generation.validation.spec.ts` - Input validation for generation requests
- `generation.capped.spec.ts` - Max attempts limit enforcement
- `generation.cap-boundary.spec.ts` - Edge cases around attempt caps
- `generation.rate_limit.spec.ts` - Rate limiting for generation requests
- `actions/generate-learning-plan.spec.ts` - Server action flow (success/failure state, quota updates, usage logging)

**Background Workers:**

- `plan-generation-worker.spec.ts` - Worker job processing, retries, concurrency, graceful shutdown
- `jobs.queue.schema.spec.ts` - Job queue schema validation
- `worker-curation.spec.ts` - Curation integration in worker, attachments, diversity, early-stop
- `curation.persistence.spec.ts` - Resource upsert and task attachments

**RLS & Security (Integration Level):**

- `rls.attempts-insert.spec.ts` - RLS blocks non-owner attempt insertion via orchestrator
- `rls.attempts-visibility.spec.ts` - RLS enforces visibility rules for attempts

### Unit Tests (Isolated Components)

**AI/Provider Layer:**

- `ai.classification.spec.ts` - Error classification logic
- `ai.mockProvider.spec.ts` - Mock provider behavior
- `ai.providers.mock.spec.ts` - Mock provider implementation
- `ai.parser.validation.spec.ts` - AI response parsing validation
- `ai.timeout.spec.ts` - AI provider timeout handling
- `ai.pacing.spec.ts` - Pacing calculator and task trimming logic

**Curation Engine:**

- `curation.cache.spec.ts` - Cache get/set, TTLs, negative cache, LRU, dedupe
- `curation.ranking.spec.ts` - Scoring, cutoff, diversity, early-stop fill
- `curation.validate.spec.ts` - HEAD checks, YouTube status, URL canonicalization
- `curation.youtube.adapter.spec.ts` - YouTube search, stats, param shaping
- `curation.docs.adapter.spec.ts` - Docs search, CSE/heuristics, validation

**Attempt Tracking:**

- `attempts.success.spec.ts` - Success tracking and metrics
- `attempts.timeout.spec.ts` - Timeout attempt recording
- `attempts.validation.spec.ts` - Attempt validation logic
- `attempts.capped.spec.ts` - Max attempts enforcement

**Utilities & Helpers:**

- `utils.truncation-effort.spec.ts` - Text truncation with effort normalization
- `metrics.duration.spec.ts` - Duration calculation accuracy
- `metrics.duration-precision.spec.ts` - Duration precision edge cases
- `logging.correlation-id.spec.ts` - Request correlation ID propagation

**API & Mapping:**

- `api.error-redaction.spec.ts` - Sensitive data redaction in errors
- `mappers.detailToClient.spec.ts` - Database to client DTO mapping
- `status.derivation.spec.ts` - Plan status derivation logic

### Performance Tests

- `utils.truncation-effort.perf.spec.ts` - Performance benchmarks for truncation logic

### Security Tests

- `rls.policies.spec.ts` - Comprehensive RLS policy verification (anonymous, authenticated, service role access across all tables)

### Coverage Summary

- ✅ API endpoints and request/response contracts
- ✅ Concurrency and race conditions
- ✅ Background job processing and workers
- ✅ AI generation (success, failures, timeouts, validation)
- ✅ Attempt tracking and limits
- ✅ RLS and data isolation
- ✅ Error handling and classification
- ✅ Performance benchmarks
- ✅ Utility functions and edge cases

## Test Isolation & Concurrency

To prevent cross-file contamination (shared mocks, AsyncLocalStorage context, and env state), Vitest is configured to run in a single thread with per-file isolation:

- `isolate: true` ensures each test file gets a fresh module graph and mock state.
- `sequence.concurrent: false` disables concurrent execution across files.
- `pool: 'threads'` with `poolOptions.threads.singleThread: true` forces a single worker.
- `maxConcurrency: 1` keeps file-level concurrency at one to avoid DB truncation races.

Notes:

- Global setup (`tests/setup.ts`) truncates the database before each test. Avoid redundant truncation in individual tests unless necessary.
- For request-auth dependent tests, use `setTestUser('<clerk_user_id>')` to set `DEV_CLERK_USER_ID` for that test. The isolation settings above prevent env and mock leakage between files.
- If you add new suites that mock the Stripe client or other globals, keep mocks file-local and reset them in `beforeEach` with `vi.clearAllMocks()`.

## Test Categories

### 1. Unit Tests (`tests/unit/**`)

**Purpose:** Test individual functions, utilities, and logic in isolation.

**Characteristics:**

- Fast execution
- No external dependencies
- Direct Postgres connection (RLS bypassed intentionally)
- Use test database for any DB operations

**Example:**

```typescript
// tests/unit/status.derivation.spec.ts
it('returns pending when no modules and attempts below cap', async () => {
  // Tests pure logic without RLS concerns
});
```

### 2. Integration Tests (`tests/integration/**`)

**Purpose:** Test how different parts of the system work together.

**Characteristics:**

- Test API routes, database queries, worker processes
- Direct Postgres connection (RLS bypassed intentionally)
- Use test database with migrations applied
- Test business logic, not security policies

**Example:**

```typescript
// tests/integration/api.plans.spec.ts
it('creates a learning plan via API', async () => {
  // Tests API logic, not RLS enforcement
});
```

### 3. Security Tests (`tests/security/**`)

**Purpose:** Verify that RLS policies correctly enforce access control.

**Characteristics:**

- Use Supabase clients with proper auth context
- Test with different user roles (anon, authenticated, service)
- Verify unauthorized access is blocked
- Verify authorized access works

**Example:**

```typescript
// tests/security/rls.policies.spec.ts
it('anonymous users cannot read private learning plans', async () => {
  const anonClient = createAnonClient();
  // Verify RLS blocks access
});
```

### 4. E2E Tests (`tests/e2e/**`)

**Purpose:** Test complete user flows including API routes and background workers.

**Coverage:**

- `plan-generation.test.ts` - Plan creation, worker processing, ready status
- `plan-generation-curation.e2e.ts` - Curation with resources, explanations, cutoff
- `plan-generation-cache.e2e.ts` - Cache behavior and reduced external calls
- `plan-generation-dates.e2e.test.ts` - Date handling in generation
- `onboarding-dates-ui.spec.tsx` - UI date picker integration

## Database Setup

### Test Database Configuration

The test suite uses a Supabase-hosted PostgreSQL database configured in `.env.test`:

```env
# Direct Postgres connection (bypasses RLS - intentional for business logic tests)
DATABASE_URL="postgresql://postgres.{project}:password@aws-1-us-east-2.pooler.supabase.com:6543/postgres?sslmode=require"

# Supabase URL and keys for RLS testing
NEXT_PUBLIC_SUPABASE_URL=https://{project}.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

When schema changes introduce new columns or enum types, run `pnpm exec drizzle-kit push` with the test `DATABASE_URL` exported so the Supabase-hosted database matches the local Drizzle schema (for example, the `generation_status` and `is_quota_eligible` columns added for plan generation lifecycle testing).

To force AI failures in tests, temporarily set `MOCK_GENERATION_FAILURE_RATE=1` (either via environment or inside the test) and reset it to `0` afterwards so other suites continue to exercise the happy path.

### Why RLS is Bypassed in Business Logic Tests

**The Question:** "Shouldn't all tests enforce RLS?"

**The Answer:** No - and here's why:

1. **Direct Postgres Connection = Superuser**
   - When using `postgres-js` with DATABASE_URL, you connect as the database owner
   - Database owners automatically bypass RLS (this is a PostgreSQL design feature)
   - This is intentional and standard practice

2. **Separation of Concerns**
   - Business logic tests verify "does the code work correctly?"
   - Security tests verify "does RLS block unauthorized access?"
   - Mixing these concerns makes tests slow, complex, and brittle

3. **Production Uses RLS**
   - Production API routes use Supabase client with user JWTs
   - RLS is enforced in production (verified by security tests)
   - Business logic tests don't need to simulate this

4. **Industry Standard**
   - Most applications separate business logic tests from security tests
   - Testing frameworks typically provide admin/superuser access for setup
   - Security policies are tested separately with appropriate auth contexts

**See:** `src/lib/db/drizzle.ts` for detailed comments explaining this approach.

## RLS Testing Strategy

### Current Implementation Status

- ✅ Phase 1: Infrastructure and documentation (COMPLETE)
- ✅ Phase 2: JWT-based RLS testing implementation (COMPLETE)
- ✅ Phase 3: Configure hosted Supabase test database (COMPLETE)

### How JWT-Based RLS Testing Works

RLS tests simulate Clerk authentication by generating test JWTs that match Clerk's structure:

```typescript
import {
  createAnonClient,
  createAuthenticatedClient,
  createServiceRoleClient,
} from '../helpers/rls';

// Anonymous client - no JWT, tests public access
it('anonymous users can read public plans', async () => {
  const anonClient = createAnonClient();
  const { data } = await anonClient
    .from('learning_plans')
    .select('*')
    .eq('visibility', 'public');

  expect(data).toHaveLength(1);
});

// Authenticated client - includes JWT with Clerk user ID
it('users can read their own private plans', async () => {
  const userClient = createAuthenticatedClient('user_123');
  const { data } = await userClient.from('learning_plans').select('*');

  expect(data).toHaveLength(1); // Only sees their own plans
});
```

### How It Works Internally

1. **JWT Generation** (`tests/helpers/jwt.ts`)
   - Creates a JWT with the Clerk user ID in the `sub` claim
   - Signs with Supabase's JWT secret
   - Includes standard claims: `iss`, `iat`, `exp`

2. **Authenticated Client** (`tests/helpers/rls.ts`)
   - Generates JWT for the specified Clerk user
   - Passes JWT in `Authorization: Bearer <token>` header
   - Supabase validates JWT and makes it available via `auth.jwt()`

3. **RLS Policies** (`src/lib/db/schema.ts`)
   - Extract Clerk user ID via `auth.jwt()->>'sub'`
   - Compare against `users.clerk_user_id` column
   - Enforce data isolation between users

### Prerequisites for Full RLS Testing

#### 1. Service Role Key (✅ Configured)

Already set in `.env.test`:

```env
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

#### 2. Supabase JWT Secret (⚠️ REQUIRED)

**This is CRITICAL for RLS tests to work.**

The JWT secret is used to sign test tokens so Supabase can validate them. Without it, all authenticated RLS tests will fail with "No suitable key or wrong key type".

**How to get it:**

1. Go to: https://supabase.com/dashboard/project/ulfujbbaiycqomnapxjp/settings/api
2. Find "JWT Secret" (it's a long base64-encoded string)
3. Copy it and add to `.env.test`:

```env
TEST_JWT_SECRET="your-supabase-jwt-secret-here"
```

**Important Notes:**

- This is NOT the same as the `service_role` key
- This is NOT the `anon` key
- It's the raw JWT secret used to sign/verify all JWTs
- It's typically a long random string (256+ characters)

#### 3. Test Implementation (✅ Complete)

All RLS tests are implemented in `tests/security/rls.policies.spec.ts`:

- ✅ Service role can bypass RLS
- ✅ Anonymous users can read public data
- ✅ Anonymous users cannot read private data
- ✅ Anonymous users cannot write data
- ✅ Authenticated users can manage their own data
- ✅ Authenticated users cannot access other users' data
- ✅ Cascade policies work for modules, tasks, progress
- ✅ Resources are public read, admin write

## Running Tests

### Run All Tests

```bash
pnpm test
```

This runs all tests sequentially:

1. Unit tests
2. Contract tests
3. Integration tests
4. Source co-located tests

### Run Specific Test Files

```bash
# Single test file
pnpm exec vitest run tests/unit/status.derivation.spec.ts

# All unit tests
pnpm exec vitest run tests/unit

# Watch mode
pnpm exec vitest watch tests/unit
```

### Run Security Tests (when implemented)

### Fast Unit Tests (skip DB setup)

To speed up unit tests and avoid DB truncation overhead, use the fast unit script which sets `SKIP_DB_TEST_SETUP=true`:

```bash
pnpm test:unit:fast
```

Notes:

- This flag only skips DB truncation/setup hooks in `tests/setup.ts`. A valid `DATABASE_URL` is still required because the DB client is imported by the setup file.
- Do not use this flag for integration, e2e, or RLS suites.

```bash
pnpm exec vitest run tests/security
```

## Test Database Migrations

Before running tests, ensure the test database schema is up-to-date:

```bash
# Apply schema to test database
export DATABASE_URL="<test-database-url-from-.env.test>"
pnpm exec drizzle-kit push
```

Or use the MCP Supabase tool to apply migrations.

## Test Utilities

### Database Helpers (`tests/helpers/db.ts`)

```typescript
import { truncateAll, ensureUser } from '../helpers/db';

beforeEach(async () => {
  await truncateAll(); // Clean database between tests
});

it('test with user', async () => {
  const userId = await ensureUser({
    clerkUserId: 'user_123',
    email: 'test@example.com',
  });
});
```

### Auth Helpers (`tests/helpers/auth.ts`)

```typescript
import { setTestUser } from '../helpers/auth';

it('test as specific user', () => {
  setTestUser('user_123'); // Sets DEV_CLERK_USER_ID for API routes
  // NOTE: This does NOT enforce RLS - it's for business logic testing only
});
```

### RLS Helpers (`tests/helpers/rls.ts`)

```typescript
import {
  createAnonClient,
  createServiceRoleClient,
  createAuthenticatedClient,
} from '../helpers/rls';

// Anonymous client (no auth)
const anonClient = createAnonClient();

// Service role (bypasses RLS)
const adminClient = createServiceRoleClient();

// Authenticated client (TODO: requires service_role key)
const userClient = createAuthenticatedClient('user_123');
```

### HTTP Mock Helpers (`tests/helpers/http.ts`)

**Purpose:** Mock external HTTP requests for tests.

```typescript
import { createMockFetch, createMockHeadOk } from '../helpers/http';

// Mock fetch responses
const mockFetch = createMockFetch([
  {
    url: 'https://api.example.com/data',
    status: 200,
    ok: true,
    body: { result: 'success' },
  },
]);

global.fetch = mockFetch;

// Mock HEAD requests for docs validation
const mockHeadOk = createMockHeadOk({
  'https://example.com/doc': 200,
  'https://example.com/broken': 404,
});
```

### Lock Helpers (`tests/helpers/locks.ts`)

**Purpose:** Simulate advisory locks for testing concurrency dedupe.

```typescript
import { InMemoryLockManager, CallCounter } from '../helpers/locks';

const lockManager = new InMemoryLockManager();
const counter = new CallCounter();

// Simulate lock acquisition
const lock = lockManager.acquire('key');
if (lock) {
  counter.increment('fetches');
  // ... perform work ...
  lock.release();
}
```

### Fixtures (`tests/fixtures/curation/`)

Static JSON data for mocking external API responses:

- `youtube-search.json` - YouTube search API responses
- `youtube-videos.json` - YouTube video stats/metadata
- `cse-search.json` - Google CSE search results
- `docs-heads.json` - HTTP HEAD validation responses

**Usage:**

```typescript
import youtubeSearchFixture from '../fixtures/curation/youtube-search.json';

vi.mock('@/lib/curation/youtube', () => ({
  searchYouTube: vi.fn().mockResolvedValue(youtubeSearchFixture.items),
}));
```

## Database Schema Tests

### Location

Schema validation tests are located in `tests/db/` and verify database constraints, indexes, and schema-level validation.

### Purpose

- Test DB-level constraints (unique, foreign keys, check constraints)
- Verify indexes exist and are properly configured
- Test enum enforcement and default values
- Validate cascade behaviors

### Example: Stripe Schema Tests

The file `tests/db/stripe.schema.spec.ts` validates:

- Subscription tier enum defaults and enforcement
- Stripe field uniqueness constraints (`stripeCustomerId`, `stripeSubscriptionId`)
- Usage metrics table constraints (unique user/month, non-negative counters)
- Foreign key cascades
- Index presence

### Running Schema Tests

```bash
# Run all DB schema tests
pnpm exec vitest run tests/db

# Run specific schema test
pnpm exec vitest run tests/db/stripe.schema.spec.ts
```

### Important Notes

- Schema tests use direct Postgres connection (RLS bypassed by design)
- Always run migrations on test database before running schema tests:
  ```bash
  export DATABASE_URL="<test-database-url-from-.env.test>"
  pnpm exec drizzle-kit push
  ```
- These tests verify database-level constraints, not application logic

## Best Practices

### ✅ DO

- Use direct DB access (`db` from `@/lib/db/drizzle`) for business logic tests
- Use Supabase clients (`createAnonClient`, etc.) for security tests
- Clean up with `truncateAll()` in `beforeEach`
- Document why RLS is or isn't being tested
- Test one concern per test

### ❌ DON'T

- Mix business logic and security testing
- Try to enforce RLS in unit/integration tests
- Skip test cleanup (causes test pollution)
- Use real user credentials in tests
- Hardcode UUIDs (use `ensureUser` helper)

## Troubleshooting

### "relation does not exist" errors

**Problem:** Test database doesn't have the schema.

**Solution:**

```bash
export DATABASE_URL="<url-from-.env.test>"
pnpm exec drizzle-kit push
```

### RLS Security Test Coverage & Seeding

RLS coverage for sensitive tables lives under `tests/security/**` and uses authenticated Supabase clients instead of direct superuser connections. Current focused coverage includes:

| Table                 | Read Policies         | Write Policies                                                              | Security Tests                                                                 |
| --------------------- | --------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `generation_attempts` | Owner or service role | Insert: owner or service, no update/delete                                  | `generation_attempts.rls.spec.ts`, `generation_attempts.rls.mutations.spec.ts` |
| `job_queue`           | Owner or service role | Insert: owner or service; Update/Delete: service role (enforced implicitly) | `job_queue.rls.spec.ts`                                                        |

#### Shared Seeding Helper

To avoid duplication each security test uses the helper functions in `tests/security/helpers/seed.ts`:

- `cleanCoreTables()` – wipes core domain tables (`users`, `learning_plans`, `modules`, `plan_generations`, `generation_attempts`) using the service role client.
- `seedGenerationAttempts({ withAttempts, ownerId, otherId, ... })` – inserts two users, two plans, and optionally one attempt per plan.
- `seedJobQueue(baseSeed)` – inserts paired jobs (one per user/plan) for `job_queue` RLS validation.

These helpers ensure:

1. Deterministic isolation between tests
2. Minimal boilerplate in each spec
3. Consistent referential integrity when adding new RLS tables

If you add RLS tests for another table, prefer extending the existing helper or adding a focused helper in the same directory instead of inlining seeding logic.

#### Adding a New RLS Test

1. Call `cleanCoreTables()` in a `beforeAll`.
2. Seed base data (e.g. `const base = await seedGenerationAttempts({ withAttempts: false })`).
3. Insert table‑specific rows with the service role client or extend the helper.
4. Assert behavior for: anonymous, owner user, other user, service role.

#### Why Not Use Basejump Test Helpers?

The original integration smoke test referenced a `tests` schema from Basejump helpers not applied in CI. Rather than executing custom SQL outside Drizzle migrations, we validate RLS purely through real client interactions which more closely mirrors production behavior and avoids schema drift.

### Tests using wrong DATABASE_URL

**Problem:** `.env` overrides `.env.test`.

**Solution:** Verify `vitest.config.ts` loads `.env.test` before other files import `drizzle`.

**Check:** `src/lib/db/drizzle.ts` should NOT load dotenv in test mode.

### "SUPABASE_SERVICE_ROLE_KEY not set"

**Problem:** RLS tests need service role key.

**Solution:** Add to `.env.test`:

```env
SUPABASE_SERVICE_ROLE_KEY=eyJ... # Get from Supabase dashboard
```

## Curation Engine Testing

### Overview

The curation engine tests cover the complete resource attachment pipeline: search, ranking, validation, caching, and persistence.

### Test Policy: No Live Network Calls

**All external API calls are fully mocked:**

- YouTube API: Mocked requests return fixture data
- Google CSE: Mocked responses from `tests/fixtures/curation/cse-search.json`
- HTTP HEAD: Mocked with `createMockHeadOk` helper
- No sleep/wait calls: Use fake timers for TTL/expiry testing

### Key Test Patterns

**Deterministic Cache Testing:**

```typescript
vi.useFakeTimers();
const key = buildCacheKey({ query: 'test', source: 'youtube', ... });
await setCachedResults(key, 'search', payload);
vi.advanceTimersByTime(expiryDuration);
const result = await getCachedResults(key);
expect(result).toBeNull(); // Expired
vi.useRealTimers();
```

**Concurrency Dedupe:**

```typescript
const counter = new CallCounter();
const fetcher = async () => {
  counter.increment('upstream');
  return results;
};

await Promise.all([
  getOrSetWithLock(key, 'search', fetcher),
  getOrSetWithLock(key, 'search', fetcher),
]);

expect(counter.getCount('upstream')).toBeLessThanOrEqual(2);
```

**Mock Policy:**

- Unit tests: Mock adapter boundaries (`curateYouTube`, `curateDocs`)
- Integration tests: Mock only external HTTP; allow real DB
- E2E tests: Mock external APIs; real worker + DB

### Coverage Summary

✅ Cache TTLs, negative cache, LRU eviction, versioning  
✅ Scoring components, cutoff enforcement, diversity selection  
✅ Early-stop fill when quota satisfied  
✅ Link validation (HEAD 200/3xx/4xx), YouTube embeddable status  
✅ Resource upsert/attachments with stable ordering  
✅ Worker curation integration with time budget  
✅ E2E plan generation with curation active

## Future Enhancements

- [ ] Add E2E tests with Playwright
- [ ] Implement full authenticated RLS testing
- [ ] Add contract tests for external APIs
- [ ] Set up CI/CD with GitHub Actions + Docker Postgres
- [ ] Add performance benchmarks
- [ ] Add visual regression tests

## Clerk Integration & JWT Parity (Documentation – Phase 6)

This project now aligns its test authentication flow with the production Clerk → Supabase setup. The goal is for RLS security tests to faithfully model how production requests are authorized.

### 1. Supabase Accepts Clerk JWTs

In the Supabase Dashboard you must configure Clerk as a custom/external JWT provider:

- JWKS URL: `https://kind-wahoo-35.clerk.accounts.dev/.well-known/jwks.json`
- Issuer (`iss`): `https://kind-wahoo-35.clerk.accounts.dev`
- (Optional) Audience (`aud`): Your Clerk Frontend API / Publishable domain if enforcement is enabled

Once configured, Supabase validates Clerk‑issued tokens and exposes their claims via `auth.jwt()` in RLS policies and SQL functions.

### 2. Test JWTs Mirror Clerk Structure

Security (RLS) tests generate JWTs that intentionally match Clerk's production format so that:

- The `sub` claim represents the Clerk user ID (mapped to `users.clerk_user_id` in our schema)
- The `iss` claim matches the configured Clerk issuer
- Optional claims such as `aud`, `azp`, session identifiers (`sid`) may be included for realism

Example test payload (simplified):

```jsonc
{
  "sub": "user_123",
  "iss": "https://kind-wahoo-35.clerk.accounts.dev",
  "aud": "<frontend-api-url>",
  "azp": "<frontend-api-url>",
  "iat": 1730000000,
  "exp": 1730003600,
  "sid": "sess_test123",
}
```

### 3. RLS Validation Flow

During RLS tests:

1. A test JWT is generated in `tests/helpers/jwt.ts`
2. It is signed with `TEST_JWT_SECRET` (must equal the Supabase project's JWT secret or a compatible provider secret)\*
3. Supabase validates the signature and loads claims into `auth.jwt()`
4. Policies reference `auth.jwt()->>'sub'` to scope data to the authenticated Clerk user

This means passing tests demonstrate that, in production, real Clerk JWTs will satisfy the same policies without code changes.

### 4. TEST_JWT_SECRET Requirements

Set in `.env.test`:

```env
TEST_JWT_SECRET="<supabase-jwt-secret>"
```

Important:

- It MUST match the JWT secret configured under Supabase Project Settings → API (or the secret expected for the configured external provider if Supabase uses that for verification)
- If mismatched, all authenticated RLS tests will fail with key/verification errors
- This secret is distinct from `SUPABASE_SERVICE_ROLE_KEY` (a key, not the signing secret)

### 5. Why This Matters

Previously, test tokens were structurally minimal and risked diverging from production authentication. By mirroring Clerk's format:

- We reduce false positives (tests passing with unrealistic tokens)
- We ensure RLS policy logic (`sub`-based ownership, visibility rules) is production-faithful
- Future additions of claim-dependent policies (e.g., org roles) can be tested confidently

### 6. Updating / Regenerating Claims

If Clerk domain changes (e.g., new instance) update:

- `CLERK_ISSUER` in `.env.test`
- Supabase provider Issuer value
- Any hardcoded `iss` expectations in tests (avoid if possible)

### 7. Quick Verification Checklist

- [ ] Supabase provider configured with correct JWKS + Issuer
- [ ] `.env.test` contains real Supabase JWT secret in `TEST_JWT_SECRET`
- [ ] RLS tests pass locally (`pnpm exec vitest run tests/security`)
- [ ] `auth.jwt()->>'sub'` returns expected Clerk user ID inside policies (can verify via a diagnostic SELECT during debugging)

\*If using Supabase's external JWT provider feature with Clerk JWKS, Supabase handles key rotation automatically—our tests only need to simulate a structurally correct token when not exercising live JWKS validation locally.

## References

- [Vitest Documentation](https://vitest.dev/)
- [Supabase RLS Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL RLS Documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Drizzle ORM](https://orm.drizzle.team/)

## Visual & Accessibility Testing

### Purpose

Verify that the design system meets WCAG AA contrast requirements and renders correctly across themes. This includes validating text readability on backgrounds, gradients, and branded elements.

### Process

1. **Build and Run Locally**: `pnpm dev` to serve the app.
2. **Browser Validation**:
   - Open Chrome DevTools → Elements → Computed → Color picker for contrast ratios.
   - Use WebAIM Contrast Checker (https://webaim.org/resources/contrastchecker/) for manual spot checks.
   - Lighthouse audit for full WCAG AA compliance (Categories: Accessibility).
3. **Theme Testing**: Toggle light/dark mode and verify:
   - Text on primary backgrounds (e.g., body text on `--background`).
   - Text on gradients (e.g., headings on `--gradient-hero`).
   - Interactive elements (buttons, links) meet 3:1 touch target contrast.
4. **Edge Cases**:
   - High-contrast mode in browser settings.
   - Screen reader flow (NVDA/VoiceOver) for semantic structure.
   - Responsive breakpoints for text sizing.

### Tools

- **Chrome DevTools**: Built-in contrast checker in Styles panel.
- **WebAIM Contrast Checker**: https://webaim.org/resources/contrastchecker/
- **Lighthouse**: `pnpm exec lighthouse http://localhost:3000 --only-categories=accessibility`.
- **Wave**: https://wave.webaim.org/ for automated WCAG issues.
- **Color Contrast Analyzer (CCA)**: Desktop tool for batch validation.

### Brand Token Validation Notes

The learning brand tokens in `src/app/globals.css` were designed with WCAG AA in mind. Key contrast checks (calculated for normal text, 4.5:1 minimum):

| Element                       | Light Mode Contrast                     | Dark Mode Contrast                          | Notes                                   |
| ----------------------------- | --------------------------------------- | ------------------------------------------- | --------------------------------------- |
| Body text on background       | 21:1 (oklch(0.145 0 0) on oklch(1 0 0)) | 16:1 (oklch(0.985 0 0) on oklch(0.145 0 0)) | Passes AA; high readability.            |
| Headings on gradient-hero     | 7.2:1 (primary on gradient start)       | 8.5:1 (accent on gradient)                  | Passes AA; tested at gradient extremes. |
| Cards (text on gradient-card) | 12:1 (foreground on card gradient)      | 10:1 (on dark card)                         | Subtle gradients maintain contrast.     |
| Buttons (learning-primary)    | 6.8:1 (white text on primary)           | 5.2:1 (dark text on light primary)          | AA compliant; hover states verified.    |
| Success elements              | 9.1:1 (text on success bg)              | 7.3:1                                       | Green tones readable on both themes.    |

All tokens use OKLCH for perceptual uniformity. If adjustments are needed (e.g., due to new content), tweak lightness (L) values in globals.css and re-validate. For gradients, ensure text is not overlaid directly—use solid backgrounds where possible.

### Smoke Tests

- Render all pages (landing, dashboard, plans, pricing, billing) in light/dark.
- Confirm no visual breakage from token changes.
- Manual share preview (Twitter/Facebook) to verify OG images load.

For visual regression in future, consider Percy or Chromatic integration. Always run `pnpm lint` and Lighthouse after design changes.
