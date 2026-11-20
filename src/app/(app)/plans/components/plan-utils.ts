import type { PlanListItem } from '@/features/plans/read-projection/types';

import { formatRelativePast, toValidDate } from '@/lib/date/relative-time';

type DateInput = Date | string | null | undefined;

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

export function resumeActionLabel(completedTasks: number): string {
  return completedTasks > 0 ? 'Continue learning' : 'Start learning';
}

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
