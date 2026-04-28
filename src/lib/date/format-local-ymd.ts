/**
 * Local calendar date as YYYY-MM-DD (no timezone conversion; uses Date's local getters).
 */
export function formatDateToYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Converts deadline weeks to an ISO date string (YYYY-MM-DD) from today in local time.
 */
export function deadlineWeeksToDate(weeks: string): string {
  const weeksNum = Number.parseInt(weeks, 10);
  if (!Number.isFinite(weeksNum) || weeksNum < 0) {
    throw new Error(`Invalid weeks value: ${weeks}`);
  }
  const date = new Date();
  date.setDate(date.getDate() + weeksNum * 7);
  return formatDateToYmd(date);
}
