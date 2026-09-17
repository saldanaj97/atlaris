import type { FilterStatus } from '@/features/plans/read-projection/types';

/** Visible plan-library status tabs. */
export const PLANS_LIBRARY_FILTER_STATUSES = [
  'all',
  'active',
  'completed',
  'generating',
  'failed',
] as const;

export type PlansLibraryFilterStatus =
  (typeof PLANS_LIBRARY_FILTER_STATUSES)[number];

const SUPPORTED_QUERY_STATUSES = new Set<string>([
  ...PLANS_LIBRARY_FILTER_STATUSES,
  'not_started',
  'inactive',
]);

const STATUS_ALIASES: Record<string, FilterStatus> = {
  'not-started': 'not_started',
  paused: 'inactive',
};

/**
 * Maps a library `status` query value onto a supported filter.
 * Visible tabs stay as-is. Retired tabs and their URL aliases still filter.
 * Unknown values become All.
 */
export function resolvePlansLibraryFilterStatus(value: string): FilterStatus {
  if (SUPPORTED_QUERY_STATUSES.has(value)) {
    return value as FilterStatus;
  }

  return STATUS_ALIASES[value] ?? 'all';
}

export function plansLibraryFilterLabel(status: FilterStatus): string {
  switch (status) {
    case 'all':
      return 'All plans';
    case 'active':
      return 'Active';
    case 'completed':
      return 'Completed';
    case 'generating':
      return 'Generating';
    case 'failed':
      return 'Failed';
    case 'not_started':
      return 'Not started';
    case 'inactive':
      return 'Inactive';
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}
