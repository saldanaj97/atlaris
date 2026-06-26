/**
 * Public-schema tables whose billing, generation, cache, or content writes are
 * owned by trusted server code, not by browser Supabase clients.
 *
 * Keep in sync with
 * `supabase/migrations/20260520194501_harden_authenticated_server_owned_writes.sql`
 * and test/CI bootstrap SQL.
 */
export const AUTHENTICATED_SERVER_OWNED_WRITE_TABLES = [
  'ai_usage_events',
  'generation_attempts',
  'learning_activity_events',
  'learning_plans',
  'modules',
  'plan_schedules',
  'resources',
  'task_resources',
  'tasks',
  'usage_metrics',
] as const;

export const AUTHENTICATED_SERVER_OWNED_WRITE_TABLES_SQL =
  AUTHENTICATED_SERVER_OWNED_WRITE_TABLES.map((table) => `"${table}"`).join(
    ', ',
  );
