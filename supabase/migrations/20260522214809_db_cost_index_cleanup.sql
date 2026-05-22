-- Drop structurally redundant indexes now covered by unique composites.
DROP INDEX IF EXISTS public.idx_modules_plan_id;
DROP INDEX IF EXISTS public.idx_modules_plan_id_order;
DROP INDEX IF EXISTS public.idx_tasks_module_id;
DROP INDEX IF EXISTS public.idx_tasks_module_id_order;
DROP INDEX IF EXISTS public.idx_task_resources_task_id;

-- Replace broad plan-list and queue-polling indexes with measured query-aligned indexes.
DROP INDEX IF EXISTS public.idx_learning_plans_user_id;
CREATE INDEX IF NOT EXISTS idx_learning_plans_user_created_at_desc
  ON public.learning_plans (user_id, created_at DESC);

DROP INDEX IF EXISTS public.idx_job_queue_status_scheduled_priority;
CREATE INDEX IF NOT EXISTS idx_job_queue_pending_claim
  ON public.job_queue (job_type, priority DESC, created_at)
  WHERE status = 'pending';

-- Drop unused left-prefix or unqueried indexes covered by active access patterns.
DROP INDEX IF EXISTS public.idx_usage_metrics_user_id;
DROP INDEX IF EXISTS public.idx_usage_metrics_month;
DROP INDEX IF EXISTS public.idx_ai_usage_user_id;
DROP INDEX IF EXISTS public.idx_plan_schedules_inputs_hash;
