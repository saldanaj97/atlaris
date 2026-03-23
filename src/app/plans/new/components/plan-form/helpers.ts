import { formatDateToYmd } from '@/lib/date/format-local-ymd';

export { deadlineWeeksToDate } from '@/lib/date/format-local-ymd';

/**
 * Gets today's date as an ISO string (YYYY-MM-DD).
 */
export function getTodayDateString(): string {
  return formatDateToYmd(new Date());
}
