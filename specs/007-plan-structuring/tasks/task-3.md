# Phase 3: Create Date Utility Functions

**Files:**

- Create: `src/lib/scheduling/dates.ts`
- Test: `tests/unit/scheduling/dates.spec.ts`

## Step 1: Write the failing test

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

## Step 2: Run test to verify it fails

Run: `pnpm vitest run tests/unit/scheduling/dates.spec.ts`
Expected: FAIL with "Cannot find module '@/lib/scheduling/dates'"

## Step 3: Create date utilities implementation

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

## Step 4: Run test to verify it passes

Run: `pnpm vitest run tests/unit/scheduling/dates.spec.ts`
Expected: PASS (10 tests)

## Step 5: Commit

```bash
git add src/lib/scheduling/dates.ts tests/unit/scheduling/dates.spec.ts
git commit -m "feat: add date utility functions for schedule calculations"
```
