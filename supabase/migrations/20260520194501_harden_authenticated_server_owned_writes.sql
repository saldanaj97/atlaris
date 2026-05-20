-- Browser Supabase clients run as `authenticated`. Row ownership RLS is not
-- enough for trusted billing/generation state because the attacker owns the
-- rows they want to corrupt.

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE ON TABLES FROM authenticated;

REVOKE INSERT, UPDATE, DELETE ON
  "ai_usage_events",
  "generation_attempts",
  "learning_plans",
  "modules",
  "plan_schedules",
  "resources",
  "task_resources",
  "tasks",
  "usage_metrics"
FROM authenticated;

-- Users may create/read their own profile row and update only explicit
-- preference fields. Profile deletion and billing/system fields stay server-owned.
REVOKE DELETE ON "users" FROM authenticated;
REVOKE UPDATE ON "users" FROM authenticated;
GRANT UPDATE (name, preferred_ai_model, updated_at) ON "users" TO authenticated;

-- User task progress is intentionally user-editable product state.
GRANT INSERT, UPDATE, DELETE ON "task_progress" TO authenticated;

DROP POLICY IF EXISTS "usage_metrics_insert_own" ON "usage_metrics";
DROP POLICY IF EXISTS "usage_metrics_update_own" ON "usage_metrics";
DROP POLICY IF EXISTS "usage_metrics_delete_own" ON "usage_metrics";
DROP POLICY IF EXISTS "ai_usage_events_insert_own" ON "ai_usage_events";

DROP POLICY IF EXISTS "learning_plans_insert" ON "learning_plans";
DROP POLICY IF EXISTS "learning_plans_update" ON "learning_plans";
DROP POLICY IF EXISTS "learning_plans_delete" ON "learning_plans";

DROP POLICY IF EXISTS "plan_schedules_insert" ON "plan_schedules";
DROP POLICY IF EXISTS "plan_schedules_update" ON "plan_schedules";
DROP POLICY IF EXISTS "plan_schedules_delete" ON "plan_schedules";

DROP POLICY IF EXISTS "generation_attempts_insert" ON "generation_attempts";
DROP POLICY IF EXISTS "generation_attempts_update" ON "generation_attempts";
DROP POLICY IF EXISTS "generation_attempts_delete_deny" ON "generation_attempts";

DROP POLICY IF EXISTS "modules_insert_own_plan" ON "modules";
DROP POLICY IF EXISTS "modules_update_own_plan" ON "modules";
DROP POLICY IF EXISTS "modules_delete_own_plan" ON "modules";

DROP POLICY IF EXISTS "tasks_insert_own_plan" ON "tasks";
DROP POLICY IF EXISTS "tasks_update_own_plan" ON "tasks";
DROP POLICY IF EXISTS "tasks_delete_own_plan" ON "tasks";

DROP POLICY IF EXISTS "task_resources_insert_own_plan" ON "task_resources";
DROP POLICY IF EXISTS "task_resources_update_own_plan" ON "task_resources";
DROP POLICY IF EXISTS "task_resources_delete_own_plan" ON "task_resources";
