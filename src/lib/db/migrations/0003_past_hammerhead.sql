CREATE TABLE "generation_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" text NOT NULL,
	"classification" text,
	"duration_ms" integer NOT NULL,
	"modules_count" integer NOT NULL,
	"tasks_count" integer NOT NULL,
	"truncated_topic" boolean DEFAULT false NOT NULL,
	"truncated_notes" boolean DEFAULT false NOT NULL,
	"normalized_effort" boolean DEFAULT false NOT NULL,
	"prompt_hash" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generation_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "learning_plans" ADD COLUMN "status" "plan_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_plans" ADD COLUMN "error_code" varchar(50);--> statement-breakpoint
ALTER TABLE "learning_plans" ADD COLUMN "error_message" text;--> statement-breakpoint
ALTER TABLE "learning_plans" ADD COLUMN "error_details" jsonb;--> statement-breakpoint
ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_plan_id_learning_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."learning_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_generation_attempts_plan_id" ON "generation_attempts" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "idx_generation_attempts_created_at" ON "generation_attempts" USING btree ("created_at");--> statement-breakpoint
CREATE POLICY "generation_attempts_select_own_plan" ON "generation_attempts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        EXISTS (
          SELECT 1 FROM "learning_plans"
          WHERE "learning_plans"."id" = "generation_attempts"."plan_id"
          AND "learning_plans"."user_id" IN (
            SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
          )
        )
      );--> statement-breakpoint
CREATE POLICY "generation_attempts_select_service" ON "generation_attempts" AS PERMISSIVE FOR SELECT TO "service_role" USING (true);--> statement-breakpoint
CREATE POLICY "generation_attempts_insert_own_plan" ON "generation_attempts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        EXISTS (
          SELECT 1 FROM "learning_plans"
          WHERE "learning_plans"."id" = "generation_attempts"."plan_id"
          AND "learning_plans"."user_id" IN (
            SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
          )
        )
      );--> statement-breakpoint
CREATE POLICY "generation_attempts_insert_service" ON "generation_attempts" AS PERMISSIVE FOR INSERT TO "service_role" WITH CHECK (true);--> statement-breakpoint
ALTER POLICY "learning_plans_select_own" ON "learning_plans" TO authenticated USING ("learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
      ));--> statement-breakpoint
ALTER POLICY "learning_plans_insert_own" ON "learning_plans" TO authenticated WITH CHECK ("learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
      ));--> statement-breakpoint
ALTER POLICY "learning_plans_update_own" ON "learning_plans" TO authenticated USING ("learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
      )) WITH CHECK ("learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
      ));--> statement-breakpoint
ALTER POLICY "learning_plans_delete_own" ON "learning_plans" TO authenticated USING ("learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
      ));--> statement-breakpoint
ALTER POLICY "modules_select_own_plan" ON "modules" TO authenticated USING (
        EXISTS (
          SELECT 1 FROM "learning_plans"
          WHERE "learning_plans"."id" = "modules"."plan_id"
          AND "learning_plans"."user_id" IN (
            SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')

          )
        )
      );--> statement-breakpoint
ALTER POLICY "modules_insert_own_plan" ON "modules" TO authenticated WITH CHECK (
        EXISTS (
          SELECT 1 FROM "learning_plans"
          WHERE "learning_plans"."id" = "modules"."plan_id"
          AND "learning_plans"."user_id" IN (
            SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
          )
        )
      );--> statement-breakpoint
ALTER POLICY "modules_update_own_plan" ON "modules" TO authenticated USING (
        EXISTS (
          SELECT 1 FROM "learning_plans"
          WHERE "learning_plans"."id" = "modules"."plan_id"
          AND "learning_plans"."user_id" IN (
            SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
          )
        )
      ) WITH CHECK (
        EXISTS (
          SELECT 1 FROM "learning_plans"
          WHERE "learning_plans"."id" = "modules"."plan_id"
          AND "learning_plans"."user_id" IN (
            SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
          )
        )
      );--> statement-breakpoint
ALTER POLICY "modules_delete_own_plan" ON "modules" TO authenticated USING (
        EXISTS (
          SELECT 1 FROM "learning_plans"
          WHERE "learning_plans"."id" = "modules"."plan_id"
          AND "learning_plans"."user_id" IN (
            SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
          )
        )
      );--> statement-breakpoint
ALTER POLICY "plan_generations_select_own" ON "plan_generations" TO authenticated USING (
        EXISTS (
          SELECT 1 FROM "learning_plans"
          WHERE "learning_plans"."id" = "plan_generations"."plan_id"
          AND "learning_plans"."user_id" IN (
            SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')

          )
        )
      );--> statement-breakpoint
ALTER POLICY "plan_generations_insert_own" ON "plan_generations" TO authenticated WITH CHECK (
        EXISTS (
          SELECT 1 FROM "learning_plans"
          WHERE "learning_plans"."id" = "plan_generations"."plan_id"
          AND "learning_plans"."user_id" IN (
            SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
          )
        )
      );--> statement-breakpoint
ALTER POLICY "plan_generations_update_own" ON "plan_generations" TO authenticated USING (
        EXISTS (
          SELECT 1 FROM "learning_plans"
          WHERE "learning_plans"."id" = "plan_generations"."plan_id"
          AND "learning_plans"."user_id" IN (
            SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
          )
        )
      ) WITH CHECK (
        EXISTS (
          SELECT 1 FROM "learning_plans"
          WHERE "learning_plans"."id" = "plan_generations"."plan_id"
          AND "learning_plans"."user_id" IN (
            SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.uid())
          )
        )
      );--> statement-breakpoint
ALTER POLICY "plan_generations_delete_own" ON "plan_generations" TO authenticated USING (
        EXISTS (
          SELECT 1 FROM "learning_plans"
          WHERE "learning_plans"."id" = "plan_generations"."plan_id"
          AND "learning_plans"."user_id" IN (
            SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
          )
        )
      );--> statement-breakpoint
ALTER POLICY "task_progress_select_own" ON "task_progress" TO authenticated USING ("task_progress"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
      ));--> statement-breakpoint
ALTER POLICY "task_progress_insert_own" ON "task_progress" TO authenticated WITH CHECK (
        "task_progress"."user_id" IN (
          SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
        ) AND
        EXISTS (
          SELECT 1 FROM "tasks"
          JOIN "modules" ON "modules"."id" = "tasks"."module_id"
          JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
          WHERE "tasks"."id" = "task_progress"."task_id"
          AND (
            "learning_plans"."user_id" IN (
              SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
            ) OR
            "learning_plans"."visibility" = 'public'
          )
        )
      );--> statement-breakpoint
ALTER POLICY "task_progress_update_own" ON "task_progress" TO authenticated USING ("task_progress"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')

      )) WITH CHECK ("task_progress"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
      ));--> statement-breakpoint
ALTER POLICY "task_progress_delete_own" ON "task_progress" TO authenticated USING ("task_progress"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
      ));--> statement-breakpoint
ALTER POLICY "task_resources_select_own_plan" ON "task_resources" TO authenticated USING (
        EXISTS (
          SELECT 1 FROM "tasks"
          JOIN "modules" ON "modules"."id" = "tasks"."module_id"
          JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
          WHERE "tasks"."id" = "task_resources"."task_id"
          AND "learning_plans"."user_id" IN (
            SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')

          )
        )
      );--> statement-breakpoint
ALTER POLICY "task_resources_insert_own_plan" ON "task_resources" TO authenticated WITH CHECK (
        EXISTS (
          SELECT 1 FROM "tasks"
          JOIN "modules" ON "modules"."id" = "tasks"."module_id"
          JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
          WHERE "tasks"."id" = "task_resources"."task_id"
          AND "learning_plans"."user_id" IN (
            SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
          )
        )
      );--> statement-breakpoint
ALTER POLICY "task_resources_update_own_plan" ON "task_resources" TO authenticated USING (
        EXISTS (
          SELECT 1 FROM "tasks"
          JOIN "modules" ON "modules"."id" = "tasks"."module_id"
          JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
          WHERE "tasks"."id" = "task_resources"."task_id"
          AND "learning_plans"."user_id" IN (
            SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
          )
        )
      ) WITH CHECK (
        EXISTS (
          SELECT 1 FROM "tasks"
          JOIN "modules" ON "modules"."id" = "tasks"."module_id"
          JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
          WHERE "tasks"."id" = "task_resources"."task_id"
          AND "learning_plans"."user_id" IN (
            SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
          )
        )
      );--> statement-breakpoint
ALTER POLICY "task_resources_delete_own_plan" ON "task_resources" TO authenticated USING (
        EXISTS (
          SELECT 1 FROM "tasks"
          JOIN "modules" ON "modules"."id" = "tasks"."module_id"
          JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
          WHERE "tasks"."id" = "task_resources"."task_id"
          AND "learning_plans"."user_id" IN (
            SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
          )
        )
      );--> statement-breakpoint
ALTER POLICY "tasks_select_own_plan" ON "tasks" TO authenticated USING (
        EXISTS (
          SELECT 1 FROM "modules"
          JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
          WHERE "modules"."id" = "tasks"."module_id"
          AND "learning_plans"."user_id" IN (
            SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')

          )
        )
      );--> statement-breakpoint
ALTER POLICY "tasks_insert_own_plan" ON "tasks" TO authenticated WITH CHECK (
        EXISTS (
          SELECT 1 FROM "modules"
          JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
          WHERE "modules"."id" = "tasks"."module_id"
          AND "learning_plans"."user_id" IN (
            SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
          )
        )
      );--> statement-breakpoint
ALTER POLICY "tasks_update_own_plan" ON "tasks" TO authenticated USING (
        EXISTS (
          SELECT 1 FROM "modules"
          JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
          WHERE "modules"."id" = "tasks"."module_id"
          AND "learning_plans"."user_id" IN (
            SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
          )
        )
      ) WITH CHECK (
        EXISTS (
          SELECT 1 FROM "modules"
          JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
          WHERE "modules"."id" = "tasks"."module_id"
          AND "learning_plans"."user_id" IN (
            SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
          )
        )
      );--> statement-breakpoint
ALTER POLICY "tasks_delete_own_plan" ON "tasks" TO authenticated USING (
        EXISTS (
          SELECT 1 FROM "modules"
          JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
          WHERE "modules"."id" = "tasks"."module_id"
          AND "learning_plans"."user_id" IN (
            SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
          )
        )
      );--> statement-breakpoint
ALTER POLICY "users_select_own" ON "users" TO authenticated USING ("users"."clerk_user_id" = (select auth.jwt()->>'sub'));--> statement-breakpoint
ALTER POLICY "users_insert_own" ON "users" TO authenticated WITH CHECK ("users"."clerk_user_id" = (select auth.jwt()->>'sub'));--> statement-breakpoint
ALTER POLICY "users_update_own_profile" ON "users" TO authenticated USING ("users"."clerk_user_id" = (select auth.jwt()->>'sub')) WITH CHECK ("users"."clerk_user_id" = (select auth.jwt()->>'sub'));