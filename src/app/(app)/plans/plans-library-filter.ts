/** Visible plan-library status tabs. Hidden API statuses fall back to All. */
export const PLANS_LIBRARY_FILTER_STATUSES = [
  'all',
  'active',
  'completed',
  'generating',
  'failed',
] as const;

export type PlansLibraryFilterStatus =
  (typeof PLANS_LIBRARY_FILTER_STATUSES)[number];

const VISIBLE_FILTERS = new Set<string>(PLANS_LIBRARY_FILTER_STATUSES);

/**
 * Maps a library `status` query value onto a visible filter.
 * Retired tabs (`not_started`, `inactive`, and their URL aliases) become All.
 */
export function resolvePlansLibraryFilterStatus(
  value: string,
): PlansLibraryFilterStatus {
  if (VISIBLE_FILTERS.has(value)) {
    return value as PlansLibraryFilterStatus;
  }

  return 'all';
}
