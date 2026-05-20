import type { ModuleStatus } from './TimelineModuleCard';

export function getMarkerClassName(status: ModuleStatus): string {
  switch (status) {
    case 'completed':
      return 'border-success text-success';
    case 'active':
      return 'scale-110 border-primary text-primary shadow-[0_0_12px_hsl(var(--primary)/0.4)]';
    case 'locked':
      return 'border-muted-foreground/40 text-muted-foreground/50';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function getCardClassName(status: ModuleStatus): string {
  switch (status) {
    case 'active':
      return 'border-primary/30 bg-panel shadow-md dark:border-primary/50';
    case 'locked':
      return 'border-border bg-muted/40 dark:bg-muted/25';
    case 'completed':
      return 'border-panel-border bg-panel shadow-sm';
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
      return 'bg-muted text-muted-foreground';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function getTitleClassName(status: ModuleStatus): string {
  switch (status) {
    case 'active':
      return 'text-foreground';
    case 'locked':
      return 'text-muted-foreground';
    case 'completed':
      return 'text-foreground/90';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}
