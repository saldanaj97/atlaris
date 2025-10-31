# Phase 7: Create Schedule Validation Function

**Files:**

- Create: `src/lib/scheduling/validate.ts`
- Test: `tests/unit/scheduling/validate.spec.ts`

## Step 1: Write the failing test

Create `tests/unit/scheduling/validate.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  validateSchedule,
  validateTaskResources,
} from '@/lib/scheduling/validate';
import type { ScheduleJson } from '@/lib/scheduling/types';

describe('Schedule Validation', () => {
  describe('validateSchedule', () => {
    it('should validate a correct schedule', () => {
      const schedule: ScheduleJson = {
        weeks: [
          {
            weekNumber: 1,
            startDate: '2025-02-03',
            endDate: '2025-02-09',
            days: [
              {
                dayNumber: 1,
                date: '2025-02-03',
                sessions: [
                  {
                    taskId: 'task-1',
                    taskTitle: 'Task 1',
                    estimatedMinutes: 60,
                    moduleId: 'mod-1',
                    moduleName: 'Module 1',
                  },
                ],
              },
            ],
          },
        ],
        totalWeeks: 1,
        totalSessions: 1,
      };

      expect(() => validateSchedule(schedule)).not.toThrow();
    });

    it('should throw error for empty weeks array', () => {
      const schedule: ScheduleJson = {
        weeks: [],
        totalWeeks: 0,
        totalSessions: 0,
      };

      expect(() => validateSchedule(schedule)).toThrow(
        'Schedule must have at least one week'
      );
    });

    it('should throw error for week with no days', () => {
      const schedule: ScheduleJson = {
        weeks: [
          {
            weekNumber: 1,
            startDate: '2025-02-03',
            endDate: '2025-02-09',
            days: [],
          },
        ],
        totalWeeks: 1,
        totalSessions: 0,
      };

      expect(() => validateSchedule(schedule)).toThrow(
        'Week 1 has no scheduled days'
      );
    });
  });

  describe('validateTaskResources', () => {
    it('should validate tasks with resources', () => {
      const tasks = [
        {
          id: 'task-1',
          title: 'Task 1',
          resources: [{ id: 'res-1', url: 'https://example.com' }],
        },
        {
          id: 'task-2',
          title: 'Task 2',
          resources: [{ id: 'res-2', url: 'https://example.com' }],
        },
      ];

      const result = validateTaskResources(tasks);
      expect(result.valid).toBe(true);
      expect(result.tasksWithoutResources).toHaveLength(0);
    });

    it('should identify tasks without resources', () => {
      const tasks = [
        {
          id: 'task-1',
          title: 'Task 1',
          resources: [],
        },
        {
          id: 'task-2',
          title: 'Task 2',
          resources: [{ id: 'res-1', url: 'https://example.com' }],
        },
      ];

      const result = validateTaskResources(tasks);
      expect(result.valid).toBe(false);
      expect(result.tasksWithoutResources).toHaveLength(1);
      expect(result.tasksWithoutResources[0]).toBe('task-1');
    });
  });
});
```

## Step 2: Run test to verify it fails

Run: `pnpm vitest run tests/unit/scheduling/validate.spec.ts`
Expected: FAIL with "Cannot find module '@/lib/scheduling/validate'"

## Step 3: Create validation implementation

Create `src/lib/scheduling/validate.ts`:

```typescript
import type { ScheduleJson } from './types';

/**
 * Validates a generated schedule for correctness
 */
export function validateSchedule(schedule: ScheduleJson): void {
  if (schedule.weeks.length === 0 && schedule.totalWeeks > 0) {
    throw new Error('Schedule must have at least one week');
  }

  for (const week of schedule.weeks) {
    if (week.days.length === 0) {
      throw new Error(`Week ${week.weekNumber} has no scheduled days`);
    }

    for (const day of week.days) {
      if (day.sessions.length === 0) {
        throw new Error(
          `Week ${week.weekNumber}, Day ${day.dayNumber} has no sessions`
        );
      }

      for (const session of day.sessions) {
        if (!session.taskId || !session.taskTitle) {
          throw new Error(
            `Invalid session in Week ${week.weekNumber}, Day ${day.dayNumber}`
          );
        }

        if (session.estimatedMinutes <= 0) {
          throw new Error(
            `Task ${session.taskId} has invalid estimated minutes: ${session.estimatedMinutes}`
          );
        }
      }
    }
  }
}

interface TaskWithResources {
  id: string;
  title: string;
  resources: Array<{ id: string; url: string }>;
}

interface ValidationResult {
  valid: boolean;
  tasksWithoutResources: string[];
}

/**
 * Validates that all tasks have at least one linked resource
 */
export function validateTaskResources(
  tasks: TaskWithResources[]
): ValidationResult {
  const tasksWithoutResources = tasks
    .filter((task) => !task.resources || task.resources.length === 0)
    .map((task) => task.id);

  return {
    valid: tasksWithoutResources.length === 0,
    tasksWithoutResources,
  };
}
```

## Step 4: Run test to verify it passes

Run: `pnpm vitest run tests/unit/scheduling/validate.spec.ts`
Expected: PASS (5 tests)

## Step 5: Commit

```bash
git add src/lib/scheduling/validate.ts tests/unit/scheduling/validate.spec.ts
git commit -m "feat: add schedule and task resource validation"
```
