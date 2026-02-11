CREATE INDEX IF NOT EXISTS "idx_learning_plans_user_quota_generation_status" ON "learning_plans" USING btree ("user_id","is_quota_eligible","generation_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_task_progress_user_task" ON "task_progress" USING btree ("user_id","task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_task_resources_task_resource" ON "task_resources" USING btree ("task_id","resource_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_usage_metrics_user_month" ON "usage_metrics" USING btree ("user_id","month");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_usage_events_user_created_at" ON "ai_usage_events" USING btree ("user_id","created_at");
