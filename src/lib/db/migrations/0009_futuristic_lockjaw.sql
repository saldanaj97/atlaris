CREATE TABLE "plan_schedules" (
	"plan_id" uuid PRIMARY KEY NOT NULL,
	"schedule_json" jsonb NOT NULL,
	"inputs_hash" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"timezone" text NOT NULL,
	"weekly_hours" integer NOT NULL,
	"start_date" date NOT NULL,
	"deadline" date
);
--> statement-breakpoint
ALTER TABLE "plan_schedules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY "resource_search_cache_select_service" ON "resource_search_cache" CASCADE;--> statement-breakpoint
DROP POLICY "resource_search_cache_insert_service" ON "resource_search_cache" CASCADE;--> statement-breakpoint
DROP POLICY "resource_search_cache_update_service" ON "resource_search_cache" CASCADE;--> statement-breakpoint
DROP POLICY "resource_search_cache_delete_service" ON "resource_search_cache" CASCADE;--> statement-breakpoint
DROP TABLE "resource_search_cache" CASCADE;--> statement-breakpoint
ALTER TABLE "plan_schedules" ADD CONSTRAINT "plan_schedules_plan_id_learning_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."learning_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_plan_schedules_inputs_hash" ON "plan_schedules" USING btree ("inputs_hash");--> statement-breakpoint
CREATE POLICY "plan_schedules_select_own" ON "plan_schedules" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        EXISTS (
          SELECT 1 FROM "learning_plans"
          WHERE "learning_plans"."id" = "plan_schedules"."plan_id"
          AND "learning_plans"."user_id" IN (
            SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
          )
        )
      );--> statement-breakpoint
CREATE POLICY "plan_schedules_select_service" ON "plan_schedules" AS PERMISSIVE FOR SELECT TO "service_role" USING (true);--> statement-breakpoint
CREATE POLICY "plan_schedules_insert_own" ON "plan_schedules" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        EXISTS (
          SELECT 1 FROM "learning_plans"
          WHERE "learning_plans"."id" = "plan_schedules"."plan_id"
          AND "learning_plans"."user_id" IN (
            SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
          )
        )
      );--> statement-breakpoint
CREATE POLICY "plan_schedules_update_own" ON "plan_schedules" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        EXISTS (
          SELECT 1 FROM "learning_plans"
          WHERE "learning_plans"."id" = "plan_schedules"."plan_id"
          AND "learning_plans"."user_id" IN (
            SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
          )
        )
      ) WITH CHECK (
        EXISTS (
          SELECT 1 FROM "learning_plans"
          WHERE "learning_plans"."id" = "plan_schedules"."plan_id"
          AND "learning_plans"."user_id" IN (
            SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
          )
        )
      );--> statement-breakpoint
CREATE POLICY "plan_schedules_insert_service" ON "plan_schedules" AS PERMISSIVE FOR INSERT TO "service_role" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "plan_schedules_update_service" ON "plan_schedules" AS PERMISSIVE FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "plan_schedules_delete_own" ON "plan_schedules" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        EXISTS (
          SELECT 1 FROM "learning_plans"
          WHERE "learning_plans"."id" = "plan_schedules"."plan_id"
          AND "learning_plans"."user_id" IN (
            SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
          )
        )
      );--> statement-breakpoint
CREATE POLICY "plan_schedules_delete_service" ON "plan_schedules" AS PERMISSIVE FOR DELETE TO "service_role" USING (true);