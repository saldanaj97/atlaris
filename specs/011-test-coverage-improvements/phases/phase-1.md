# Phase 1: Critical (Weeks 1-2)

**Focus:** Production stability and API reliability

1. **API Endpoint Tests** (Est: 8-10 hours)
   - Add integration tests for all 11 untested routes
   - Cover success, error, validation, and RLS cases
   - Target files: `tests/integration/api/*.spec.ts`

2. **API Layer Tests** (Est: 4-6 hours)
   - Add unit tests for `api/*` utilities
   - Focus on response formatting, error handling, auth
   - Target files: `tests/unit/api/*.spec.ts`

3. **Mapper Tests** (Est: 3-4 hours)
   - Add unit tests for all data transformation
   - Cover edge cases and null handling
   - Target files: `tests/unit/mappers/*.spec.ts`

**Impact:** Catches production bugs, improves API reliability, prevents data corruption

**Success Metrics:**

- All API endpoints have at least 1 test
- API layer utilities have >80% coverage
- All mappers have comprehensive tests

---

## API Endpoints - Missing Tests

Many production API routes have **no test coverage**:

**Untested endpoints:**

- `src/app/api/health/worker/route.ts` - Worker health check
- `src/app/api/v1/templates/route.ts` - Template management
- `src/app/api/v1/resources/route.ts` - Resource management
- `src/app/api/v1/user/profile/route.ts` - User profile
- `src/app/api/v1/user/subscription/route.ts` - Subscription status
- `src/app/api/v1/notifications/preferences/route.ts` - Notification settings
- `src/app/api/v1/notifications/weekly-summary/route.ts` - Weekly summaries
- `src/app/api/v1/ai/generate-plan/route.ts` - Plan generation endpoint
- `src/app/api/v1/ai/enhance-content/route.ts` - Content enhancement
- `src/app/api/v1/integrations/disconnect/route.ts` - Integration disconnection
- `src/app/api/v1/plans/[planId]/tasks/route.ts` - Task management

**Recommendation:**

Create integration tests in `tests/integration/api/` for each endpoint covering:

- Success cases (200/201 responses)
- Error cases (400/401/403/404/500)
- Input validation
- RLS enforcement
- Rate limiting (where applicable)

**Example test structure:**

```typescript
// tests/integration/api/user-profile.spec.ts
describe('GET /api/v1/user/profile', () => {
  it('should return authenticated user profile', async () => {
    const user = await ensureUser({ clerkUserId: 'test-user' });
    const response = await GET('/api/v1/user/profile', { userId: user.id });
    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('id');
  });

  it('should return 401 for unauthenticated requests', async () => {
    const response = await GET('/api/v1/user/profile');
    expect(response.status).toBe(401);
  });
});
```

---

### 2. API Layer Utilities - No Coverage

Critical API infrastructure files lack tests:

**Untested files:**

- `src/lib/api/response.ts` - Response formatting
- `src/lib/api/rate-limit.ts` - Rate limiting logic
- `src/lib/api/errors.ts` - Error handling
- `src/lib/api/context.ts` - Request context
- `src/lib/api/auth.ts` - Authentication helpers
- `src/lib/api/schedule.ts` - Schedule API utilities

**Recommendation:**

Add unit tests in `tests/unit/api/` covering:

- Error serialization and redaction
- Rate limit calculation and enforcement
- Auth token validation
- Response formatting consistency

**Example:**

```typescript
// tests/unit/api/response.spec.ts
describe('API Response Utilities', () => {
  it('should format success responses consistently', () => {
    const result = formatSuccess({ id: 1, name: 'Test' });
    expect(result).toEqual({ success: true, data: { id: 1, name: 'Test' } });
  });

  it('should redact sensitive data from error responses', () => {
    const error = new Error('Database error: password123');
    const result = formatError(error);
    expect(result.message).not.toContain('password');
  });
});
```

---

### 3. Data Mappers - Zero Tests

Data transformation layer is completely untested:

**Files needing tests:**

- `src/lib/mappers/planQueries.ts`
- `src/lib/mappers/learningPlans.ts`
- `src/lib/mappers/detailToClient.ts`

**Recommendation:**

Add unit tests in `tests/unit/mappers/` to verify:

- Correct data transformation
- Handling of null/undefined values
- Edge cases (empty arrays, missing fields)
- Type safety guarantees

**Example:**

```typescript
// tests/unit/mappers/learningPlans.spec.ts
describe('Learning Plan Mappers', () => {
  it('should map database plan to client format', () => {
    const dbPlan = { id: 1, user_id: 'user1', title: 'Learn TypeScript' };
    const clientPlan = mapPlanToClient(dbPlan);
    expect(clientPlan).toEqual({
      id: 1,
      userId: 'user1',
      title: 'Learn TypeScript',
    });
  });

  it('should handle null fields gracefully', () => {
    const dbPlan = { id: 1, user_id: 'user1', description: null };
    const clientPlan = mapPlanToClient(dbPlan);
    expect(clientPlan.description).toBeUndefined();
  });
});
```

---

## Implementation breakdown

### Step 1 — API endpoint tests

**Goals**

- Ensure all high-risk API routes have at least one integration test file.
- Standardize test structure across `tests/integration/api/*` using shared helpers.
- Exercise success, validation, auth, and RLS behavior for each endpoint.

**Suggested file mapping**

- `src/app/api/health/worker/route.ts` → `tests/integration/api/health.worker.spec.ts`
- `src/app/api/v1/templates/route.ts` → `tests/integration/api/templates.spec.ts`
- `src/app/api/v1/resources/route.ts` → `tests/integration/api/resources.spec.ts`
- `src/app/api/v1/user/profile/route.ts` → `tests/integration/api/user-profile.spec.ts`
- `src/app/api/v1/user/subscription/route.ts` → `tests/integration/api/user-subscription.spec.ts`
- `src/app/api/v1/notifications/preferences/route.ts` → `tests/integration/api/notifications-preferences.spec.ts`
- `src/app/api/v1/notifications/weekly-summary/route.ts` → `tests/integration/api/notifications-weekly-summary.spec.ts`
- `src/app/api/v1/ai/generate-plan/route.ts` → `tests/integration/api/ai-generate-plan.spec.ts`
- `src/app/api/v1/ai/enhance-content/route.ts` → `tests/integration/api/ai-enhance-content.spec.ts`
- `src/app/api/v1/integrations/disconnect/route.ts` → `tests/integration/api/integrations-disconnect.spec.ts`
- `src/app/api/v1/plans/[planId]/tasks/route.ts` → `tests/integration/api/plan-tasks.spec.ts`

**Checklist**

- [ ] Confirm existing helpers in `tests/setup.ts` and any `tests/integration/**` utilities for authenticated requests, DB setup, and cleanup.
- [ ] For each route, define a minimal happy-path scenario using real DB data (seeded via existing factories or helpers).
- [ ] Add negative tests per route: unauthenticated, unauthorized (wrong tenant), invalid payload, and not-found where applicable.
- [ ] For routes with RLS implications (plans, tasks, resources), add at least one cross-tenant assertion (owner vs attacker).
- [ ] Validate response shapes against existing types or OpenAPI-style contracts where available.
- [ ] Use common naming for test cases (`it('returns 401 for unauthenticated requests')`, etc.) to keep tests greppable.

**Milestones**

- **Week 1, early:** Create the files and shared testing patterns (e.g., helpers to create users/plans, wrapper for calling API handlers).
- **Week 1, late:** Complete tests for user, health, and subscription-related routes.
- **Week 2, early:** Complete tests for notifications and template/resource routes.
- **Week 2, late:** Finish AI and plan-task routes, then refactor for duplication and readability.

### Step 2 — API layer utilities

**Goals**

- Lock in consistent API response shapes and error semantics.
- Verify rate limiting decisions and headers.
- Confirm auth/context helpers behave correctly under different inputs and environments.

**Checklist**

- [ ] Add or extend `tests/unit/api/response.spec.ts` to cover success wrappers, error wrappers, and `notImplemented`/`notFound` helpers.
- [ ] Add tests for `src/lib/api/errors.ts` focusing on:
  - Error normalization and redaction of sensitive fields.
  - Mapping of internal errors to HTTP status codes.
  - Stable error payload shape for clients.
- [ ] Add tests for `src/lib/api/rate-limit.ts` to verify:
  - Rate limit key computation per user/IP.
  - Correct handling when limits are exceeded (status, headers, retry-after).
  - Idempotent behavior across repeated calls in the same window.
- [ ] Add tests for `src/lib/api/auth.ts` / `src/lib/api/context.ts` that:
  - Simulate valid/invalid tokens.
  - Assert behavior for missing user, mismatched tenant, and service-role access.
  - Ensure request context includes correlation IDs or logger context where expected.
- [ ] Add tests for `src/lib/api/schedule.ts` to validate composition of schedule responses and error handling.

**Notes**

- Prefer pure unit tests without hitting the database; mock any external dependencies (Clerk, Supabase, Drizzle) at module boundary.
- Re-use the existing `api.error-redaction.spec.ts` patterns to stay consistent with the current suite.

### Step 3 — Mapper tests

**Goals**

- Guard all DTO and projection logic against regressions.
- Ensure all mappers handle optional/nullable fields and unknown enum values safely.

**Checklist**

- [ ] Create `tests/unit/mappers/planQueries.spec.ts` covering:
  - Mapping from internal query results to client-facing types.
  - Handling of empty result sets.
- [ ] Create `tests/unit/mappers/learningPlans.spec.ts` covering:
  - Conversion of DB records to client `LearningPlan` structures.
  - Preservation of IDs, user ownership, and derived fields (where applicable).
- [ ] Create `tests/unit/mappers/detailToClient.spec.ts` covering:
  - Mapping of nested plan/module/task structures.
  - Handling of missing or null resource/task metadata.
- [ ] Use small inline fixtures rather than building full DB records; keep tests fast and deterministic.
- [ ] Assert that mappers never throw on partial data and instead return safe defaults (undefined/empty arrays).

---

## Milestones, coverage, and validation

**Coverage targets (from context.md)**

- After Phase 1, update `vitest.config.ts` thresholds to approximately:

```typescript
thresholds: {
  lines: 40,
  functions: 50,
  branches: 30,
  statements: 40,
}
```

Only raise thresholds once the new tests are stable in CI to avoid blocking unrelated work.

**Suggested validation flow**

- Run focused suites while iterating:
  - `pnpm vitest tests/integration/api -c vitest.config.ts` (or equivalent) for API endpoints.
  - `pnpm vitest tests/unit/api tests/unit/mappers -c vitest.config.ts` for unit tests.
- Once all Phase 1 items are implemented, run:
  - `pnpm test:unit:related` and `pnpm test:integration:related` for a final check before bumping thresholds.

---

## Phase 1 to-dos (checklist)

- [ ] Add integration tests for all 11 untested API routes listed above.
- [ ] Ensure each route has at least one success path and one failure path test.
- [ ] Add unit tests for `response.ts`, `errors.ts`, `rate-limit.ts`, `auth.ts`, `context.ts`, and `schedule.ts`.
- [ ] Add unit tests for all mappers in `src/lib/mappers/*`.
- [ ] Confirm new tests run reliably against the local and CI test databases.
- [ ] Raise coverage thresholds in `vitest.config.ts` once all Phase 1 tests are green in CI.
