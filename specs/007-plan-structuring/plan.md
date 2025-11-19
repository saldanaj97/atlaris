# Week-Based Plan Structuring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform module/task structure into week-based milestone system with dated schedules, deterministic compute-on-read architecture with JSON caching, and UI toggle between module/schedule views.

**Architecture:** Compute-on-read with write-through JSON cache per plan. Schedule calculation happens server-side using deterministic date-fns functions, with results cached in a new `plan_schedules` table. UI fetches pre-computed schedules via server-side API composition. No per-task schedule rows in MVP - all schedule data stored as JSONB in cache table.

**Tech Stack:** date-fns (date calculations), Drizzle ORM (schema/migrations), Next.js 15 App Router (server components), React 19 (client UI), TypeScript, PostgreSQL (JSONB), RLS policies (neon)

---

## Task 1: Install date-fns and Create Scheduling Types

**Files:**

- Modify: `package.json`
- Create: `src/lib/scheduling/types.ts`
- Test: `tests/unit/scheduling/types.spec.ts`

### Step 1: Install date-fns package

Run: `pnpm add date-fns`
Expected: Package installed successfully

### Step 2: Write test for type definitions

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

### Step 3: Run test to verify it fails

Run: `pnpm vitest run tests/unit/scheduling/types.spec.ts`
Expected: FAIL with "Cannot find module '@/lib/scheduling/types'"

### Step 4: Create scheduling types file

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

### Step 5: Run test to verify it passes

Run: `pnpm vitest run tests/unit/scheduling/types.spec.ts`
Expected: PASS (2 tests)

### Step 6: Commit

```bash
git add package.json pnpm-lock.yaml src/lib/scheduling/types.ts tests/unit/scheduling/types.spec.ts
git commit -m "feat: add scheduling types and date-fns dependency"
```

---

## Task 2: Create Inputs Hash Function

**Files:**

- Create: `src/lib/scheduling/hash.ts`
- Test: `tests/unit/scheduling/hash.spec.ts`

### Step 1: Write the failing test

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

### Step 2: Run test to verify it fails

Run: `pnpm vitest run tests/unit/scheduling/hash.spec.ts`
Expected: FAIL with "Cannot find module '@/lib/scheduling/hash'"

### Step 3: Create hash function implementation

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

### Step 4: Run test to verify it passes

Run: `pnpm vitest run tests/unit/scheduling/hash.spec.ts`
Expected: PASS (3 tests)

### Step 5: Commit

```bash
git add src/lib/scheduling/hash.ts tests/unit/scheduling/hash.spec.ts
git commit -m "feat: add deterministic schedule inputs hash function"
```

---

## Task 3: Create Date Utility Functions

**Files:**

- Create: `src/lib/scheduling/dates.ts`
- Test: `tests/unit/scheduling/dates.spec.ts`

### Step 1: Write the failing test

Create `tests/unit/scheduling/dates.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  addDaysToDate,
  addWeeksToDate,
  getWeekBoundaries,
  formatDateISO,
  parseISODate,
  getDaysBetween,
} from '@/lib/scheduling/dates';

describe('Date Utilities', () => {
  describe('addDaysToDate', () => {
    it('should add days to a date', () => {
      const result = addDaysToDate('2025-02-01', 7);
      expect(result).toBe('2025-02-08');
    });

    it('should handle month boundaries', () => {
      const result = addDaysToDate('2025-02-28', 1);
      expect(result).toBe('2025-03-01');
    });

    it('should handle negative days', () => {
      const result = addDaysToDate('2025-02-10', -5);
      expect(result).toBe('2025-02-05');
    });
  });

  describe('addWeeksToDate', () => {
    it('should add weeks to a date', () => {
      const result = addWeeksToDate('2025-02-01', 2);
      expect(result).toBe('2025-02-15');
    });
  });

  describe('getWeekBoundaries', () => {
    it('should calculate week boundaries from anchor date', () => {
      const { startDate, endDate } = getWeekBoundaries('2025-02-03', 1);
      expect(startDate).toBe('2025-02-03');
      expect(endDate).toBe('2025-02-09');
    });

    it('should calculate week 2 boundaries', () => {
      const { startDate, endDate } = getWeekBoundaries('2025-02-03', 2);
      expect(startDate).toBe('2025-02-10');
      expect(endDate).toBe('2025-02-16');
    });
  });

  describe('formatDateISO', () => {
    it('should format Date to ISO string', () => {
      const date = new Date('2025-02-01T12:00:00Z');
      const result = formatDateISO(date);
      expect(result).toBe('2025-02-01');
    });
  });

  describe('parseISODate', () => {
    it('should parse ISO string to Date', () => {
      const result = parseISODate('2025-02-01');
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(1); // February (0-indexed)
      expect(result.getDate()).toBe(1);
    });
  });

  describe('getDaysBetween', () => {
    it('should calculate days between two dates', () => {
      const days = getDaysBetween('2025-02-01', '2025-02-08');
      expect(days).toBe(7);
    });

    it('should handle negative differences', () => {
      const days = getDaysBetween('2025-02-08', '2025-02-01');
      expect(days).toBe(-7);
    });
  });
});
```

### Step 2: Run test to verify it fails

Run: `pnpm vitest run tests/unit/scheduling/dates.spec.ts`
Expected: FAIL with "Cannot find module '@/lib/scheduling/dates'"

### Step 3: Create date utilities implementation

Create `src/lib/scheduling/dates.ts`:

```typescript
import {
  addDays,
  addWeeks,
  differenceInDays,
  format,
  parseISO,
} from 'date-fns';

/**
 * Add days to an ISO date string
 */
export function addDaysToDate(isoDate: string, days: number): string {
  const date = parseISO(isoDate);
  const result = addDays(date, days);
  return format(result, 'yyyy-MM-dd');
}

/**
 * Add weeks to an ISO date string
 */
export function addWeeksToDate(isoDate: string, weeks: number): string {
  const date = parseISO(isoDate);
  const result = addWeeks(date, weeks);
  return format(result, 'yyyy-MM-dd');
}

/**
 * Calculate week boundaries based on anchor date and week number
 * Week 1 starts on the anchor date (not forced to Monday)
 */
export function getWeekBoundaries(
  anchorDate: string,
  weekNumber: number
): { startDate: string; endDate: string } {
  const anchor = parseISO(anchorDate);
  const weeksToAdd = weekNumber - 1; // Week 1 starts at anchor
  const weekStart = addWeeks(anchor, weeksToAdd);
  const weekEnd = addDays(weekStart, 6); // 7 days total (inclusive)

  return {
    startDate: format(weekStart, 'yyyy-MM-dd'),
    endDate: format(weekEnd, 'yyyy-MM-dd'),
  };
}

/**
 * Format Date object to ISO date string (YYYY-MM-DD)
 */
export function formatDateISO(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * Parse ISO date string to Date object
 */
export function parseISODate(isoDate: string): Date {
  return parseISO(isoDate);
}

/**
 * Calculate number of days between two ISO date strings
 */
export function getDaysBetween(startDate: string, endDate: string): number {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  return differenceInDays(end, start);
}
```

### Step 4: Run test to verify it passes

Run: `pnpm vitest run tests/unit/scheduling/dates.spec.ts`
Expected: PASS (10 tests)

### Step 5: Commit

```bash
git add src/lib/scheduling/dates.ts tests/unit/scheduling/dates.spec.ts
git commit -m "feat: add date utility functions for schedule calculations"
```

---

## Task 4: Create Session Distribution Logic

**Files:**

- Create: `src/lib/scheduling/distribute.ts`
- Test: `tests/unit/scheduling/distribute.spec.ts`

### Step 1: Write the failing test

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

### Step 2: Run test to verify it fails

Run: `pnpm vitest run tests/unit/scheduling/distribute.spec.ts`
Expected: FAIL with "Cannot find module '@/lib/scheduling/distribute'"

### Step 3: Create session distribution implementation

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

### Step 4: Run test to verify it passes

Run: `pnpm vitest run tests/unit/scheduling/distribute.spec.ts`
Expected: PASS (4 tests)

### Step 5: Commit

```bash
git add src/lib/scheduling/distribute.ts tests/unit/scheduling/distribute.spec.ts
git commit -m "feat: add session distribution logic for week-based scheduling"
```

---

## Task 5: Create Plan Schedules Database Table

**Files:**

- Modify: `src/lib/db/schema.ts`
- Create: `src/lib/db/migrations/NNNN_add_plan_schedules_table.sql` (generated)

### Step 1: Write test for plan schedules schema

Create `tests/unit/scheduling/schema.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { planSchedules } from '@/lib/db/schema';

describe('Plan Schedules Schema', () => {
  it('should have plan_schedules table defined', () => {
    expect(planSchedules).toBeDefined();
  });

  it('should have correct column structure', () => {
    const columns = Object.keys(planSchedules);
    expect(columns).toContain('planId');
    expect(columns).toContain('scheduleJson');
    expect(columns).toContain('inputsHash');
    expect(columns).toContain('generatedAt');
    expect(columns).toContain('timezone');
    expect(columns).toContain('weeklyHours');
    expect(columns).toContain('startDate');
    expect(columns).toContain('deadline');
  });
});
```

### Step 2: Run test to verify it fails

Run: `pnpm vitest run tests/unit/scheduling/schema.spec.ts`
Expected: FAIL with "Cannot find name 'planSchedules'"

### Step 3: Add plan_schedules table to schema

Modify `src/lib/db/schema.ts` - add after `learningPlans` table definition:

```typescript
// Plan schedules table (JSON cache for computed schedules)
export const planSchedules = pgTable(
  'plan_schedules',
  {
    planId: uuid('plan_id')
      .primaryKey()
      .references(() => learningPlans.id, { onDelete: 'cascade' }),
    scheduleJson: jsonb('schedule_json').notNull(),
    inputsHash: text('inputs_hash').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    timezone: text('timezone').notNull(),
    weeklyHours: integer('weekly_hours').notNull(),
    startDate: date('start_date').notNull(),
    deadline: date('deadline'),
  },
  (table) => [
    index('idx_plan_schedules_inputs_hash').on(table.inputsHash),

    // RLS Policies

    // Users can read schedule cache for their own plans
    pgPolicy('plan_schedules_select_own', {
      for: 'select',
      to: authenticatedRole,
      using: sql`
        EXISTS (
          SELECT 1 FROM ${learningPlans}
          WHERE ${learningPlans.id} = ${table.planId}
          AND ${learningPlans.userId} IN (
            SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
          )
        )
      `,
    }),

    // Service role can read all schedules
    pgPolicy('plan_schedules_select_service', {
      for: 'select',
      to: serviceRole,
      using: sql`true`,
    }),

    // Users can upsert schedule cache for their own plans
    pgPolicy('plan_schedules_insert_own', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: sql`
        EXISTS (
          SELECT 1 FROM ${learningPlans}
          WHERE ${learningPlans.id} = ${table.planId}
          AND ${learningPlans.userId} IN (
            SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
          )
        )
      `,
    }),

    pgPolicy('plan_schedules_update_own', {
      for: 'update',
      to: authenticatedRole,
      using: sql`
        EXISTS (
          SELECT 1 FROM ${learningPlans}
          WHERE ${learningPlans.id} = ${table.planId}
          AND ${learningPlans.userId} IN (
            SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
          )
        )
      `,
      withCheck: sql`
        EXISTS (
          SELECT 1 FROM ${learningPlans}
          WHERE ${learningPlans.id} = ${table.planId}
          AND ${learningPlans.userId} IN (
            SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
          )
        )
      `,
    }),

    // Service role can manage all schedules
    pgPolicy('plan_schedules_insert_service', {
      for: 'insert',
      to: serviceRole,
      withCheck: sql`true`,
    }),

    pgPolicy('plan_schedules_update_service', {
      for: 'update',
      to: serviceRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),

    // Users can delete schedule cache for their own plans
    pgPolicy('plan_schedules_delete_own', {
      for: 'delete',
      to: authenticatedRole,
      using: sql`
        EXISTS (
          SELECT 1 FROM ${learningPlans}
          WHERE ${learningPlans.id} = ${table.planId}
          AND ${learningPlans.userId} IN (
            SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
          )
        )
      `,
    }),

    pgPolicy('plan_schedules_delete_service', {
      for: 'delete',
      to: serviceRole,
      using: sql`true`,
    }),
  ]
).enableRLS();
```

### Step 4: Generate migration

Run: `pnpm db:generate`
Expected: Migration file created in `src/lib/db/migrations/`

### Step 5: Apply migration to test database

Run: `pnpm db:push`
Expected: "Database schema updated successfully"

### Step 6: Run test to verify it passes

Run: `pnpm vitest run tests/unit/scheduling/schema.spec.ts`
Expected: PASS (2 tests)

### Step 7: Commit

```bash
git add src/lib/db/schema.ts src/lib/db/migrations/* tests/unit/scheduling/schema.spec.ts
git commit -m "feat: add plan_schedules table with RLS policies"
```

---

## Task 6: Create Schedule Generation Function

**Files:**

- Create: `src/lib/scheduling/generate.ts`
- Test: `tests/unit/scheduling/generate.spec.ts`

### Step 1: Write the failing test

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

### Step 2: Run test to verify it fails

Run: `pnpm vitest run tests/unit/scheduling/generate.spec.ts`
Expected: FAIL with "Cannot find module '@/lib/scheduling/generate'"

### Step 3: Create schedule generation implementation

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

### Step 4: Run test to verify it passes

Run: `pnpm vitest run tests/unit/scheduling/generate.spec.ts`
Expected: PASS (3 tests)

### Step 5: Commit

```bash
git add src/lib/scheduling/generate.ts tests/unit/scheduling/generate.spec.ts
git commit -m "feat: add deterministic schedule generation function"
```

---

## Task 7: Create Schedule Validation Function

**Files:**

- Create: `src/lib/scheduling/validate.ts`
- Test: `tests/unit/scheduling/validate.spec.ts`

### Step 1: Write the failing test

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

### Step 2: Run test to verify it fails

Run: `pnpm vitest run tests/unit/scheduling/validate.spec.ts`
Expected: FAIL with "Cannot find module '@/lib/scheduling/validate'"

### Step 3: Create validation implementation

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

### Step 4: Run test to verify it passes

Run: `pnpm vitest run tests/unit/scheduling/validate.spec.ts`
Expected: PASS (5 tests)

### Step 5: Commit

```bash
git add src/lib/scheduling/validate.ts tests/unit/scheduling/validate.spec.ts
git commit -m "feat: add schedule and task resource validation"
```

---

## Task 8: Create Schedule Database Queries

**Files:**

- Create: `src/lib/db/queries/schedules.ts`
- Test: `tests/integration/scheduling/queries.spec.ts`

### Step 1: Write the failing test

Create `tests/integration/scheduling/queries.spec.ts`:

```typescript
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { db } from '@/lib/db/drizzle';
import { learningPlans, planSchedules, users } from '@/lib/db/schema';
import {
  getPlanScheduleCache,
  upsertPlanScheduleCache,
} from '@/lib/db/queries/schedules';
import type { ScheduleJson } from '@/lib/scheduling/types';
import { eq } from 'drizzle-orm';

describe('Schedule Queries', () => {
  let testUserId: string;
  let testPlanId: string;

  beforeEach(async () => {
    // Create test user
    const [user] = await db
      .insert(users)
      .values({
        clerkUserId: `test-clerk-${Date.now()}`,
        email: `test-${Date.now()}@example.com`,
        name: 'Test User',
      })
      .returning();
    testUserId = user.id;

    // Create test plan
    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId: testUserId,
        topic: 'Test Topic',
        skillLevel: 'beginner',
        weeklyHours: 10,
        learningStyle: 'mixed',
        generationStatus: 'ready',
      })
      .returning();
    testPlanId = plan.id;
  });

  afterEach(async () => {
    // Cleanup
    await db.delete(planSchedules).where(eq(planSchedules.planId, testPlanId));
    await db.delete(learningPlans).where(eq(learningPlans.id, testPlanId));
    await db.delete(users).where(eq(users.id, testUserId));
  });

  describe('getPlanScheduleCache', () => {
    it('should return null for non-existent cache', async () => {
      const result = await getPlanScheduleCache(testPlanId);
      expect(result).toBeNull();
    });

    it('should retrieve existing cache', async () => {
      const scheduleJson: ScheduleJson = {
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

      await db.insert(planSchedules).values({
        planId: testPlanId,
        scheduleJson,
        inputsHash: 'test-hash-123',
        timezone: 'UTC',
        weeklyHours: 10,
        startDate: '2025-02-03',
        deadline: null,
      });

      const result = await getPlanScheduleCache(testPlanId);
      expect(result).not.toBeNull();
      expect(result?.scheduleJson).toEqual(scheduleJson);
      expect(result?.inputsHash).toBe('test-hash-123');
    });
  });

  describe('upsertPlanScheduleCache', () => {
    it('should insert new cache entry', async () => {
      const scheduleJson: ScheduleJson = {
        weeks: [],
        totalWeeks: 0,
        totalSessions: 0,
      };

      await upsertPlanScheduleCache(testPlanId, {
        scheduleJson,
        inputsHash: 'hash-456',
        timezone: 'America/New_York',
        weeklyHours: 5,
        startDate: '2025-02-10',
        deadline: '2025-03-10',
      });

      const result = await getPlanScheduleCache(testPlanId);
      expect(result).not.toBeNull();
      expect(result?.inputsHash).toBe('hash-456');
    });

    it('should update existing cache entry', async () => {
      // Insert initial cache
      await db.insert(planSchedules).values({
        planId: testPlanId,
        scheduleJson: { weeks: [], totalWeeks: 0, totalSessions: 0 },
        inputsHash: 'old-hash',
        timezone: 'UTC',
        weeklyHours: 10,
        startDate: '2025-02-03',
        deadline: null,
      });

      // Update cache
      const newScheduleJson: ScheduleJson = {
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

      await upsertPlanScheduleCache(testPlanId, {
        scheduleJson: newScheduleJson,
        inputsHash: 'new-hash',
        timezone: 'UTC',
        weeklyHours: 10,
        startDate: '2025-02-03',
        deadline: null,
      });

      const result = await getPlanScheduleCache(testPlanId);
      expect(result?.inputsHash).toBe('new-hash');
      expect(result?.scheduleJson).toEqual(newScheduleJson);
    });
  });
});
```

### Step 2: Run test to verify it fails

Run: `pnpm vitest run tests/integration/scheduling/queries.spec.ts`
Expected: FAIL with "Cannot find module '@/lib/db/queries/schedules'"

### Step 3: Create schedule queries implementation

Create `src/lib/db/queries/schedules.ts`:

```typescript
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { planSchedules } from '@/lib/db/schema';
import type { ScheduleCacheRow } from '@/lib/scheduling/types';

/**
 * Retrieves cached schedule for a plan
 */
export async function getPlanScheduleCache(
  planId: string
): Promise<ScheduleCacheRow | null> {
  const [result] = await db
    .select()
    .from(planSchedules)
    .where(eq(planSchedules.planId, planId));

  if (!result) return null;

  return {
    planId: result.planId,
    scheduleJson: result.scheduleJson as ScheduleCacheRow['scheduleJson'],
    inputsHash: result.inputsHash,
    generatedAt: result.generatedAt,
    timezone: result.timezone,
    weeklyHours: result.weeklyHours,
    startDate: result.startDate,
    deadline: result.deadline,
  };
}

/**
 * Upserts (insert or update) schedule cache for a plan
 */
export async function upsertPlanScheduleCache(
  planId: string,
  payload: {
    scheduleJson: ScheduleCacheRow['scheduleJson'];
    inputsHash: string;
    timezone: string;
    weeklyHours: number;
    startDate: string;
    deadline: string | null;
  }
): Promise<void> {
  await db
    .insert(planSchedules)
    .values({
      planId,
      scheduleJson: payload.scheduleJson,
      inputsHash: payload.inputsHash,
      timezone: payload.timezone,
      weeklyHours: payload.weeklyHours,
      startDate: payload.startDate,
      deadline: payload.deadline,
    })
    .onConflictDoUpdate({
      target: planSchedules.planId,
      set: {
        scheduleJson: payload.scheduleJson,
        inputsHash: payload.inputsHash,
        timezone: payload.timezone,
        weeklyHours: payload.weeklyHours,
        startDate: payload.startDate,
        deadline: payload.deadline,
        generatedAt: new Date(),
      },
    });
}

/**
 * Deletes schedule cache for a plan
 */
export async function deletePlanScheduleCache(planId: string): Promise<void> {
  await db.delete(planSchedules).where(eq(planSchedules.planId, planId));
}
```

### Step 4: Run test to verify it passes

Run: `pnpm vitest run tests/integration/scheduling/queries.spec.ts`
Expected: PASS (4 tests)

### Step 5: Commit

```bash
git add src/lib/db/queries/schedules.ts tests/integration/scheduling/queries.spec.ts
git commit -m "feat: add schedule cache database queries"
```

---

## Task 9: Create getPlanSchedule API Composition

**Files:**

- Create: `src/lib/api/schedule.ts`
- Test: `tests/integration/scheduling/api.spec.ts`

### Step 1: Write the failing test

Create `tests/integration/scheduling/api.spec.ts`:

```typescript
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { db } from '@/lib/db/drizzle';
import { learningPlans, users, modules, tasks } from '@/lib/db/schema';
import { getPlanSchedule } from '@/lib/api/schedule';
import { eq } from 'drizzle-orm';

describe('getPlanSchedule API', () => {
  let testUserId: string;
  let testPlanId: string;

  beforeEach(async () => {
    // Create test user
    const [user] = await db
      .insert(users)
      .values({
        clerkUserId: `test-clerk-${Date.now()}`,
        email: `test-${Date.now()}@example.com`,
        name: 'Test User',
      })
      .returning();
    testUserId = user.id;

    // Create test plan
    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId: testUserId,
        topic: 'Test Topic',
        skillLevel: 'beginner',
        weeklyHours: 10,
        learningStyle: 'mixed',
        generationStatus: 'ready',
        startDate: '2025-02-03',
        deadlineDate: null,
      })
      .returning();
    testPlanId = plan.id;

    // Create test module
    const [module] = await db
      .insert(modules)
      .values({
        planId: testPlanId,
        order: 1,
        title: 'Module 1',
        estimatedMinutes: 120,
      })
      .returning();

    // Create test tasks
    await db.insert(tasks).values([
      {
        moduleId: module.id,
        order: 1,
        title: 'Task 1',
        estimatedMinutes: 60,
      },
      {
        moduleId: module.id,
        order: 2,
        title: 'Task 2',
        estimatedMinutes: 60,
      },
    ]);
  });

  afterEach(async () => {
    // Cleanup (cascading deletes handle child records)
    await db.delete(learningPlans).where(eq(learningPlans.id, testPlanId));
    await db.delete(users).where(eq(users.id, testUserId));
  });

  it('should generate and cache schedule on first call', async () => {
    const schedule = await getPlanSchedule({
      planId: testPlanId,
      userId: testUserId,
    });

    expect(schedule).not.toBeNull();
    expect(schedule.weeks.length).toBeGreaterThan(0);
    expect(schedule.totalWeeks).toBeGreaterThan(0);
  });

  it('should return cached schedule on subsequent calls', async () => {
    // First call - generates and caches
    const schedule1 = await getPlanSchedule({
      planId: testPlanId,
      userId: testUserId,
    });

    // Second call - returns cache
    const schedule2 = await getPlanSchedule({
      planId: testPlanId,
      userId: testUserId,
    });

    expect(JSON.stringify(schedule1)).toBe(JSON.stringify(schedule2));
  });

  it('should recompute schedule when tasks change', async () => {
    // Generate initial schedule
    const schedule1 = await getPlanSchedule({
      planId: testPlanId,
      userId: testUserId,
    });

    // Add new task
    const [module] = await db
      .select()
      .from(modules)
      .where(eq(modules.planId, testPlanId));

    await db.insert(tasks).values({
      moduleId: module.id,
      order: 3,
      title: 'New Task',
      estimatedMinutes: 90,
    });

    // Get schedule again - should recompute
    const schedule2 = await getPlanSchedule({
      planId: testPlanId,
      userId: testUserId,
    });

    expect(schedule2.totalSessions).not.toBe(schedule1.totalSessions);
  });
});
```

### Step 2: Run test to verify it fails

Run: `pnpm vitest run tests/integration/scheduling/api.spec.ts`
Expected: FAIL with "Cannot find module '@/lib/api/schedule'"

### Step 3: Create API composition implementation

Create `src/lib/api/schedule.ts`:

```typescript
import { db } from '@/lib/db/drizzle';
import { learningPlans, modules, tasks } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import {
  getPlanScheduleCache,
  upsertPlanScheduleCache,
} from '@/lib/db/queries/schedules';
import { generateSchedule } from '@/lib/scheduling/generate';
import { computeInputsHash } from '@/lib/scheduling/hash';
import type { ScheduleInputs, ScheduleJson } from '@/lib/scheduling/types';

interface GetPlanScheduleParams {
  planId: string;
  userId: string;
}

/**
 * Retrieves or computes plan schedule with write-through caching
 */
export async function getPlanSchedule(
  params: GetPlanScheduleParams
): Promise<ScheduleJson> {
  const { planId, userId } = params;

  // Load plan
  const [plan] = await db
    .select()
    .from(learningPlans)
    .where(eq(learningPlans.id, planId));

  if (!plan) {
    throw new Error(`Plan not found: ${planId}`);
  }

  if (plan.userId !== userId) {
    throw new Error('Unauthorized access to plan');
  }

  // Load modules and tasks
  const planModules = await db
    .select()
    .from(modules)
    .where(eq(modules.planId, planId))
    .orderBy(asc(modules.order));

  const allTasks = await Promise.all(
    planModules.map(async (module) => {
      const moduleTasks = await db
        .select()
        .from(tasks)
        .where(eq(tasks.moduleId, module.id))
        .orderBy(asc(tasks.order));

      return moduleTasks.map((task) => ({
        ...task,
        moduleTitle: module.title,
      }));
    })
  );

  const flatTasks = allTasks.flat();

  // Build schedule inputs
  const inputs: ScheduleInputs = {
    planId: plan.id,
    tasks: flatTasks.map((task, idx) => ({
      id: task.id,
      title: task.title,
      estimatedMinutes: task.estimatedMinutes,
      order: idx + 1,
      moduleId: task.moduleId,
    })),
    startDate: plan.startDate || plan.createdAt.toISOString().split('T')[0],
    deadline: plan.deadlineDate,
    weeklyHours: plan.weeklyHours,
    timezone: 'UTC', // TODO: Get from user preferences
  };

  // Compute hash
  const inputsHash = computeInputsHash(inputs);

  // Check cache
  const cached = await getPlanScheduleCache(planId);
  if (cached && cached.inputsHash === inputsHash) {
    return cached.scheduleJson;
  }

  // Generate new schedule
  const schedule = generateSchedule(inputs);

  // Write through cache
  await upsertPlanScheduleCache(planId, {
    scheduleJson: schedule,
    inputsHash,
    timezone: inputs.timezone,
    weeklyHours: inputs.weeklyHours,
    startDate: inputs.startDate,
    deadline: inputs.deadline,
  });

  return schedule;
}
```

### Step 4: Run test to verify it passes

Run: `pnpm vitest run tests/integration/scheduling/api.spec.ts`
Expected: PASS (3 tests)

### Step 5: Commit

```bash
git add src/lib/api/schedule.ts tests/integration/scheduling/api.spec.ts
git commit -m "feat: add getPlanSchedule API with write-through cache"
```

---

## Task 10: Create ScheduleWeekList UI Component

**Files:**

- Create: `src/components/plans/ScheduleWeekList.tsx`
- Test: `tests/unit/components/ScheduleWeekList.spec.tsx`

### Step 1: Write the failing test

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

### Step 2: Run test to verify it fails

Run: `pnpm vitest run tests/unit/components/ScheduleWeekList.spec.tsx`
Expected: FAIL with "Cannot find module '@/components/plans/ScheduleWeekList'"

### Step 3: Create ScheduleWeekList component

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

### Step 4: Run test to verify it passes

Run: `pnpm vitest run tests/unit/components/ScheduleWeekList.spec.tsx`
Expected: PASS (3 tests)

### Step 5: Commit

```bash
git add src/components/plans/ScheduleWeekList.tsx tests/unit/components/ScheduleWeekList.spec.tsx
git commit -m "feat: add ScheduleWeekList UI component"
```

---

## Task 11: Add Schedule Toggle to Plan Detail Page

**Files:**

- Modify: `src/app/plans/[id]/page.tsx`
- Modify: `src/components/plans/PlanDetails.tsx`
- Test: `tests/e2e/plan-schedule-view.spec.ts`

### Step 1: Write the failing E2E test

Create `tests/e2e/plan-schedule-view.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Plan Schedule View', () => {
  test('should toggle between modules and schedule view', async ({ page }) => {
    // NOTE: This test requires a seeded plan with modules/tasks
    // Adjust plan ID based on your test database setup
    await page.goto('/plans/test-plan-id');

    // Verify default view is modules
    await expect(page.getByRole('heading', { name: /modules/i })).toBeVisible();

    // Click schedule tab
    await page.getByRole('tab', { name: /schedule/i }).click();

    // Verify schedule view is displayed
    await expect(page.getByText(/Week 1/i)).toBeVisible();

    // Click modules tab
    await page.getByRole('tab', { name: /modules/i }).click();

    // Verify modules view is restored
    await expect(page.getByRole('heading', { name: /modules/i })).toBeVisible();
  });

  test('should display week-grouped schedule with dates', async ({ page }) => {
    await page.goto('/plans/test-plan-id');
    await page.getByRole('tab', { name: /schedule/i }).click();

    // Verify week structure
    await expect(page.getByText(/Week 1/i)).toBeVisible();

    // Verify dates are displayed
    await expect(page.getByText(/\d{4}-\d{2}-\d{2}/)).toBeVisible();

    // Verify task time estimates
    await expect(page.getByText(/\d+ min/i)).toBeVisible();
  });
});
```

### Step 2: Run test to verify it fails

Run: `pnpm test:e2e tests/e2e/plan-schedule-view.spec.ts`
Expected: FAIL (schedule tab not found)

### Step 3: Modify plan detail page to fetch schedule

Modify `src/app/plans/[id]/page.tsx`:

```typescript
import PlanDetailPageError from '@/components/plans/Error';
import PlanDetails from '@/components/plans/PlanDetails';
import { getEffectiveClerkUserId } from '@/lib/api/auth';
import { getPlanSchedule } from '@/lib/api/schedule';
import { getLearningPlanDetail } from '@/lib/db/queries/plans';
import { getUserByClerkId } from '@/lib/db/queries/users';
import { mapDetailToClient } from '@/lib/mappers/detailToClient';
import { redirect } from 'next/navigation';

interface PlanPageProps {
  params: { id: string };
}

export default async function PlanDetailPage({ params }: PlanPageProps) {
  const { id } = await params;
  if (!id) return <PlanDetailPageError />;

  const userId = await getEffectiveClerkUserId();
  if (!userId) redirect(`/sign-in?redirect_url=/plans/${id}`);

  const user = await getUserByClerkId(userId);
  if (!user) redirect(`/sign-in?redirect_url=/plans/${id}`);

  const plan = await getLearningPlanDetail(id, user.id);
  if (!plan) redirect(`/sign-in?redirect_url=/plans/${id}`);

  const formattedPlanDetails = mapDetailToClient(plan);
  if (!formattedPlanDetails) return <PlanDetailPageError />;

  // Fetch schedule
  const schedule = await getPlanSchedule({ planId: id, userId: user.id });

  return <PlanDetails plan={formattedPlanDetails} schedule={schedule} />;
}
```

### Step 4: Modify PlanDetails component to add toggle

Modify `src/components/plans/PlanDetails.tsx` - add state and tab UI:

```typescript
'use client';

import { useState } from 'react';
import ScheduleWeekList from './ScheduleWeekList';
import type { ScheduleJson } from '@/lib/scheduling/types';
// ... existing imports

interface PlanDetailsProps {
  plan: FormattedPlanDetails;
  schedule: ScheduleJson;
}

export default function PlanDetails({ plan, schedule }: PlanDetailsProps) {
  const [activeView, setActiveView] = useState<'modules' | 'schedule'>('modules');

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Plan Header - existing code */}

      {/* View Toggle */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="flex space-x-8">
          <button
            role="tab"
            aria-selected={activeView === 'modules'}
            onClick={() => setActiveView('modules')}
            className={`border-b-2 px-1 py-4 text-sm font-medium ${
              activeView === 'modules'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            Modules
          </button>
          <button
            role="tab"
            aria-selected={activeView === 'schedule'}
            onClick={() => setActiveView('schedule')}
            className={`border-b-2 px-1 py-4 text-sm font-medium ${
              activeView === 'schedule'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            Schedule
          </button>
        </nav>
      </div>

      {/* Content */}
      {activeView === 'modules' && (
        <div>
          {/* Existing module list rendering code */}
        </div>
      )}

      {activeView === 'schedule' && <ScheduleWeekList schedule={schedule} />}
    </div>
  );
}
```

### Step 5: Run E2E test to verify it passes

Run: `pnpm test:e2e tests/e2e/plan-schedule-view.spec.ts`
Expected: PASS (2 tests)

### Step 6: Commit

```bash
git add src/app/plans/[id]/page.tsx src/components/plans/PlanDetails.tsx tests/e2e/plan-schedule-view.spec.ts
git commit -m "feat: add module/schedule toggle to plan detail page"
```

---

## Task 12: Update AI Prompts to Request Time Estimates

**Files:**

- Modify: `src/lib/ai/prompts.ts`
- Test: Manual verification via plan generation

### Step 1: Review current prompts

Read `src/lib/ai/prompts.ts` to understand current structure.

### Step 2: Modify prompts to request time estimates and resources

Modify `src/lib/ai/prompts.ts` - add instructions for time estimates:

```typescript
// ... existing code

export const PLAN_GENERATION_PROMPT = `
You are an expert learning plan generator. Create a structured learning plan based on the user's requirements.

IMPORTANT: For each task, you MUST include:
1. A clear, actionable title
2. A detailed description
3. An estimated_minutes field (integer) indicating how long the task should take
4. At least one resource URL (preferably multiple) relevant to the task

Time Estimate Guidelines:
- Beginner tasks: typically 30-90 minutes
- Intermediate tasks: typically 60-180 minutes
- Advanced tasks: typically 90-240 minutes
- Adjust based on task complexity and scope

Resource Requirements:
- Every task MUST have at least one linked resource
- Prefer high-quality, free resources when possible
- Include a mix of resource types: videos, articles, documentation, interactive tutorials

Output Format:
{
  "modules": [
    {
      "title": "Module Title",
      "description": "Module description",
      "estimated_minutes": 360,
      "tasks": [
        {
          "title": "Task Title",
          "description": "Detailed task description",
          "estimated_minutes": 60,
          "resources": [
            {
              "title": "Resource Title",
              "url": "https://example.com/resource",
              "type": "video" // or "article", "doc", "course"
            }
          ]
        }
      ]
    }
  ]
}

User Requirements:
- Topic: {topic}
- Skill Level: {skillLevel}
- Weekly Hours: {weeklyHours}
- Learning Style: {learningStyle}

Generate a comprehensive, well-structured learning plan.
`;

// ... rest of prompts
```

### Step 3: Manual test via plan generation

Run: `pnpm dev` and create a test plan.
Expected: Generated plan includes `estimated_minutes` and resources for all tasks.

### Step 4: Commit

```bash
git add src/lib/ai/prompts.ts
git commit -m "feat: update AI prompts to request time estimates and resources"
```

---

## Task 13: Add Integration Test for Full Schedule Flow

**Files:**

- Create: `tests/integration/scheduling/end-to-end.spec.ts`

### Step 1: Write comprehensive integration test

Create `tests/integration/scheduling/end-to-end.spec.ts`:

```typescript
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { db } from '@/lib/db/drizzle';
import {
  learningPlans,
  users,
  modules,
  tasks,
  resources,
  taskResources,
} from '@/lib/db/schema';
import { getPlanSchedule } from '@/lib/api/schedule';
import { eq } from 'drizzle-orm';

describe('End-to-End Schedule Flow', () => {
  let testUserId: string;
  let testPlanId: string;

  beforeEach(async () => {
    // Create test user
    const [user] = await db
      .insert(users)
      .values({
        clerkUserId: `test-clerk-${Date.now()}`,
        email: `test-${Date.now()}@example.com`,
        name: 'Test User',
      })
      .returning();
    testUserId = user.id;

    // Create test plan with start date
    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId: testUserId,
        topic: 'Full Stack Development',
        skillLevel: 'intermediate',
        weeklyHours: 10,
        learningStyle: 'mixed',
        generationStatus: 'ready',
        startDate: '2025-02-03',
        deadlineDate: null,
      })
      .returning();
    testPlanId = plan.id;

    // Create modules
    const [mod1, mod2] = await db
      .insert(modules)
      .values([
        {
          planId: testPlanId,
          order: 1,
          title: 'Frontend Basics',
          estimatedMinutes: 300,
        },
        {
          planId: testPlanId,
          order: 2,
          title: 'Backend Basics',
          estimatedMinutes: 300,
        },
      ])
      .returning();

    // Create tasks with resources
    const [task1, task2, task3, task4] = await db
      .insert(tasks)
      .values([
        {
          moduleId: mod1.id,
          order: 1,
          title: 'Learn React',
          estimatedMinutes: 120,
        },
        {
          moduleId: mod1.id,
          order: 2,
          title: 'Build React App',
          estimatedMinutes: 180,
        },
        {
          moduleId: mod2.id,
          order: 1,
          title: 'Learn Node.js',
          estimatedMinutes: 150,
        },
        {
          moduleId: mod2.id,
          order: 2,
          title: 'Build API',
          estimatedMinutes: 150,
        },
      ])
      .returning();

    // Create resources
    const [res1, res2] = await db
      .insert(resources)
      .values([
        {
          type: 'video',
          title: 'React Tutorial',
          url: `https://example.com/react-${Date.now()}`,
        },
        {
          type: 'doc',
          title: 'Node.js Guide',
          url: `https://example.com/node-${Date.now()}`,
        },
      ])
      .returning();

    // Link resources to tasks
    await db.insert(taskResources).values([
      { taskId: task1.id, resourceId: res1.id, order: 1 },
      { taskId: task2.id, resourceId: res1.id, order: 1 },
      { taskId: task3.id, resourceId: res2.id, order: 1 },
      { taskId: task4.id, resourceId: res2.id, order: 1 },
    ]);
  });

  afterEach(async () => {
    await db.delete(learningPlans).where(eq(learningPlans.id, testPlanId));
    await db.delete(users).where(eq(users.id, testUserId));
  });

  it('should generate complete schedule with correct structure', async () => {
    const schedule = await getPlanSchedule({
      planId: testPlanId,
      userId: testUserId,
    });

    // Verify schedule structure
    expect(schedule.weeks.length).toBeGreaterThan(0);
    expect(schedule.totalWeeks).toBeGreaterThan(0);
    expect(schedule.totalSessions).toBeGreaterThan(0);

    // Verify first week has correct date
    expect(schedule.weeks[0].startDate).toBe('2025-02-03');

    // Verify all sessions have valid data
    for (const week of schedule.weeks) {
      for (const day of week.days) {
        for (const session of day.sessions) {
          expect(session.taskId).toBeTruthy();
          expect(session.taskTitle).toBeTruthy();
          expect(session.estimatedMinutes).toBeGreaterThan(0);
          expect(session.moduleId).toBeTruthy();
          expect(session.moduleName).toBeTruthy();
        }
      }
    }
  });

  it('should respect weekly hours constraint', async () => {
    const schedule = await getPlanSchedule({
      planId: testPlanId,
      userId: testUserId,
    });

    // Calculate total scheduled minutes
    let totalMinutes = 0;
    for (const week of schedule.weeks) {
      for (const day of week.days) {
        for (const session of day.sessions) {
          totalMinutes += session.estimatedMinutes;
        }
      }
    }

    // Total should be approximately 600 minutes (300 + 300 from modules)
    expect(totalMinutes).toBeGreaterThanOrEqual(590);
    expect(totalMinutes).toBeLessThanOrEqual(610);

    // Each week should have approximately weeklyHours * 60 minutes
    const weeklyHours = 10;
    const expectedMinutesPerWeek = weeklyHours * 60;

    for (const week of schedule.weeks.slice(0, -1)) {
      let weekMinutes = 0;
      for (const day of week.days) {
        for (const session of day.sessions) {
          weekMinutes += session.estimatedMinutes;
        }
      }
      expect(weekMinutes).toBeGreaterThanOrEqual(expectedMinutesPerWeek * 0.8);
      expect(weekMinutes).toBeLessThanOrEqual(expectedMinutesPerWeek * 1.2);
    }
  });
});
```

### Step 2: Run integration test

Run: `pnpm vitest run tests/integration/scheduling/end-to-end.spec.ts`
Expected: PASS (2 tests)

### Step 3: Commit

```bash
git add tests/integration/scheduling/end-to-end.spec.ts
git commit -m "test: add end-to-end integration test for schedule generation"
```

---

## Task 14: Update Testing Documentation

**Files:**

- Modify: `docs/testing/testing.md`

### Step 1: Add scheduling test section

Modify `docs/testing/testing.md` - add new section:

````markdown
## Scheduling Tests

### Unit Tests

Located in `tests/unit/scheduling/`:

- **types.spec.ts** - Schedule type definitions
- **hash.spec.ts** - Inputs hash computation for cache validation
- **dates.spec.ts** - Date utility functions (add days, weeks, boundaries)
- **distribute.spec.ts** - Session distribution logic
- **generate.spec.ts** - Deterministic schedule generation
- **validate.spec.ts** - Schedule and resource validation
- **schema.spec.ts** - Database schema validation

### Integration Tests

Located in `tests/integration/scheduling/`:

- **queries.spec.ts** - Schedule cache database queries
- **api.spec.ts** - getPlanSchedule API composition with caching
- **end-to-end.spec.ts** - Full schedule generation flow with real DB

### E2E Tests

Located in `tests/e2e/`:

- **plan-schedule-view.spec.ts** - UI toggle between modules/schedule views

### Running Scheduling Tests

```bash
# All scheduling unit tests
pnpm vitest run tests/unit/scheduling

# All scheduling integration tests
pnpm vitest run tests/integration/scheduling

# Specific test file
pnpm vitest run tests/unit/scheduling/hash.spec.ts
```
````

````

### Step 2: Commit

```bash
git add docs/testing/testing.md
git commit -m "docs: add scheduling tests documentation"
````

---

## Summary

This plan implements week-based plan structuring using:

1. **Scheduling Library** (`src/lib/scheduling/`) - Types, hash, dates, distribution, generation, validation
2. **Database Layer** - `plan_schedules` table with JSONB cache and RLS policies
3. **API Composition** - `getPlanSchedule` with write-through caching
4. **UI Components** - `ScheduleWeekList` with module/schedule toggle
5. **Testing** - Comprehensive unit, integration, and E2E tests

**Key Architectural Decisions:**

- Compute-on-read with write-through JSON cache (no per-task schedule rows)
- Deterministic schedule generation using inputs hash for cache validation
- Server-side computation with client-side rendering
- Week 1 anchored to user's start date (not forced to Monday)
- Default 3 sessions per week (Mon/Wed/Fri pattern from anchor)

**Next Steps After Implementation:**

- Add timezone support (currently hardcoded to UTC)
- Implement user preferences for session days/times
- Add holiday/weekend handling
- Create calendar view UI component
- Add schedule export functionality

---

**Execution Options:**

**Plan complete and saved to `docs/plans/2025-01-30-week-based-plan-structuring.md`.**

Choose execution approach:

**1. Subagent-Driven (this session)** - Fresh subagent per task, code review between tasks, fast iteration in current session

**2. Parallel Session (separate)** - Open new session with executing-plans skill, batch execution with review checkpoints

Which approach would you prefer?
