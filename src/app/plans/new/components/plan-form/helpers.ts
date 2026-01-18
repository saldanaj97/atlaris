/**
 * Converts deadline weeks to an ISO date string (YYYY-MM-DD).
 */
export function deadlineWeeksToDate(weeks: string): string {
  const weeksNum = parseInt(weeks, 10);
  if (!Number.isFinite(weeksNum) || weeksNum < 0) {
    throw new Error(`Invalid weeks value: ${weeks}`);
  }
  const date = new Date();
  date.setDate(date.getDate() + weeksNum * 7);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Gets today's date as an ISO string (YYYY-MM-DD).
 */
export function getTodayDateString(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
