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

const PLAN_STATUS_PILL_CLASS: Record<PlanReadStatus, string> = {
  not_started: 'border-muted-foreground/35 bg-muted-foreground/5',
  active: 'border-success/50 bg-success/5 text-success',
  paused: 'border-warning/50 bg-warning/5 text-warning',
  completed: 'border-chart-3/50 bg-chart-3/5 text-chart-3',
  generating: 'border-primary/50 bg-primary/5 text-primary',
  failed: 'border-destructive/50 bg-destructive/5 text-destructive',
};

export function getPlanStatusPillClassName(status: PlanReadStatus): string {
  return PLAN_STATUS_PILL_CLASS[status];
}
