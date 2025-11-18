ALTER TABLE "google_calendar_sync_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_calendar_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "monthly_export_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE POLICY "google_calendar_sync_state_select_own" ON "google_calendar_sync_state" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("google_calendar_sync_state"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
      ));--> statement-breakpoint
CREATE POLICY "google_calendar_sync_state_select_service" ON "google_calendar_sync_state" AS PERMISSIVE FOR SELECT TO "service_role" USING (true);--> statement-breakpoint
CREATE POLICY "google_calendar_sync_state_insert_own" ON "google_calendar_sync_state" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        "google_calendar_sync_state"."user_id" IN (
          SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
        )
        AND EXISTS (
          SELECT 1 FROM "learning_plans"
          WHERE "learning_plans"."id" = "google_calendar_sync_state"."plan_id"
          AND "learning_plans"."user_id" IN (
            SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
          )
        )
      );--> statement-breakpoint
CREATE POLICY "google_calendar_sync_state_insert_service" ON "google_calendar_sync_state" AS PERMISSIVE FOR INSERT TO "service_role" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "google_calendar_sync_state_update_own" ON "google_calendar_sync_state" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        "google_calendar_sync_state"."user_id" IN (
          SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
        )
        AND EXISTS (
          SELECT 1 FROM "learning_plans"
          WHERE "learning_plans"."id" = "google_calendar_sync_state"."plan_id"
          AND "learning_plans"."user_id" IN (
            SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
          )
        )
      ) WITH CHECK (
        "google_calendar_sync_state"."user_id" IN (
          SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
        )
        AND EXISTS (
          SELECT 1 FROM "learning_plans"
          WHERE "learning_plans"."id" = "google_calendar_sync_state"."plan_id"
          AND "learning_plans"."user_id" IN (
            SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
          )
        )
      );--> statement-breakpoint
CREATE POLICY "google_calendar_sync_state_update_service" ON "google_calendar_sync_state" AS PERMISSIVE FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "google_calendar_sync_state_delete_own" ON "google_calendar_sync_state" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        "google_calendar_sync_state"."user_id" IN (
          SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
        )
        AND EXISTS (
          SELECT 1 FROM "learning_plans"
          WHERE "learning_plans"."id" = "google_calendar_sync_state"."plan_id"
          AND "learning_plans"."user_id" IN (
            SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
          )
        )
      );--> statement-breakpoint
CREATE POLICY "google_calendar_sync_state_delete_service" ON "google_calendar_sync_state" AS PERMISSIVE FOR DELETE TO "service_role" USING (true);--> statement-breakpoint
CREATE POLICY "task_calendar_events_select_own" ON "task_calendar_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("task_calendar_events"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
      ));--> statement-breakpoint
CREATE POLICY "task_calendar_events_select_service" ON "task_calendar_events" AS PERMISSIVE FOR SELECT TO "service_role" USING (true);--> statement-breakpoint
CREATE POLICY "task_calendar_events_insert_own" ON "task_calendar_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("task_calendar_events"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
      ));--> statement-breakpoint
CREATE POLICY "task_calendar_events_insert_service" ON "task_calendar_events" AS PERMISSIVE FOR INSERT TO "service_role" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "task_calendar_events_update_own" ON "task_calendar_events" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("task_calendar_events"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
      )) WITH CHECK ("task_calendar_events"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
      ));--> statement-breakpoint
CREATE POLICY "task_calendar_events_update_service" ON "task_calendar_events" AS PERMISSIVE FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "task_calendar_events_delete_own" ON "task_calendar_events" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("task_calendar_events"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
      ));--> statement-breakpoint
CREATE POLICY "task_calendar_events_delete_service" ON "task_calendar_events" AS PERMISSIVE FOR DELETE TO "service_role" USING (true);