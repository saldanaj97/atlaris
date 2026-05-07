DROP POLICY "google_calendar_sync_state_select_own" ON "google_calendar_sync_state" CASCADE;--> statement-breakpoint
DROP POLICY "google_calendar_sync_state_insert_own" ON "google_calendar_sync_state" CASCADE;--> statement-breakpoint
DROP POLICY "google_calendar_sync_state_update_own" ON "google_calendar_sync_state" CASCADE;--> statement-breakpoint
DROP POLICY "google_calendar_sync_state_delete_own" ON "google_calendar_sync_state" CASCADE;--> statement-breakpoint
DROP TABLE "google_calendar_sync_state" CASCADE;--> statement-breakpoint
DROP POLICY "integration_tokens_select_own" ON "integration_tokens" CASCADE;--> statement-breakpoint
DROP POLICY "integration_tokens_insert_own" ON "integration_tokens" CASCADE;--> statement-breakpoint
DROP POLICY "integration_tokens_update_own" ON "integration_tokens" CASCADE;--> statement-breakpoint
DROP POLICY "integration_tokens_delete_own" ON "integration_tokens" CASCADE;--> statement-breakpoint
DROP TABLE "integration_tokens" CASCADE;--> statement-breakpoint
DROP POLICY "task_calendar_events_select_own" ON "task_calendar_events" CASCADE;--> statement-breakpoint
DROP POLICY "task_calendar_events_insert_own" ON "task_calendar_events" CASCADE;--> statement-breakpoint
DROP POLICY "task_calendar_events_update_own" ON "task_calendar_events" CASCADE;--> statement-breakpoint
DROP POLICY "task_calendar_events_delete_own" ON "task_calendar_events" CASCADE;--> statement-breakpoint
DROP TABLE "task_calendar_events" CASCADE;--> statement-breakpoint
DROP TYPE "public"."integration_provider";
