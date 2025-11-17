# Phase 3: Refinement (Weeks 5-6)

**Focus:** Comprehensive coverage

1. **Worker Handler Tests** (Est: 4-6 hours)
   - Add unit test for plan-generation-handler
   - Isolate handler logic from integration tests
   - Target files: `tests/unit/workers/handlers/*.spec.ts`

2. **Hook Tests** (Est: 2-3 hours)
   - Add tests for `usePlanStatus`
   - Cover polling, error states, loading states
   - Target files: `tests/unit/hooks/*.spec.ts`

3. **Utility Tests** (Est: 4-6 hours)
   - Fill gaps in utils, formatters, logging
   - Ensure all helper functions tested
   - Target files: `tests/unit/*.spec.ts`

**Impact:** Completes comprehensive coverage, reduces technical debt

**Success Metrics:**

- All worker handlers have unit tests
- All hooks tested
- Utility coverage >90%

---

## Worker Handler Tests - Missing Test

Main worker handler lacks direct unit test:

React hooks that are untested:

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
    const { result } = renderHook(() =>
      usePlanStatus('plan-123', { poll: true })
    );

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

## Implementation breakdown

### Step 1 — Worker handler tests

**Goals**

- Isolate `plan-generation-handler` logic from the worker runtime.
- Ensure state transitions and error handling are well covered without requiring full end-to-end jobs.

**Checklist**

- [ ] Add `tests/unit/workers/handlers/plan-generation-handler.spec.ts` that:
  - Mocks the underlying job queue and AI orchestration services.
  - Covers happy path execution (job moves from `pending` → `processing` → `completed`).
  - Covers failure paths (AI error, DB error), ensuring jobs move to `failed` with useful error messages.
  - Verifies that metrics/logging hooks are called where expected (using spies/mocks).
- [ ] Avoid real DB and external network calls; keep tests in-memory and deterministic.
- [ ] Re-use any factory helpers from integration tests for consistent job payloads.

### Step 2 — Hook tests (`usePlanStatus`)

**Goals**

- Verify that `usePlanStatus` correctly polls the status endpoint and updates local state.
- Ensure the hook behaves correctly across pending, ready, and failed states, including cleanup.

**Checklist**

- [ ] Create `tests/unit/hooks/usePlanStatus.spec.tsx` (or `.spec.ts`) using React Testing Library hooks utilities.
- [ ] Mock `global.fetch` to return:
  - A sequence of `pending` responses followed by `ready`.
  - A response with `failed` and `latestJobError`.
  - Non-OK HTTP statuses (e.g., `500`) to verify error logging behavior.
- [ ] Assert that:
  - The hook sets `isPolling` to `true` while status is `pending`/`processing`, then `false` when terminal states are reached.
  - `attempts` is updated from the server payload.
  - `error` is populated when `latestJobError` is present.
- [ ] Verify that the polling interval is cleared on unmount to avoid memory leaks.

### Step 3 — Utility and logging tests

**Goals**

- Achieve high coverage on core helpers that are used throughout the app.
- Ensure environment configuration and logging behave consistently across environments.

**Utility checklist**

- [ ] `src/lib/utils.ts`:
  - Test `cn` merges class names correctly, including conditional classes and deduplication via Tailwind Merge.
- [ ] `src/lib/formatters.ts`:
  - Test all exported formatting helpers from `./formatters/index` (dates, durations, money, etc.) with representative inputs and edge cases.
- [ ] `src/lib/navigation.ts`:
  - Assert that `authenticatedNavItems` and `unauthenticatedNavItems` contain the expected routes and highlight flags.
- [ ] `src/lib/config/env.ts`:
  - Test `optionalEnv` and `requireEnv` behavior for present/missing values.
  - Test `appEnv` and `loggingEnv` behavior across `NODE_ENV` values (development, test, production).
  - Test that server-only env accessors throw in pure browser environments but work in Node/Vitest.

**Logging checklist**

- [ ] `src/lib/logging/logger.ts`:
  - Verify that the pino logger is created with the expected `level` based on `LOG_LEVEL` and `NODE_ENV`.
  - Confirm that `createLogger` adds context fields and that they appear in log output (can assert on serialized log object when using pino destination in tests).
- [ ] `src/lib/logging/client.ts`:
  - Mock `console.error`, `console.warn`, etc., and assert that `clientLogger.*` delegates correctly.
  - Ensure behavior is safe when specific console methods are missing (falls back to `console.log`).

---

## Milestones, coverage, and validation

**Long-term coverage targets (from context.md)**

- After Phase 3, aim for:

```typescript
thresholds: {
  lines: 80,
  functions: 85,
  branches: 75,
  statements: 80,
}
```

These targets are progressive; adjust as needed based on CI stability and performance.

**Suggested validation flow**

- While iterating:
  - `pnpm vitest tests/unit/workers/handlers -c vitest.config.ts`
  - `pnpm vitest tests/unit/hooks -c vitest.config.ts`
  - `pnpm vitest tests/unit/utils tests/unit/logging -c vitest.config.ts`
- At the end of Phase 3:
  - Run `pnpm test:unit:related` to validate all newly added unit tests.
  - Optionally run a broader suite (`pnpm test:unit:full` or similar) once before raising thresholds in CI.

---

## Phase 3 to-dos (checklist)

- [ ] Add unit tests for `plan-generation-handler` covering success and failure paths.
- [ ] Add hook tests for `usePlanStatus` covering polling, terminal states, and error handling.
- [ ] Add unit tests for `utils.ts`, `formatters.ts`, `navigation.ts`, and key paths in `config/env.ts`.
- [ ] Add unit tests for `logging/logger.ts` and `logging/client.ts`.
- [ ] Raise Vitest coverage thresholds toward long-term targets once all Phase 3 work is stable in CI.
