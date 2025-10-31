# Phase 1: Install date-fns and Create Scheduling Types

**Files:**

- Modify: `package.json`
- Create: `src/lib/scheduling/types.ts`
- Test: `tests/unit/scheduling/types.spec.ts`

## Step 1: Install date-fns package

Run: `pnpm add date-fns`
Expected: Package installed successfully

## Step 2: Write test for type definitions

Create `tests/unit/scheduling/types.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import type {
  ScheduleInputs,
  ScheduleJson,
  Week,
  Day,
  SessionAssignment,
} from '@/lib/scheduling/types';

describe('Scheduling Types', () => {
  it('should define ScheduleInputs type correctly', () => {
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

    expect(inputs.planId).toBe('plan-123');
    expect(inputs.tasks).toHaveLength(1);
  });

  it('should define ScheduleJson type correctly', () => {
    const schedule: ScheduleJson = {
      weeks: [
        {
          weekNumber: 1,
          startDate: '2025-02-01',
          endDate: '2025-02-07',
          days: [
            {
              dayNumber: 1,
              date: '2025-02-03',
              sessions: [
                {
                  taskId: 'task-1',
                  taskTitle: 'Learn TypeScript',
                  estimatedMinutes: 60,
                  moduleId: 'mod-1',
                  moduleName: 'Module 1',
                },
              ],
            },
          ],
        },
      ],
      totalWeeks: 4,
      totalSessions: 12,
    };

    expect(schedule.weeks).toHaveLength(1);
    expect(schedule.totalWeeks).toBe(4);
  });
});
```

## Step 3: Run test to verify it fails

Run: `pnpm vitest run tests/unit/scheduling/types.spec.ts`
Expected: FAIL with "Cannot find module '@/lib/scheduling/types'"

## Step 4: Create scheduling types file

Create `src/lib/scheduling/types.ts`:

```typescript
/**
 * Input data required to compute a schedule
 */
export interface ScheduleInputs {
  planId: string;
  tasks: Array<{
    id: string;
    title: string;
    estimatedMinutes: number;
    order: number;
    moduleId: string;
  }>;
  startDate: string; // ISO date string (YYYY-MM-DD)
  deadline: string | null; // ISO date string (YYYY-MM-DD)
  weeklyHours: number;
  timezone: string; // IANA timezone string
}

/**
 * A single task assignment within a session
 */
export interface SessionAssignment {
  taskId: string;
  taskTitle: string;
  estimatedMinutes: number;
  moduleId: string;
  moduleName: string;
}

/**
 * A day within a week containing scheduled sessions
 */
export interface Day {
  dayNumber: number; // Day number within the week (1-7)
  date: string; // ISO date string
  sessions: SessionAssignment[];
}

/**
 * A week milestone with day/session breakdowns
 */
export interface Week {
  weekNumber: number; // Week number starting from 1
  startDate: string; // ISO date string for week start
  endDate: string; // ISO date string for week end
  days: Day[];
}

/**
 * Complete schedule JSON structure (stored in plan_schedules.schedule_json)
 */
export interface ScheduleJson {
  weeks: Week[];
  totalWeeks: number;
  totalSessions: number;
}

/**
 * Cache metadata for schedule computation
 */
export interface ScheduleCacheRow {
  planId: string;
  scheduleJson: ScheduleJson;
  inputsHash: string;
  generatedAt: Date;
  timezone: string;
  weeklyHours: number;
  startDate: string; // ISO date string
  deadline: string | null; // ISO date string
}
```

## Step 5: Run test to verify it passes

Run: `pnpm vitest run tests/unit/scheduling/types.spec.ts`
Expected: PASS (2 tests)

## Step 6: Commit

```bash
git add package.json pnpm-lock.yaml src/lib/scheduling/types.ts tests/unit/scheduling/types.spec.ts
git commit -m "feat: add scheduling types and date-fns dependency"
```
