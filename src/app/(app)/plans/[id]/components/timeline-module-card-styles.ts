import type { ModuleStatus } from './TimelineModuleCard';

export function getMarkerClassName(status: ModuleStatus): string {
  switch (status) {
    case 'completed':
      return 'border-success text-success';
    case 'active':
      return 'scale-110 border-primary text-primary shadow-[0_0_12px_hsl(var(--primary)/0.4)]';
    case 'locked':
      return 'border-stone-300 text-stone-300 dark:border-stone-600 dark:text-stone-600';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function getCardClassName(status: ModuleStatus): string {
  switch (status) {
    case 'active':
      return 'border-primary/30 bg-white shadow-md dark:border-primary/50 dark:bg-stone-900';
    case 'locked':
      return 'border-stone-200 bg-stone-50 dark:border-stone-800 dark:bg-stone-900/70';
    case 'completed':
      return 'border-stone-100 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function getWeekBadgeClassName(status: ModuleStatus): string {
  switch (status) {
    case 'active':
      return 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary';
    case 'completed':
      return 'bg-success/15 text-success dark:bg-success/25 dark:text-success-foreground';
    case 'locked':
      return 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function getTitleClassName(status: ModuleStatus): string {
  switch (status) {
    case 'active':
      return 'text-stone-900 dark:text-stone-100';
    case 'locked':
      return 'text-stone-600 dark:text-stone-400';
    case 'completed':
      return 'text-stone-700 dark:text-stone-300';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}
