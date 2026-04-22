import { addDays, addWeeks, format, parseISO } from 'date-fns';

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
 * Computes the inclusive start and end dates for a given week relative to an anchor date.
 *
 * @param anchorDate - ISO date string (YYYY-MM-DD) representing the first day of week 1
 * @param weekNumber - 1-based week index where 1 denotes the week that begins on `anchorDate`
 * @returns An object with `startDate` and `endDate` formatted as `YYYY-MM-DD`, inclusive for the 7-day week
 */
export function getWeekBoundaries(
	anchorDate: string,
	weekNumber: number,
): { startDate: string; endDate: string } {
	if (!Number.isInteger(weekNumber) || weekNumber < 1) {
		throw new RangeError(
			`weekNumber must be an integer >= 1, received ${weekNumber}`,
		);
	}

	const anchor = parseISO(anchorDate);
	const weeksToAdd = weekNumber - 1; // Week 1 starts at anchor
	const weekStart = addWeeks(anchor, weeksToAdd);
	const weekEnd = addDays(weekStart, 6); // 7 days total (inclusive)

	return {
		startDate: format(weekStart, 'yyyy-MM-dd'),
		endDate: format(weekEnd, 'yyyy-MM-dd'),
	};
}
