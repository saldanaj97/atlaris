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
