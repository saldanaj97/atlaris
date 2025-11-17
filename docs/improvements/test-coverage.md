# Test Coverage Analysis & Improvement Plan

**Date:** 2025-11-17
**Status:** Proposed
**Author:** Analysis generated from codebase review

---

## Executive Summary

The Atlaris codebase has a **solid testing foundation** with 117 test files organized across unit, integration, E2E, and security tests using Vitest. However, there are several critical gaps that need attention to improve production reliability and prevent regressions.

**Current Coverage Status:**
- Total test files: 117 (40 unit, 68 integration, 8 E2E, 1 security)
- Coverage thresholds: 20% functions, 0% lines/branches/statements
- Testing framework: Vitest 3.2.4 with React Testing Library

---

## Current State Summary

### Strengths ✅

- Well-organized test structure (unit/integration/e2e/security)
- Excellent coverage of core business logic (AI, scheduling, curation, workers)
- Comprehensive integration tests for database operations
- Strong RLS security testing
- Good OAuth and third-party integration coverage
- Database-driven testing with Docker-based PostgreSQL
- Worker process testing for background jobs

### Weaknesses ⚠️

- Very low coverage threshold (20% functions, 0% for lines/branches)
- Many API endpoints lack tests
- Minimal component testing (3/40+ components)
- Missing tests for utilities, mappers, and hooks
- Several critical API layer files untested

---

## Priority 1: Critical Gaps (High Risk)

### 1. API Endpoints - Missing Tests

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
    expect(clientPlan).toEqual({ id: 1, userId: 'user1', title: 'Learn TypeScript' });
  });

  it('should handle null fields gracefully', () => {
    const dbPlan = { id: 1, user_id: 'user1', description: null };
    const clientPlan = mapPlanToClient(dbPlan);
    expect(clientPlan.description).toBeUndefined();
  });
});
```

---

## Priority 2: Important Gaps (Medium Risk)

### 4. Component Testing - Severely Limited

Only **3 out of 40+ components** have tests:

**Tested:**
- `ExportButtons.spec.tsx`
- `ScheduleWeekList.spec.tsx`
- `billing-utils.spec.ts`

**Untested categories:**
- **Billing components** (7 files): PricingCards, SubscribeButton, ManageSubscriptionButton, etc.
- **Plan components** (10+ files): PlansList, PlanDetails, RegenerateButton, OnboardingForm, etc.
- **Shared components** (5 files): SiteHeader, SiteFooter, AuthControls, etc.
- **UI components** (18 files): All shadcn/ui components (Button, Card, Dialog, etc.)

**Recommendation:**

Prioritize testing:
1. **Critical user flows**: OnboardingForm, RegenerateButton, PlansList
2. **Payment flows**: SubscribeButton, ManageSubscriptionButton, PricingCards
3. **Complex interactions**: UpdateTaskStatusButton, PlanModuleCard

Add tests in `tests/unit/components/` or `tests/e2e/` using React Testing Library.

**Example:**
```typescript
// tests/unit/components/RegenerateButton.spec.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { RegenerateButton } from '@/components/plans/RegenerateButton';

describe('RegenerateButton', () => {
  it('should trigger regeneration on click', async () => {
    const onRegenerate = vi.fn();
    render(<RegenerateButton planId="123" onRegenerate={onRegenerate} />);

    const button = screen.getByRole('button', { name: /regenerate/i });
    fireEvent.click(button);

    expect(onRegenerate).toHaveBeenCalledWith('123');
  });

  it('should disable button during regeneration', () => {
    render(<RegenerateButton planId="123" isRegenerating={true} />);
    const button = screen.getByRole('button', { name: /regenerate/i });
    expect(button).toBeDisabled();
  });
});
```

---

### 5. Database Queries - Partial Coverage

Some query modules lack direct tests:

**Missing tests:**
- `src/lib/db/queries/users.ts`
- `src/lib/db/queries/schedules.ts`
- `src/lib/db/queries/modules.ts`
- `src/lib/db/queries/jobs.ts`

**Existing coverage:**
- `plans.ts` ✅
- `tasks.ts` ✅
- `resources.ts` ✅
- `attempts.ts` ✅

**Recommendation:**

Add integration tests in `tests/integration/db/` to verify:
- Query correctness
- RLS policy enforcement
- Transaction handling
- Error conditions

**Example:**
```typescript
// tests/integration/db/schedules.queries.spec.ts
describe('Schedule Queries', () => {
  it('should fetch schedules for a plan', async () => {
    const userId = await ensureUser({ clerkUserId: 'test' });
    const planId = await createPlan({ userId, title: 'Test Plan' });
    const scheduleId = await createSchedule({ planId, weekNumber: 1 });

    const schedules = await getSchedulesForPlan(planId);
    expect(schedules).toHaveLength(1);
    expect(schedules[0].id).toBe(scheduleId);
  });

  it('should enforce RLS on schedule access', async () => {
    const owner = await ensureUser({ clerkUserId: 'owner' });
    const attacker = await ensureUser({ clerkUserId: 'attacker' });
    const planId = await createPlan({ userId: owner.id });

    await expect(
      getSchedulesForPlan(planId, { userId: attacker.id })
    ).rejects.toThrow();
  });
});
```

---

### 6. AI Pipeline - Gaps

Core AI orchestration missing direct tests:

**Untested:**
- `src/lib/ai/orchestrator.ts` - Only tested indirectly
- `src/lib/ai/prompts.ts` - No test coverage
- `src/lib/ai/parser.ts` - No test coverage

**Existing coverage:**
- `schema.ts` ✅
- `provider.ts` ✅
- `provider-factory.ts` ✅
- `timeout.ts` ✅
- `pacing.ts` ✅
- `classification.ts` ✅

**Recommendation:**

Add unit tests in `tests/unit/ai/`:
- `orchestrator.spec.ts` - Test retry logic, provider fallback, error handling
- `prompts.spec.ts` - Verify prompt construction, parameter injection
- `parser.spec.ts` - Test response parsing, validation, error recovery

**Example:**
```typescript
// tests/unit/ai/prompts.spec.ts
describe('AI Prompt Builder', () => {
  it('should construct plan generation prompt with all parameters', () => {
    const prompt = buildPlanPrompt({
      topic: 'TypeScript',
      level: 'intermediate',
      duration: '4 weeks',
    });

    expect(prompt).toContain('TypeScript');
    expect(prompt).toContain('intermediate');
    expect(prompt).toContain('4 weeks');
  });

  it('should sanitize user input in prompts', () => {
    const prompt = buildPlanPrompt({
      topic: '<script>alert("xss")</script>',
    });

    expect(prompt).not.toContain('<script>');
  });
});
```

---

### 7. Worker Handler - Missing Test

Main worker handler lacks direct unit test:

**Untested:**
- `src/workers/handlers/plan-generation-handler.ts`

**Note:** This is tested via integration tests, but a unit test would help isolate handler logic.

**Recommendation:**

Add `tests/unit/workers/handlers/plan-generation-handler.spec.ts` to test:
- State transitions
- Error handling
- Orchestration logic
- Timeout handling

---

## Priority 3: Nice-to-Have Improvements (Low Risk)

### 8. Hooks - No Coverage

React hooks are untested:

**Untested:**
- `src/hooks/usePlanStatus.ts`

**Recommendation:**

Add `tests/unit/hooks/usePlanStatus.spec.ts` using `@testing-library/react-hooks`.

**Example:**
```typescript
// tests/unit/hooks/usePlanStatus.spec.ts
import { renderHook, waitFor } from '@testing-library/react';
import { usePlanStatus } from '@/hooks/usePlanStatus';

describe('usePlanStatus', () => {
  it('should fetch plan status on mount', async () => {
    const { result } = renderHook(() => usePlanStatus('plan-123'));

    await waitFor(() => {
      expect(result.current.status).toBe('completed');
    });
  });

  it('should poll for status updates', async () => {
    const { result } = renderHook(() => usePlanStatus('plan-123', { poll: true }));

    await waitFor(() => {
      expect(result.current.isPolling).toBe(true);
    });
  });
});
```

---

### 9. Utility Functions - Partial Coverage

Some utilities lack tests:

**Untested:**
- `src/lib/utils.ts` - General utilities
- `src/lib/formatters.ts` - Data formatting
- `src/lib/navigation.ts` - Navigation helpers
- `src/lib/config/env.ts` - Environment configuration

**Existing coverage:**
- `sanitize.ts` ✅
- `truncation.ts` ✅
- `hash.ts` ✅
- `effort.ts` ✅

**Recommendation:**

Add unit tests in `tests/unit/` for these utilities.

---

### 10. Logging Infrastructure

Partial logging coverage:

**Untested:**
- `src/lib/logging/logger.ts`
- `src/lib/logging/client.ts`

**Tested:**
- `src/lib/logging/request-context.ts` ✅

**Recommendation:**

Add unit tests to verify log formatting, level filtering, and output redaction.

---

## Actionable Roadmap

### Phase 1: Critical (Weeks 1-2)

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

### Phase 2: Important (Weeks 3-4)

**Focus:** User experience and UI stability

4. **Component Tests** (Est: 12-16 hours)
   - Focus on critical user flows (onboarding, regeneration, billing)
   - Add tests for 10-15 priority components
   - Target files: `tests/unit/components/*.spec.tsx`

5. **Database Query Tests** (Est: 4-6 hours)
   - Add integration tests for missing query modules
   - Ensure RLS enforcement on all queries
   - Target files: `tests/integration/db/*.spec.ts`

6. **AI Pipeline Tests** (Est: 6-8 hours)
   - Add unit tests for orchestrator, prompts, parser
   - Cover error recovery and edge cases
   - Target files: `tests/unit/ai/*.spec.ts`

**Impact:** Improves UI stability, prevents regressions, better AI reliability

**Success Metrics:**
- Critical components (10+) have test coverage
- All database query modules tested
- AI pipeline has >70% coverage

---

### Phase 3: Refinement (Weeks 5-6)

**Focus:** Comprehensive coverage

7. **Worker Handler Tests** (Est: 4-6 hours)
   - Add unit test for plan-generation-handler
   - Isolate handler logic from integration tests
   - Target files: `tests/unit/workers/handlers/*.spec.ts`

8. **Hook Tests** (Est: 2-3 hours)
   - Add tests for `usePlanStatus`
   - Cover polling, error states, loading states
   - Target files: `tests/unit/hooks/*.spec.ts`

9. **Utility Tests** (Est: 4-6 hours)
   - Fill gaps in utils, formatters, logging
   - Ensure all helper functions tested
   - Target files: `tests/unit/*.spec.ts`

**Impact:** Completes comprehensive coverage, reduces technical debt

**Success Metrics:**
- All worker handlers have unit tests
- All hooks tested
- Utility coverage >90%

---

## Coverage Threshold Recommendations

### Current Thresholds

```typescript
// vitest.config.ts:39-44
thresholds: {
  lines: 0,
  functions: 20,
  branches: 0,
  statements: 0,
}
```

### Recommended Progressive Targets

#### Phase 1 Targets (After Weeks 1-2)

```typescript
thresholds: {
  lines: 40,
  functions: 50,
  branches: 30,
  statements: 40,
}
```

#### Phase 2 Targets (After Weeks 3-4)

```typescript
thresholds: {
  lines: 60,
  functions: 70,
  branches: 50,
  statements: 60,
}
```

#### Long-term Targets (After Week 6+)

```typescript
thresholds: {
  lines: 80,
  functions: 85,
  branches: 75,
  statements: 80,
}
```

---

## Testing Best Practices to Adopt

### 1. Enforce Test-with-Code Policy

- Require tests for all new API endpoints
- Require tests for all new components
- Block PRs without tests for new features

### 2. Add Pre-commit Hooks

```bash
# .husky/pre-commit
npm run type-check
npm run test:unit:fast
```

### 3. CI/CD Gating

- Block merges if coverage drops below thresholds
- Require all tests to pass before merge
- Run full test suite on main branch

### 4. Coverage Reports in PRs

- Generate coverage reports for each PR
- Show coverage diff in PR comments
- Highlight untested lines

### 5. Test Templates

Create templates for common scenarios:
- API route tests
- Component tests
- Database query tests
- Integration tests

**Example template:**
```typescript
// tests/templates/api-route.template.ts
describe('METHOD /api/v1/endpoint', () => {
  it('should return success for valid request', async () => {
    // Arrange
    const user = await ensureUser({ clerkUserId: 'test' });

    // Act
    const response = await METHOD('/api/v1/endpoint', { userId: user.id });

    // Assert
    expect(response.status).toBe(200);
    expect(response.data).toBeDefined();
  });

  it('should return 401 for unauthenticated request', async () => {
    const response = await METHOD('/api/v1/endpoint');
    expect(response.status).toBe(401);
  });

  it('should enforce RLS', async () => {
    const owner = await ensureUser({ clerkUserId: 'owner' });
    const attacker = await ensureUser({ clerkUserId: 'attacker' });

    // Test cross-tenant access
  });
});
```

---

## Quick Wins (Can Start Today)

These are **pure functions** with no external dependencies, making them easy to test:

1. **Mappers** - `src/lib/mappers/*` (2-3 hours)
   - Pure transformation functions
   - No database or external dependencies
   - Easy to write comprehensive tests

2. **Formatters** - `src/lib/formatters.ts` (1-2 hours)
   - Pure utility functions
   - Predictable inputs/outputs

3. **Response Utilities** - `src/lib/api/response.ts` (1-2 hours)
   - Simple formatting logic
   - No side effects

4. **Hook Test** - `src/hooks/usePlanStatus.ts` (1-2 hours)
   - Single hook file
   - Clear behavior to test

**Total time investment:** 5-9 hours
**Impact:** ~15-20% increase in coverage

---

## Summary

The Atlaris test suite has an **excellent foundation** with good coverage of core business logic (AI, scheduling, workers, OAuth), but needs expansion in three key areas:

### Priority Order

1. **API endpoints** (highest priority) - Production stability
2. **Components** (user-facing risk) - User experience
3. **Mappers and utilities** (data integrity) - Data consistency

### Recommended Approach

1. **Start with Phase 1** (API + utilities) to maximize production stability
2. **Move to Phase 2** (components + queries) for user experience confidence
3. **Complete Phase 3** (workers + hooks) for comprehensive coverage

### Expected Outcomes

- Reduced production bugs
- Faster development cycles (catch regressions early)
- Improved confidence in deployments
- Better onboarding for new developers
- Easier refactoring with safety net

---

## Appendix: Test Coverage by Module

| Module | Unit Tests | Integration Tests | E2E Tests | Coverage Status |
|--------|-----------|-------------------|-----------|-----------------|
| `/lib/ai/` | ✅ 9 files | ✅ 3 files | - | Good (gaps in orchestrator, prompts, parser) |
| `/lib/curation/` | ✅ 4 files | ✅ 1 file | ✅ 1 file | Excellent |
| `/lib/integrations/` | ✅ 5 files | ✅ 7 files | ✅ 2 files | Excellent |
| `/lib/scheduling/` | ✅ 6 files | ✅ 3 files | ✅ 1 file | Excellent |
| `/lib/stripe/` | ✅ 2 files | ✅ 6 files | - | Excellent |
| `/lib/db/queries/` | - | ✅ 4/8 files | - | Partial (50%) |
| `/lib/jobs/` | ✅ 1 file | ✅ 1 file | - | Good |
| `/lib/queue/` | ✅ 1 file | - | - | Good |
| `/lib/logging/` | ✅ 1 file | ✅ 1 file | - | Partial |
| `/lib/metrics/` | - | ✅ 2 files | - | Good |
| `/lib/validation/` | ✅ 1 file | - | - | Partial |
| `/lib/mappers/` | ❌ 0 files | - | - | **None** |
| `/lib/api/` | ⚠️ 1 file | - | - | **Poor** |
| `/workers/` | ✅ 3 files | ✅ 2 files | - | Good |
| `/components/` | ⚠️ 3/40 files | - | ✅ 3 files | **Poor** |
| `/app/api/` | ⚠️ 2/24 files | ✅ 6 files | - | **Poor** |
| `/hooks/` | ❌ 0 files | - | - | **None** |
| RLS/Security | - | ✅ 3 files | ✅ 1 file | Good |

**Legend:**
- ✅ Good coverage
- ⚠️ Partial coverage
- ❌ No coverage

---

## Next Steps

1. **Review this plan** with the team
2. **Prioritize based on current sprint goals**
3. **Assign ownership** for each phase
4. **Create tracking issues** for each area
5. **Set up coverage monitoring** in CI/CD
6. **Schedule regular coverage reviews** (weekly/bi-weekly)

For questions or clarifications, please refer to the test files in `/tests` or the Vitest configuration in `vitest.config.ts`.
