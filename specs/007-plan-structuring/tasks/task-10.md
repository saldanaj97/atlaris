# Phase 10: Create ScheduleWeekList UI Component

**Files:**

- Create: `src/components/plans/ScheduleWeekList.tsx`
- Test: `tests/unit/components/ScheduleWeekList.spec.tsx`

## Step 1: Write the failing test

Create `tests/unit/components/ScheduleWeekList.spec.tsx`:

```typescript
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import ScheduleWeekList from '@/components/plans/ScheduleWeekList';
import type { ScheduleJson } from '@/lib/scheduling/types';

describe('ScheduleWeekList', () => {
  it('should render week headings', () => {
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
      totalWeeks: 1,
      totalSessions: 1,
    };

    render(<ScheduleWeekList schedule={schedule} />);
    expect(screen.getByText(/Week 1/i)).toBeDefined();
  });

  it('should display task titles and time estimates', () => {
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
                  taskTitle: 'Build React App',
                  estimatedMinutes: 90,
                  moduleId: 'mod-1',
                  moduleName: 'Frontend Module',
                },
              ],
            },
          ],
        },
      ],
      totalWeeks: 1,
      totalSessions: 1,
    };

    render(<ScheduleWeekList schedule={schedule} />);
    expect(screen.getByText(/Build React App/i)).toBeDefined();
    expect(screen.getByText(/90 min/i)).toBeDefined();
  });

  it('should display module badges', () => {
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
                  moduleName: 'Core Concepts',
                },
              ],
            },
          ],
        },
      ],
      totalWeeks: 1,
      totalSessions: 1,
    };

    render(<ScheduleWeekList schedule={schedule} />);
    expect(screen.getByText(/Core Concepts/i)).toBeDefined();
  });
});
```

## Step 2: Run test to verify it fails

Run: `pnpm vitest run tests/unit/components/ScheduleWeekList.spec.tsx`
Expected: FAIL with "Cannot find module '@/components/plans/ScheduleWeekList'"

## Step 3: Create ScheduleWeekList component

Create `src/components/plans/ScheduleWeekList.tsx`:

```typescript
import type { ScheduleJson } from '@/lib/scheduling/types';

interface ScheduleWeekListProps {
  schedule: ScheduleJson;
}

export default function ScheduleWeekList({ schedule }: ScheduleWeekListProps) {
  if (schedule.weeks.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
        <p className="text-gray-600">No schedule available yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {schedule.weeks.map((week) => (
        <div key={week.weekNumber} className="rounded-lg border border-gray-200 bg-white p-6">
          {/* Week Header */}
          <div className="mb-4 border-b border-gray-200 pb-3">
            <h3 className="text-lg font-semibold text-gray-900">
              Week {week.weekNumber}
            </h3>
            <p className="text-sm text-gray-600">
              {week.startDate} – {week.endDate}
            </p>
          </div>

          {/* Days and Sessions */}
          <div className="space-y-4">
            {week.days.map((day) => (
              <div key={day.dayNumber} className="rounded-md bg-gray-50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">
                    Day {day.dayNumber} – {day.date}
                  </span>
                  <span className="text-xs text-gray-500">
                    {day.sessions.length} session(s)
                  </span>
                </div>

                {/* Session Tasks */}
                <div className="space-y-2">
                  {day.sessions.map((session) => (
                    <div
                      key={session.taskId}
                      className="flex items-start justify-between rounded border border-gray-200 bg-white p-3"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{session.taskTitle}</p>
                        <span className="mt-1 inline-block rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                          {session.moduleName}
                        </span>
                      </div>
                      <div className="ml-4 text-right">
                        <span className="text-sm font-semibold text-gray-700">
                          {session.estimatedMinutes} min
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

## Step 4: Run test to verify it passes

Run: `pnpm vitest run tests/unit/components/ScheduleWeekList.spec.tsx`
Expected: PASS (3 tests)

## Step 5: Commit

```bash
git add src/components/plans/ScheduleWeekList.tsx tests/unit/components/ScheduleWeekList.spec.tsx
git commit -m "feat: add ScheduleWeekList UI component"
```
