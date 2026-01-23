export type PlanStatus =
  | 'active'
  | 'paused'
  | 'completed'
  | 'generating'
  | 'failed';
export type FilterStatus = 'all' | PlanStatus | 'inactive';
