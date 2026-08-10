import type { PlanReadStatus } from '@/features/plans/read-projection/types';

export const PLAN_STATUS_LABELS: Record<PlanReadStatus, string> = {
  not_started: 'Not started',
  active: 'Active',
  paused: 'Inactive',
  completed: 'Completed',
  generating: 'Generating',
  failed: 'Failed',
};

/** Semantic dot color for plan list rows and filter indicators. */
const PLAN_STATUS_DOT_CLASS: Record<PlanReadStatus, string> = {
  not_started: 'bg-muted-foreground',
  active: 'bg-success',
  paused: 'bg-warning',
  completed: 'bg-chart-3',
  generating: 'bg-primary',
  failed: 'bg-destructive',
};

export function getPlanStatusDotClassName(status: PlanReadStatus): string {
  return PLAN_STATUS_DOT_CLASS[status];
}
