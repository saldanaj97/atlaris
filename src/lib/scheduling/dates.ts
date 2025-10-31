import {
  addDays,
  addWeeks,
  differenceInDays,
  format,
  parseISO,
} from 'date-fns';

/**
 * Compute the date obtained by adding a number of days to an ISO date.
 *
 * @param isoDate - An ISO date string in `YYYY-MM-DD` format
 * @param days - Number of days to add (may be negative to subtract days)
 * @returns The resulting date formatted as `yyyy-MM-dd`
 */
export function addDaysToDate(isoDate: string, days: number): string {
  const date = parseISO(isoDate);
  const result = addDays(date, days);
  return format(result, 'yyyy-MM-dd');
}

/**
 * Produce an ISO date string by adding a number of weeks to the given date.
 *
 * @param isoDate - Input date in `YYYY-MM-DD` format
 * @param weeks - Number of weeks to add (may be negative to subtract weeks)
 * @returns The resulting date formatted as `YYYY-MM-DD`
 */
export function addWeeksToDate(isoDate: string, weeks: number): string {
  const date = parseISO(isoDate);
  const result = addWeeks(date, weeks);
  return format(result, 'yyyy-MM-dd');
}

/**
 * Computes the inclusive start and end dates for a given week relative to an anchor date.
 *
 * @param anchorDate - ISO date string (YYYY-MM-DD) representing the first day of week 1
 * @param weekNumber - 1-based week index where 1 denotes the week that begins on `anchorDate`
 * @returns An object with `startDate` and `endDate` formatted as `YYYY-MM-DD`, inclusive for the 7-day week
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
 * Formats a Date object into an ISO date string (YYYY-MM-DD).
 *
 * @param date - The Date to format
 * @returns The date as a string in `YYYY-MM-DD` format
 */
export function formatDateISO(date: Date): string {
  // Format using UTC components to avoid local timezone shifts
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse an ISO 8601 date string into a Date object.
 *
 * @param isoDate - The date string in 'YYYY-MM-DD' ISO 8601 format
 * @returns The Date representing the same calendar date as `isoDate`
 */
export function parseISODate(isoDate: string): Date {
  return parseISO(isoDate);
}

/**
 * Computes the number of days between two ISO date strings.
 *
 * @param startDate - ISO date string (YYYY-MM-DD) representing the start date
 * @param endDate - ISO date string (YYYY-MM-DD) representing the end date
 * @returns The number of days from `startDate` to `endDate` (end minus start)
 */
export function getDaysBetween(startDate: string, endDate: string): number {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  return differenceInDays(end, start);
}