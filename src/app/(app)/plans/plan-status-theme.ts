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

/** Semantic pill treatment for status labels in the plan library. */
const PLAN_STATUS_BADGE_CLASS: Record<PlanReadStatus, string> = {
  not_started: 'border-border bg-panel-muted text-muted-foreground',
  active: 'border-success/50 bg-success/10 text-success',
  paused: 'border-warning/50 bg-warning/10 text-warning',
  completed: 'border-success/50 bg-success/10 text-success',
  generating: 'border-primary/50 bg-primary/10 text-primary',
  failed: 'border-danger bg-danger-subtle text-danger',
};

export function getPlanStatusDotClassName(status: PlanReadStatus): string {
  return PLAN_STATUS_DOT_CLASS[status];
}

export function getPlanStatusBadgeClassName(status: PlanReadStatus): string {
  return PLAN_STATUS_BADGE_CLASS[status];
}
