# Phase 2: Create Inputs Hash Function

**Files:**

- Create: `src/lib/scheduling/hash.ts`
- Test: `tests/unit/scheduling/hash.spec.ts`

## Step 1: Write the failing test

Create `tests/unit/scheduling/hash.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { computeInputsHash } from '@/lib/scheduling/hash';
import type { ScheduleInputs } from '@/lib/scheduling/types';

describe('computeInputsHash', () => {
  it('should produce same hash for identical inputs', () => {
    const inputs: ScheduleInputs = {
      planId: 'plan-123',
      tasks: [
        {
          id: 'task-1',
          title: 'Learn TypeScript',
          estimatedMinutes: 60,
          order: 1,
          moduleId: 'mod-1',
        },
      ],
      startDate: '2025-02-01',
      deadline: '2025-03-01',
      weeklyHours: 10,
      timezone: 'America/New_York',
    };

    const hash1 = computeInputsHash(inputs);
    const hash2 = computeInputsHash(inputs);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
  });

  it('should produce different hash when task order changes', () => {
    const inputs1: ScheduleInputs = {
      planId: 'plan-123',
      tasks: [
        {
          id: 'task-1',
          title: 'Task 1',
          estimatedMinutes: 60,
          order: 1,
          moduleId: 'mod-1',
        },
        {
          id: 'task-2',
          title: 'Task 2',
          estimatedMinutes: 60,
          order: 2,
          moduleId: 'mod-1',
        },
      ],
      startDate: '2025-02-01',
      deadline: '2025-03-01',
      weeklyHours: 10,
      timezone: 'America/New_York',
    };

    const inputs2: ScheduleInputs = {
      ...inputs1,
      tasks: [inputs1.tasks[1], inputs1.tasks[0]], // Swapped order
    };

    const hash1 = computeInputsHash(inputs1);
    const hash2 = computeInputsHash(inputs2);

    expect(hash1).not.toBe(hash2);
  });

  it('should produce different hash when start date changes', () => {
    const inputs1: ScheduleInputs = {
      planId: 'plan-123',
      tasks: [
        {
          id: 'task-1',
          title: 'Task 1',
          estimatedMinutes: 60,
          order: 1,
          moduleId: 'mod-1',
        },
      ],
      startDate: '2025-02-01',
      deadline: '2025-03-01',
      weeklyHours: 10,
      timezone: 'America/New_York',
    };

    const inputs2: ScheduleInputs = {
      ...inputs1,
      startDate: '2025-02-02',
    };

    const hash1 = computeInputsHash(inputs1);
    const hash2 = computeInputsHash(inputs2);

    expect(hash1).not.toBe(hash2);
  });
});
```

## Step 2: Run test to verify it fails

Run: `pnpm vitest run tests/unit/scheduling/hash.spec.ts`
Expected: FAIL with "Cannot find module '@/lib/scheduling/hash'"

## Step 3: Create hash function implementation

Create `src/lib/scheduling/hash.ts`:

```typescript
import crypto from 'crypto';
import type { ScheduleInputs } from './types';

/**
 * Computes a deterministic hash of schedule inputs for cache validation.
 * Hash changes when any input that affects schedule calculation changes.
 */
export function computeInputsHash(inputs: ScheduleInputs): string {
  // Create canonical representation of inputs
  const canonical = {
    planId: inputs.planId,
    // Sort tasks by order to ensure consistent ordering
    tasks: inputs.tasks
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((t) => ({
        id: t.id,
        title: t.title,
        estimatedMinutes: t.estimatedMinutes,
        order: t.order,
        moduleId: t.moduleId,
      })),
    startDate: inputs.startDate,
    deadline: inputs.deadline,
    weeklyHours: inputs.weeklyHours,
    timezone: inputs.timezone,
  };

  // Compute SHA-256 hash of JSON representation
  const jsonString = JSON.stringify(canonical);
  return crypto.createHash('sha256').update(jsonString).digest('hex');
}
```

## Step 4: Run test to verify it passes

Run: `pnpm vitest run tests/unit/scheduling/hash.spec.ts`
Expected: PASS (3 tests)

## Step 5: Commit

```bash
git add src/lib/scheduling/hash.ts tests/unit/scheduling/hash.spec.ts
git commit -m "feat: add deterministic schedule inputs hash function"
```
