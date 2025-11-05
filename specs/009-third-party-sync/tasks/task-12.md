## Task 12: Google Calendar - Event Mapper

**Files:**

- Create: `src/lib/integrations/google-calendar/mapper.ts`
- Create: `tests/unit/integrations/google-calendar-mapper.spec.ts`

**Step 1: Write failing test**

Create `tests/unit/integrations/google-calendar-mapper.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mapTaskToCalendarEvent } from '@/lib/integrations/google-calendar/mapper';
import type { Task } from '@/lib/db/schema';

describe('Google Calendar Event Mapper', () => {
  const mockTask: Task = {
    id: 'task-123',
    moduleId: 'module-123',
    title: 'Learn TypeScript basics',
    description: 'Study primitive types and interfaces',
    order: 1,
    durationMinutes: 60,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('should map task to calendar event with reminder', () => {
    const startTime = new Date('2025-06-01T10:00:00Z');
    const event = mapTaskToCalendarEvent(mockTask, startTime);

    expect(event.summary).toBe('Learn TypeScript basics');
    expect(event.description).toBe('Study primitive types and interfaces');
    expect(event.start.dateTime).toBe('2025-06-01T10:00:00.000Z');
    expect(event.end.dateTime).toBe('2025-06-01T11:00:00.000Z');
    expect(event.reminders.useDefault).toBe(false);
    expect(event.reminders.overrides).toHaveLength(1);
    expect(event.reminders.overrides[0].method).toBe('popup');
    expect(event.reminders.overrides[0].minutes).toBe(15);
  });

  it('should handle tasks without description', () => {
    const taskNoDesc = { ...mockTask, description: null };
    const event = mapTaskToCalendarEvent(taskNoDesc, new Date());

    expect(event.description).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run tests/unit/integrations/google-calendar-mapper.spec.ts
```

Expected: FAIL

**Step 3: Implement mapper**

Create `src/lib/integrations/google-calendar/mapper.ts`:

```typescript
import type { calendar_v3 } from 'googleapis';

interface Task {
  title: string;
  description: string | null;
  durationMinutes: number;
}

export function mapTaskToCalendarEvent(
  task: Task,
  startTime: Date
): calendar_v3.Schema$Event {
  const endTime = new Date(
    startTime.getTime() + task.durationMinutes * 60 * 1000
  );

  const event: calendar_v3.Schema$Event = {
    summary: task.title,
    description: task.description || undefined,
    start: {
      dateTime: startTime.toISOString(),
      timeZone: 'UTC',
    },
    end: {
      dateTime: endTime.toISOString(),
      timeZone: 'UTC',
    },
    reminders: {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: 15 }],
    },
  };

  return event;
}

export function generateSchedule(
  tasks: Task[],
  weeklyHours: number
): Map<string, Date> {
  const schedule = new Map<string, Date>();
  const hoursPerDay = weeklyHours / 7;
  const minutesPerDay = hoursPerDay * 60;

  let currentDate = new Date();
  currentDate.setHours(9, 0, 0, 0); // Start at 9 AM
  let minutesUsedToday = 0;

  tasks.forEach((task) => {
    if (minutesUsedToday + task.durationMinutes > minutesPerDay) {
      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(9, 0, 0, 0);
      minutesUsedToday = 0;
    }

    schedule.set(task.id, new Date(currentDate));

    currentDate = new Date(
      currentDate.getTime() + task.durationMinutes * 60 * 1000
    );
    minutesUsedToday += task.durationMinutes;
  });

  return schedule;
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run tests/unit/integrations/google-calendar-mapper.spec.ts
```

Expected: PASS

**Step 5: Run Coderabbit CLI and implement suggestions**

Run `coderabbit --prompt-only -t uncommitted` and implement any suggestions from the review.

**Step 6: Commit**

```bash
git add src/lib/integrations/google-calendar/mapper.ts tests/unit/integrations/google-calendar-mapper.spec.ts
git commit -m "feat(google): add task-to-calendar event mapper

Implement mapping from learning tasks to Google Calendar events with
start/end times, reminders, and intelligent scheduling.

Changes:
- Add mapTaskToCalendarEvent with 15-min popup reminder
- Add generateSchedule to distribute tasks across days
- Handle timezone (UTC default)

New files:
- src/lib/integrations/google-calendar/mapper.ts
- tests/unit/integrations/google-calendar-mapper.spec.ts

Tests cover:
- Event creation with reminders
- Tasks without description"
```

**Step 7: Open PR into main**

Create a pull request from the current branch into main, following the commit message guidelines.

---
