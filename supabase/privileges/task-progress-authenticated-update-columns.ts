/** PostgreSQL columns browser clients may update on public.task_progress. */
export const TASK_PROGRESS_AUTHENTICATED_UPDATE_COLUMNS = [
  'status',
  'completed_at',
  'updated_at',
] as const;

export const TASK_PROGRESS_AUTHENTICATED_UPDATE_COLUMNS_SQL =
  TASK_PROGRESS_AUTHENTICATED_UPDATE_COLUMNS.join(', ');
