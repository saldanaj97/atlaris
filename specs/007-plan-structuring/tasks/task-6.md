# Phase 6: Create Schedule Generation Function

**Files:**

- Create: `src/lib/scheduling/generate.ts`
- Test: `tests/unit/scheduling/generate.spec.ts`

## Step 1: Write the failing test

Create `tests/unit/scheduling/generate.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { generateSchedule } from '@/lib/scheduling/generate';
import type { ScheduleInputs } from '@/lib/scheduling/types';

describe('generateSchedule', () => {
  it('should generate complete schedule from inputs', () => {
    const inputs: ScheduleInputs = {
      planId: 'plan-123',
      tasks: [
        {
          id: 'task-1',
          title: 'Learn React',
          estimatedMinutes: 120,
          order: 1,
          moduleId: 'mod-1',
        },
        {
          id: 'task-2',
          title: 'Build Project',
          estimatedMinutes: 180,
          order: 2,
          moduleId: 'mod-1',
        },
      ],
      startDate: '2025-02-03',
      deadline: null,
      weeklyHours: 5,
      timezone: 'America/New_York',
    };

    const schedule = generateSchedule(inputs);

    expect(schedule.weeks.length).toBeGreaterThan(0);
    expect(schedule.totalWeeks).toBeGreaterThan(0);
    expect(schedule.totalSessions).toBeGreaterThan(0);
  });

  it('should be deterministic - same inputs produce same output', () => {
    const inputs: ScheduleInputs = {
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
      startDate: '2025-02-03',
      deadline: null,
      weeklyHours: 10,
      timezone: 'UTC',
    };

    const schedule1 = generateSchedule(inputs);
    const schedule2 = generateSchedule(inputs);

    expect(JSON.stringify(schedule1)).toBe(JSON.stringify(schedule2));
  });

  it('should handle empty task list', () => {
    const inputs: ScheduleInputs = {
      planId: 'plan-123',
      tasks: [],
      startDate: '2025-02-03',
      deadline: null,
      weeklyHours: 10,
      timezone: 'UTC',
    };

    const schedule = generateSchedule(inputs);

    expect(schedule.weeks).toHaveLength(0);
    expect(schedule.totalWeeks).toBe(0);
    expect(schedule.totalSessions).toBe(0);
  });
});
```

## Step 2: Run test to verify it fails

Run: `pnpm vitest run tests/unit/scheduling/generate.spec.ts`
Expected: FAIL with "Cannot find module '@/lib/scheduling/generate'"

## Step 3: Create schedule generation implementation

Create `src/lib/scheduling/generate.ts`:

```typescript
import type { ScheduleInputs, ScheduleJson } from './types';
import { distributeTasksToSessions } from './distribute';

/**
 * Generates a deterministic schedule from plan inputs.
 * This is the main entry point for schedule computation.
 */
export function generateSchedule(inputs: ScheduleInputs): ScheduleJson {
  // Validate inputs
  if (!inputs.tasks || inputs.tasks.length === 0) {
    return {
      weeks: [],
      totalWeeks: 0,
      totalSessions: 0,
    };
  }

  // Generate schedule using distribution logic
  const schedule = distributeTasksToSessions(inputs);

  return schedule;
}
```

## Step 4: Run test to verify it passes

Run: `pnpm vitest run tests/unit/scheduling/generate.spec.ts`
Expected: PASS (3 tests)

## Step 5: Commit

```bash
git add src/lib/scheduling/generate.ts tests/unit/scheduling/generate.spec.ts
git commit -m "feat: add deterministic schedule generation function"
```
