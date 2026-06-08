import type { PlanReadStatus } from '@/features/plans/read-projection/types';

/** Semantic dot color for plan list rows and filter indicators. */
export const PLAN_STATUS_DOT_CLASS: Record<PlanReadStatus, string> = {
  active: 'bg-success',
  paused: 'bg-warning',
  completed: 'bg-chart-3',
  generating: 'bg-primary',
  failed: 'bg-destructive',
};

export function getPlanStatusDotClassName(status: PlanReadStatus): string {
  return PLAN_STATUS_DOT_CLASS[status];
}
