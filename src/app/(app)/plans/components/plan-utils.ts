import type { PlanListItem } from '@/features/plans/read-projection/types';

import { formatRelativePast, toValidDate } from '@/lib/date/relative-time';

type DateInput = Date | string | null | undefined;

/**
 * Converts a date to a human-readable relative time string.
 *
 * Returns a formatted string representing how long ago the date was:
 * - "Just now" for dates less than 1 minute ago
 * - "Xm ago" for dates less than 1 hour ago (e.g., "5m ago")
 * - "X hour ago" or "X hours ago" for dates less than 24 hours ago
 * - "Yesterday" for dates exactly 1 day ago
 * - "X days ago" for dates less than 7 days ago
 * - "Xw ago" for dates less than 30 days ago (weeks)
 * - "Xmo ago" for dates 30+ days ago (months)
 * - "Recently" if the date is null or undefined
 *
 * @param date - The date to convert to relative time. Can be a Date object, null, or undefined.
 * @returns A human-readable relative time string.
 *
 * @example
 * ```ts
 * getPlanLastActivityRelative(new Date()) // "Just now"
 * getPlanLastActivityRelative(new Date(Date.now() - 5 * 60 * 1000)) // "5m ago"
 * getPlanLastActivityRelative(new Date(Date.now() - 2 * 60 * 60 * 1000)) // "2 hours ago"
 * getPlanLastActivityRelative(null) // "Recently"
 * ```
 */
export function getPlanLastActivityRelative(
  date: DateInput,
  referenceDate: DateInput,
): string {
  const target = toValidDate(date);
  const reference = toValidDate(referenceDate);
  if (!target || !reference) return 'Recently';
  return formatRelativePast(target, {
    referenceDate: reference,
    style: 'compact',
    invalidLabel: 'Recently',
  });
}

/** Call to resume a plan: nothing done yet reads "Start learning". */
export function resumeActionLabel(completedTasks: number): string {
  return completedTasks > 0 ? 'Continue learning' : 'Start learning';
}

/** Call to action on a plan card, from its status and how much is done. */
export function planActionLabel(
  status: PlanListItem['status'],
  completedTasks: number,
): string {
  switch (status) {
    case 'completed':
    case 'failed':
      return 'View plan';
    case 'generating':
      return 'View progress';
    case 'not_started':
      return 'Start learning';
    case 'active':
    case 'paused':
      return resumeActionLabel(completedTasks);
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}
