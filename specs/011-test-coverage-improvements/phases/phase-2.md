# Phase 2: Important (Weeks 3-4)

**Focus:** User experience and UI stability

1. **Component Tests** (Est: 12-16 hours)
   - Focus on critical user flows (onboarding, regeneration, billing)
   - Add tests for 10-15 priority components
   - Target files: `tests/unit/components/*.spec.tsx`

2. **Database Query Tests** (Est: 4-6 hours)
   - Add integration tests for missing query modules
   - Ensure RLS enforcement on all queries
   - Target files: `tests/integration/db/*.spec.ts`

3. **AI Pipeline Tests** (Est: 6-8 hours)
   - Add unit tests for orchestrator, prompts, parser
   - Cover error recovery and edge cases
   - Target files: `tests/unit/ai/*.spec.ts`

**Impact:** Improves UI stability, prevents regressions, better AI reliability

**Success Metrics:**

- Critical components (10+) have test coverage
- All database query modules tested
- AI pipeline has >70% coverage

---

## Component Testing - Severely Limited

Only **3 out of 40+ components** have tests:

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

## Implementation breakdown

### Step 1 — Component tests (critical flows)

**Goals**

- Cover the most important user journeys: onboarding, plan regeneration, and billing.
- Ensure UI state transitions, loading states, and error messages are exercised.

**Priority components and suggested specs**

- Plans/learning experience:
  - `src/components/OnboardingForm.tsx` → `tests/unit/components/OnboardingForm.spec.tsx`
  - `src/components/PlansList.tsx` → `tests/unit/components/PlansList.spec.tsx`
  - `src/components/PlanDetails.tsx` → `tests/unit/components/PlanDetails.spec.tsx`
  - `src/components/RegenerateButton.tsx` → `tests/unit/components/RegenerateButton.spec.tsx`
  - `src/components/PlanModuleCard.tsx` → `tests/unit/components/PlanModuleCard.spec.tsx`
  - `src/components/UpdateTaskStatusButton.tsx` → `tests/unit/components/UpdateTaskStatusButton.spec.tsx`
- Billing:
  - `src/components/billing/SubscribeButton.tsx` → `tests/unit/components/SubscribeButton.spec.tsx`
  - `src/components/billing/ManageSubscriptionButton.tsx` → `tests/unit/components/ManageSubscriptionButton.spec.tsx`
  - `src/components/billing/PricingGrid.tsx` / `PricingCard.tsx` → `tests/unit/components/PricingGrid.spec.tsx`
  - `src/components/billing/MonthlyPricingCards.tsx` / `YearlyPricingCards.tsx` → `tests/unit/components/PricingCards.spec.tsx`
- Shared layout:
  - `src/components/shared/SiteHeader.tsx` / `SiteHeaderClient.tsx`
  - `src/components/shared/SiteFooter.tsx`
  - `src/components/shared/AuthControls.tsx`

**Checklist**

- [ ] Use React Testing Library with jsdom (`@testing-library/react`) and existing `tests/setup.ts`.
- [ ] Prefer testing observable behavior (rendered text, ARIA roles, button enabled/disabled) over implementation details.
- [ ] For components that call APIs, mock `fetch`/workers at the boundary and assert on loading/error states.
- [ ] For billing components, verify that the correct Stripe checkout/intents functions are called (mocked) with expected parameters.
- [ ] For list/detail components, test empty states, loading states, and populated states.
- [ ] Add regression tests for any bugs discovered during implementation.

**Milestones**

- **Week 3, early:** Cover `RegenerateButton`, `OnboardingForm`, and `PlansList`.
- **Week 3, late:** Cover `UpdateTaskStatusButton`, `PlanModuleCard`, and key billing buttons.
- **Week 4:** Cover shared layout components and remaining high-traffic UI pieces.

### Step 2 — Database query tests

**Goals**

- Ensure all query modules in `src/lib/db/queries/*` have at least one integration test.
- Validate RLS and ownership constraints for user-, schedule-, module-, and job-related operations.

**Checklist**

- [ ] Create `tests/integration/db/users.queries.spec.ts`:
  - Verify user creation/lookup functions.
  - Assert cross-tenant isolation (no leakage across different Clerk users).
- [ ] Create `tests/integration/db/schedules.queries.spec.ts`:
  - Verify retrieval of schedules per plan, including ordering.
  - Assert that schedules cannot be read by a non-owner user.
- [ ] Create `tests/integration/db/modules.queries.spec.ts`:
  - Verify module ordering and retrieval.
  - Cover deletion/cascade behavior where appropriate.
- [ ] Create `tests/integration/db/jobs.queries.spec.ts`:
  - Verify job insertion, status transitions, and cleanup queries.
  - Assert that helper functions handle missing or stuck jobs gracefully.
- [ ] Use existing patterns from `plans.ts`, `tasks.ts`, and `resources.ts` integration tests to keep style consistent.
- [ ] Run only the new/related integration tests while iterating to avoid long feedback cycles.

### Step 3 — AI pipeline tests

**Goals**

- Directly test orchestration logic rather than relying only on end-to-end behavior.
- Validate prompt construction and parsing for realistic inputs and edge cases.

**Checklist**

- [ ] Add `tests/unit/ai/orchestrator.spec.ts` covering:
  - Provider selection and fallback behavior when the primary provider fails.
  - Retry behavior (including max attempts and backoff if implemented).
  - Error classification and propagation back to callers.
- [ ] Add `tests/unit/ai/prompts.spec.ts` covering:
  - Prompt construction for plan generation with different skill levels, durations, and learning styles.
  - Input sanitization to avoid leaking HTML/JS or unsafe characters into prompts.
- [ ] Add `tests/unit/ai/parser.spec.ts` covering:
  - Parsing of valid AI responses into internal schema types.
  - Behavior on malformed responses (missing modules/tasks, invalid durations).
  - Fallback behavior when partial data can be recovered.
- [ ] Keep AI tests purely in-memory; no network calls to actual providers.

---

## Milestones, coverage, and validation

**Coverage targets (from context.md)**

- After Phase 2, increase thresholds toward:

```typescript
thresholds: {
  lines: 60,
  functions: 70,
  branches: 50,
  statements: 60,
}
```

**Suggested validation flow**

- While iterating on components:
  - `pnpm vitest tests/unit/components -c vitest.config.ts`
- While iterating on DB queries:
  - `pnpm vitest tests/integration/db -c vitest.config.ts`
- While iterating on AI pipeline:
  - `pnpm vitest tests/unit/ai -c vitest.config.ts`
- Before raising thresholds:
  - Run `pnpm test:unit:related` and `pnpm test:integration:related` to ensure affected suites are stable.

---

## Phase 2 to-dos (checklist)

- [ ] Add unit tests for 10–15 priority components listed above.
- [ ] Ensure critical onboarding, regeneration, and billing flows are covered end-to-end at the component level.
- [ ] Add integration tests for `users.ts`, `schedules.ts`, `modules.ts`, and `jobs.ts` query modules.
- [ ] Add unit tests for `orchestrator.ts`, `prompts.ts`, and `parser.ts` in the AI pipeline.
- [ ] Confirm Phase 2 coverage meets or exceeds the recommended thresholds before moving to Phase 3.
