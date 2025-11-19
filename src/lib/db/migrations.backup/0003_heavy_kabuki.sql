DO $$ BEGIN
    CREATE TYPE "job_status" AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "job_type" AS ENUM ('plan_generation');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE "job_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid,
	"user_id" uuid NOT NULL,
	"job_type" "job_type" NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"payload" jsonb NOT NULL,
	"result" jsonb,
	"error" text,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"scheduled_for" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attempts_check" CHECK ("job_queue"."attempts" >= 0),
	CONSTRAINT "max_attempts_check" CHECK ("job_queue"."max_attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "job_queue" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "job_queue" ADD CONSTRAINT "job_queue_plan_id_learning_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."learning_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_queue" ADD CONSTRAINT "job_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_job_queue_status_scheduled_priority" ON "job_queue" USING btree ("status","scheduled_for","priority");--> statement-breakpoint
CREATE INDEX "idx_job_queue_user_id" ON "job_queue" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_job_queue_plan_id" ON "job_queue" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "idx_job_queue_created_at" ON "job_queue" USING btree ("created_at");--> statement-breakpoint
CREATE POLICY "job_queue_select_own" ON "job_queue" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("job_queue"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
      ));--> statement-breakpoint
CREATE POLICY "job_queue_select_service" ON "job_queue" AS PERMISSIVE FOR SELECT TO "service_role" USING (true);--> statement-breakpoint
CREATE POLICY "job_queue_insert_own" ON "job_queue" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("job_queue"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
      ));--> statement-breakpoint
CREATE POLICY "job_queue_insert_service" ON "job_queue" AS PERMISSIVE FOR INSERT TO "service_role" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "job_queue_update_service" ON "job_queue" AS PERMISSIVE FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "job_queue_delete_service" ON "job_queue" AS PERMISSIVE FOR DELETE TO "service_role" USING (true);--> statement-breakpoint
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
            SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
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
