export type ProgressSurfaceKind = 'locked' | 'active' | 'completed';

export type ModuleStatus = ProgressSurfaceKind;

export type PlanFooterStatus = 'complete' | 'incomplete';

const TIMELINE_MODULE_THEME: Record<
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
    marker: 'border-muted-foreground/60 text-muted-foreground/70',
    card: 'border-border bg-panel-muted shadow-sm dark:bg-muted/30',
    badge: 'bg-muted text-foreground/70',
    title: 'text-foreground/70',
  },
};

export const PLAN_FOOTER_THEME: Record<
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
    marker: TIMELINE_MODULE_THEME.completed.marker,
    card: 'border-success/30 bg-success/5 dark:border-success/30 dark:bg-success/10',
    badge: TIMELINE_MODULE_THEME.completed.badge,
    label: 'text-success',
    title: 'text-foreground',
  },
  incomplete: {
    marker: TIMELINE_MODULE_THEME.locked.marker,
    card: 'border-dashed border-border bg-muted/40',
    badge: TIMELINE_MODULE_THEME.locked.badge,
    label: 'text-muted-foreground',
    title: 'text-foreground',
  },
};

const LESSON_PROGRESS_THEME: Record<
  ProgressSurfaceKind,
  { marker: string; card: string; title: string; mutedText: string }
> = {
  completed: {
    marker: 'bg-success text-success-foreground',
    card: PLAN_FOOTER_THEME.complete.card,
    title: 'text-success dark:text-success',
    mutedText: 'text-muted-foreground',
  },
  active: {
    marker: 'bg-primary/20 text-primary dark:bg-primary/20 dark:text-primary',
    card: 'border-panel-border bg-panel shadow-sm hover:border-primary/30 hover:shadow-md dark:border-border dark:hover:border-primary/30',
    title: 'text-foreground',
    mutedText: 'text-muted-foreground',
  },
  locked: {
    marker: 'bg-muted text-muted-foreground/70',
    card: `${TIMELINE_MODULE_THEME.locked.card} opacity-90`,
    title: 'text-foreground/70',
    mutedText: 'text-muted-foreground/80',
  },
};

export function getTimelineMarkerClassName(status: ModuleStatus): string {
  return TIMELINE_MODULE_THEME[status].marker;
}

export function getTimelineCardClassName(status: ModuleStatus): string {
  return TIMELINE_MODULE_THEME[status].card;
}

export function getTimelineWeekBadgeClassName(status: ModuleStatus): string {
  return TIMELINE_MODULE_THEME[status].badge;
}

export function getTimelineTitleClassName(status: ModuleStatus): string {
  return TIMELINE_MODULE_THEME[status].title;
}

function lessonProgressKind(
  isLocked: boolean,
  isCompleted: boolean,
): ProgressSurfaceKind {
  if (isLocked) {
    return 'locked';
  }
  return isCompleted ? 'completed' : 'active';
}

export function getLessonCardClassName(
  isLocked: boolean,
  isCompleted: boolean,
): string {
  return LESSON_PROGRESS_THEME[lessonProgressKind(isLocked, isCompleted)].card;
}

export function getLessonMarkerClassName(
  isLocked: boolean,
  isCompleted: boolean,
): string {
  return LESSON_PROGRESS_THEME[lessonProgressKind(isLocked, isCompleted)]
    .marker;
}

export function getLessonTitleClassName(
  isLocked: boolean,
  isCompleted: boolean,
): string {
  return LESSON_PROGRESS_THEME[lessonProgressKind(isLocked, isCompleted)].title;
}

export function getLessonMutedTextClassName(isLocked: boolean): string {
  return LESSON_PROGRESS_THEME[isLocked ? 'locked' : 'active'].mutedText;
}
