import type { ModuleStatus } from './TimelineModuleCard';

const MODULE_STATUS_THEME: Record<
  ModuleStatus,
  { marker: string; card: string; badge: string; title: string }
> = {
  completed: {
    marker: 'border-success text-success',
    card: 'border-panel-border bg-panel shadow-sm',
    badge:
      'bg-success/15 text-success dark:bg-success/25 dark:text-success-foreground',
    title: 'text-foreground/90',
  },
  active: {
    marker:
      'scale-110 border-primary text-primary shadow-[0_0_12px_hsl(var(--primary)/0.4)]',
    card: 'border-primary/30 bg-panel shadow-md dark:border-primary/50',
    badge: 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary',
    title: 'text-foreground',
  },
  locked: {
    marker: 'border-muted-foreground/40 text-muted-foreground/50',
    card: 'border-border bg-muted/40 dark:bg-muted/25',
    badge: 'bg-muted text-muted-foreground',
    title: 'text-muted-foreground',
  },
};

export function getMarkerClassName(status: ModuleStatus): string {
  return MODULE_STATUS_THEME[status].marker;
}

export function getCardClassName(status: ModuleStatus): string {
  return MODULE_STATUS_THEME[status].card;
}

export function getWeekBadgeClassName(status: ModuleStatus): string {
  return MODULE_STATUS_THEME[status].badge;
}

export function getTitleClassName(status: ModuleStatus): string {
  return MODULE_STATUS_THEME[status].title;
}

export type PlanFooterStatus = 'complete' | 'incomplete';

const PLAN_FOOTER_THEME: Record<
  PlanFooterStatus,
  {
    marker: string;
    card: string;
    badge: string;
    label: string;
    title: string;
  }
> = {
  complete: {
    marker: MODULE_STATUS_THEME.completed.marker,
    card: 'border-success/30 bg-success/5 dark:border-success/30 dark:bg-success/10',
    badge: MODULE_STATUS_THEME.completed.badge,
    label: 'text-success',
    title: 'text-foreground',
  },
  incomplete: {
    marker: MODULE_STATUS_THEME.locked.marker,
    card: 'border-dashed border-border bg-muted/40',
    badge: MODULE_STATUS_THEME.locked.badge,
    label: 'text-muted-foreground',
    title: 'text-foreground',
  },
};

export function getPlanFooterMarkerClassName(status: PlanFooterStatus): string {
  return PLAN_FOOTER_THEME[status].marker;
}

export function getPlanFooterCardClassName(status: PlanFooterStatus): string {
  return PLAN_FOOTER_THEME[status].card;
}

export function getPlanFooterBadgeClassName(status: PlanFooterStatus): string {
  return PLAN_FOOTER_THEME[status].badge;
}

export function getPlanFooterLabelClassName(status: PlanFooterStatus): string {
  return PLAN_FOOTER_THEME[status].label;
}

export function getPlanFooterTitleClassName(status: PlanFooterStatus): string {
  return PLAN_FOOTER_THEME[status].title;
}
