DROP INDEX IF EXISTS "idx_modules_plan_id";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_modules_plan_id_order";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_tasks_module_id";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_tasks_module_id_order";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_task_resources_task_id";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_learning_plans_user_id";--> statement-breakpoint
CREATE INDEX "idx_learning_plans_user_created_at_desc" ON "learning_plans" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
DROP INDEX IF EXISTS "idx_job_queue_status_scheduled_priority";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_job_queue_pending_claim";--> statement-breakpoint
CREATE INDEX "idx_job_queue_pending_claim" ON "job_queue" USING btree ("job_type","scheduled_for","priority" DESC NULLS LAST,"created_at") WHERE "job_queue"."status" = 'pending';--> statement-breakpoint
DROP INDEX IF EXISTS "idx_usage_metrics_user_id";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_usage_metrics_month";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_ai_usage_user_id";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_plan_schedules_inputs_hash";
