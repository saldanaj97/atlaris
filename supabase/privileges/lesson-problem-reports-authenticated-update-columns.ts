/** PostgreSQL columns browser clients may update on public.lesson_problem_reports. */
export const LESSON_PROBLEM_REPORTS_AUTHENTICATED_UPDATE_COLUMNS = [
  'reason',
  'note',
  'lesson_content_updated_at',
  'updated_at',
] as const;

export const LESSON_PROBLEM_REPORTS_AUTHENTICATED_UPDATE_COLUMNS_SQL =
  LESSON_PROBLEM_REPORTS_AUTHENTICATED_UPDATE_COLUMNS.join(', ');
