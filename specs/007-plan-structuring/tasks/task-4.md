# Phase 4: Create Session Distribution Logic

**Files:**

- Create: `src/lib/scheduling/distribute.ts`
- Test: `tests/unit/scheduling/distribute.spec.ts`

## Step 1: Write the failing test

Create `tests/unit/scheduling/distribute.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { distributeTasksToSessions } from '@/lib/scheduling/distribute';
import type { ScheduleInputs } from '@/lib/scheduling/types';

describe('distributeTasksToSessions', () => {
  it('should distribute tasks evenly across default 3 sessions per week', () => {
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
        {
          id: 'task-2',
          title: 'Task 2',
          estimatedMinutes: 90,
          order: 2,
          moduleId: 'mod-1',
        },
      ],
      startDate: '2025-02-03', // Monday
      deadline: null,
      weeklyHours: 10,
      timezone: 'UTC',
    };

    const schedule = distributeTasksToSessions(inputs);

    expect(schedule.weeks).toHaveLength(1);
    expect(schedule.weeks[0].days).toHaveLength(3); // Mon, Wed, Fri
    expect(schedule.totalSessions).toBe(3);
  });

  it('should calculate correct total weeks based on total minutes and weekly hours', () => {
    const inputs: ScheduleInputs = {
      planId: 'plan-123',
      tasks: [
        {
          id: 'task-1',
          title: 'Task 1',
          estimatedMinutes: 600, // 10 hours
          order: 1,
          moduleId: 'mod-1',
        },
      ],
      startDate: '2025-02-03',
      deadline: null,
      weeklyHours: 5, // 5 hours per week = 2 weeks needed
      timezone: 'UTC',
    };

    const schedule = distributeTasksToSessions(inputs);

    expect(schedule.totalWeeks).toBe(2);
  });

  it('should respect task order when distributing', () => {
    const inputs: ScheduleInputs = {
      planId: 'plan-123',
      tasks: [
        {
          id: 'task-1',
          title: 'First Task',
          estimatedMinutes: 30,
          order: 1,
          moduleId: 'mod-1',
        },
        {
          id: 'task-2',
          title: 'Second Task',
          estimatedMinutes: 30,
          order: 2,
          moduleId: 'mod-1',
        },
        {
          id: 'task-3',
          title: 'Third Task',
          estimatedMinutes: 30,
          order: 3,
          moduleId: 'mod-1',
        },
      ],
      startDate: '2025-02-03',
      deadline: null,
      weeklyHours: 10,
      timezone: 'UTC',
    };

    const schedule = distributeTasksToSessions(inputs);
    const firstSession = schedule.weeks[0].days[0].sessions[0];

    expect(firstSession.taskId).toBe('task-1');
    expect(firstSession.taskTitle).toBe('First Task');
  });

  it('should use Mon/Wed/Fri as default session days from start anchor', () => {
    const inputs: ScheduleInputs = {
      planId: 'plan-123',
      tasks: [
        {
          id: 'task-1',
          title: 'Task 1',
          estimatedMinutes: 90,
          order: 1,
          moduleId: 'mod-1',
        },
      ],
      startDate: '2025-02-03', // Monday
      deadline: null,
      weeklyHours: 10,
      timezone: 'UTC',
    };

    const schedule = distributeTasksToSessions(inputs);
    const days = schedule.weeks[0].days;

    expect(days[0].date).toBe('2025-02-03'); // Mon
    expect(days[1].date).toBe('2025-02-05'); // Wed
    expect(days[2].date).toBe('2025-02-07'); // Fri
  });
});
```

## Step 2: Run test to verify it fails

Run: `pnpm vitest run tests/unit/scheduling/distribute.spec.ts`
Expected: FAIL with "Cannot find module '@/lib/scheduling/distribute'"

## Step 3: Create session distribution implementation

Create `src/lib/scheduling/distribute.ts`:

```typescript
import type {
  ScheduleInputs,
  ScheduleJson,
  Week,
  Day,
  SessionAssignment,
} from './types';
import { addDaysToDate, getWeekBoundaries } from './dates';

const DEFAULT_SESSIONS_PER_WEEK = 3;
const SESSION_DAYS_OFFSET = [0, 2, 4]; // Mon, Wed, Fri (0=Mon, 2=Wed, 4=Fri)

/**
 * Distributes tasks across sessions in a week-based structure
 */
export function distributeTasksToSessions(
  inputs: ScheduleInputs
): ScheduleJson {
  // Calculate total minutes and required weeks
  const totalMinutes = inputs.tasks.reduce(
    (sum, t) => sum + t.estimatedMinutes,
    0
  );
  const minutesPerWeek = inputs.weeklyHours * 60;
  const totalWeeks = Math.ceil(totalMinutes / minutesPerWeek);

  // Sort tasks by order to ensure deterministic distribution
  const sortedTasks = inputs.tasks.slice().sort((a, b) => a.order - b.order);

  // Distribute tasks across weeks and sessions
  const weeks: Week[] = [];
  let taskIndex = 0;
  let remainingTaskMinutes = sortedTasks[0]?.estimatedMinutes || 0;

  for (let weekNum = 1; weekNum <= totalWeeks; weekNum++) {
    const { startDate, endDate } = getWeekBoundaries(inputs.startDate, weekNum);
    const days: Day[] = [];

    // Create 3 session days (Mon, Wed, Fri) per week
    for (
      let sessionIdx = 0;
      sessionIdx < DEFAULT_SESSIONS_PER_WEEK;
      sessionIdx++
    ) {
      const dayOffset = SESSION_DAYS_OFFSET[sessionIdx];
      const date = addDaysToDate(startDate, dayOffset);
      const sessions: SessionAssignment[] = [];

      // Allocate time for this session (equal distribution)
      const sessionMinutes = minutesPerWeek / DEFAULT_SESSIONS_PER_WEEK;
      let allocatedMinutes = 0;

      // Fill session with tasks
      while (
        allocatedMinutes < sessionMinutes &&
        taskIndex < sortedTasks.length
      ) {
        const currentTask = sortedTasks[taskIndex];

        sessions.push({
          taskId: currentTask.id,
          taskTitle: currentTask.title,
          estimatedMinutes: remainingTaskMinutes,
          moduleId: currentTask.moduleId,
          moduleName: `Module ${currentTask.moduleId}`, // Will be enriched later
        });

        allocatedMinutes += remainingTaskMinutes;

        // Move to next task if current is exhausted
        if (
          allocatedMinutes >= sessionMinutes ||
          remainingTaskMinutes <= sessionMinutes - allocatedMinutes
        ) {
          taskIndex++;
          remainingTaskMinutes = sortedTasks[taskIndex]?.estimatedMinutes || 0;
        } else {
          remainingTaskMinutes -= sessionMinutes - allocatedMinutes;
          break;
        }
      }

      if (sessions.length > 0) {
        days.push({
          dayNumber: sessionIdx + 1,
          date,
          sessions,
        });
      }
    }

    weeks.push({
      weekNumber: weekNum,
      startDate,
      endDate,
      days,
    });
  }

  return {
    weeks,
    totalWeeks,
    totalSessions: weeks.reduce((sum, w) => sum + w.days.length, 0),
  };
}
```

## Step 4: Run test to verify it passes

Run: `pnpm vitest run tests/unit/scheduling/distribute.spec.ts`
Expected: PASS (4 tests)

## Step 5: Commit

```bash
git add src/lib/scheduling/distribute.ts tests/unit/scheduling/distribute.spec.ts
git commit -m "feat: add session distribution logic for week-based scheduling"
```
