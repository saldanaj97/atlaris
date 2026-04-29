import type { DbClient } from '@/lib/db/types';

export type PlanDbClient = DbClient;

export type PlanReadStatus =
  | 'active'
  | 'paused'
  | 'completed'
  | 'generating'
  | 'failed';

/**
 * List-filter status used by plan read projections.
 * `inactive` is a UI aggregate for non-active plan rows rather than a DB status.
 */
export type FilterStatus = 'all' | PlanReadStatus | 'inactive';
