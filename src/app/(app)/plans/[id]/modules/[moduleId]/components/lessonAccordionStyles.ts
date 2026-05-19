import { PLAN_RESOURCE_DISPLAY } from '@/app/(app)/plans/resource-display';

export const RESOURCE_CONFIG = PLAN_RESOURCE_DISPLAY;

export function getCardClassName(
  isLocked: boolean,
  isCompleted: boolean,
): string {
  if (isLocked) {
    return 'border-stone-200/50 bg-stone-100/50 opacity-75 dark:border-stone-700/50 dark:bg-stone-800/30';
  }
  if (isCompleted) {
    return 'border-success/30 bg-success/5 dark:border-success/30 dark:bg-success/10';
  }
  return 'border-panel-border bg-panel shadow-sm hover:border-primary/30 hover:shadow-md dark:border-border dark:hover:border-primary/30';
}

export function getMarkerClassName(
  isLocked: boolean,
  isCompleted: boolean,
): string {
  if (isLocked) {
    return 'bg-stone-200 text-stone-400 dark:bg-stone-700 dark:text-stone-500';
  }
  if (isCompleted) {
    return 'bg-success text-success-foreground';
  }
  return 'bg-primary/20 text-primary dark:bg-primary/20 dark:text-primary';
}

export function getTitleClassName(
  isLocked: boolean,
  isCompleted: boolean,
): string {
  if (isLocked) {
    return 'text-stone-400 dark:text-stone-500';
  }
  if (isCompleted) {
    return 'text-success dark:text-success';
  }
  return 'text-stone-900 dark:text-stone-100';
}

export function getMutedTextClassName(isLocked: boolean): string {
  return isLocked
    ? 'text-stone-400 dark:text-stone-500'
    : 'text-stone-500 dark:text-stone-400';
}

export function getStableEntries<T>(
  items: readonly T[],
  getSignature: (item: T) => string,
): Array<{ key: string; item: T }> {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const signature = getSignature(item);
    const occurrence = seen.get(signature) ?? 0;
    seen.set(signature, occurrence + 1);
    return { key: `${signature}-${occurrence}`, item };
  });
}
