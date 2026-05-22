import { PLAN_RESOURCE_DISPLAY } from '@/app/(app)/plans/resource-display';

export const RESOURCE_CONFIG = PLAN_RESOURCE_DISPLAY;

export {
  getLessonCardClassName,
  getLessonMarkerClassName,
  getLessonMutedTextClassName,
  getLessonTitleClassName,
} from '@/app/(app)/plans/plans-progress-theme';

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
