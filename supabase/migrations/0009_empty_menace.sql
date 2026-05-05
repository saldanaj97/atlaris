DROP POLICY "notion_sync_state_select_own" ON "notion_sync_state" CASCADE;--> statement-breakpoint
DROP POLICY "notion_sync_state_insert_own" ON "notion_sync_state" CASCADE;--> statement-breakpoint
DROP POLICY "notion_sync_state_update_own" ON "notion_sync_state" CASCADE;--> statement-breakpoint
DROP POLICY "notion_sync_state_delete_own" ON "notion_sync_state" CASCADE;--> statement-breakpoint
DROP TABLE "notion_sync_state" CASCADE;--> statement-breakpoint
DROP TABLE "clerk_webhook_events" CASCADE;--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "clerk_user_id" TO "auth_user_id";--> statement-breakpoint
ALTER TABLE "oauth_state_tokens" RENAME COLUMN "clerk_user_id" TO "auth_user_id";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_clerk_user_id_unique";--> statement-breakpoint
ALTER TABLE "integration_tokens" ALTER COLUMN "provider" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."integration_provider";--> statement-breakpoint
DELETE FROM "integration_tokens" WHERE "provider" <> 'google_calendar';--> statement-breakpoint
CREATE TYPE "public"."integration_provider" AS ENUM('google_calendar');--> statement-breakpoint
ALTER TABLE "integration_tokens" ALTER COLUMN "provider" SET DATA TYPE "public"."integration_provider" USING "provider"::"public"."integration_provider";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_auth_user_id_unique" UNIQUE("auth_user_id");--> statement-breakpoint
ALTER POLICY "users_select_own" ON "users" TO authenticated USING ("users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub');--> statement-breakpoint
ALTER POLICY "users_insert_own" ON "users" TO authenticated WITH CHECK ("users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub');--> statement-breakpoint
ALTER POLICY "users_update_own" ON "users" TO authenticated USING ("users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub') WITH CHECK ("users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub');--> statement-breakpoint
ALTER POLICY "google_calendar_sync_state_select_own" ON "google_calendar_sync_state" TO authenticated USING (
    "google_calendar_sync_state"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
ALTER POLICY "google_calendar_sync_state_insert_own" ON "google_calendar_sync_state" TO authenticated WITH CHECK (
    "google_calendar_sync_state"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
   AND 
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "google_calendar_sync_state"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
ALTER POLICY "google_calendar_sync_state_update_own" ON "google_calendar_sync_state" TO authenticated USING (
    "google_calendar_sync_state"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
   AND 
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "google_calendar_sync_state"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  ) WITH CHECK (
    "google_calendar_sync_state"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
   AND 
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "google_calendar_sync_state"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
ALTER POLICY "google_calendar_sync_state_delete_own" ON "google_calendar_sync_state" TO authenticated USING (
    "google_calendar_sync_state"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
   AND 
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "google_calendar_sync_state"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
ALTER POLICY "integration_tokens_select_own" ON "integration_tokens" TO authenticated USING (
    "integration_tokens"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
ALTER POLICY "integration_tokens_insert_own" ON "integration_tokens" TO authenticated WITH CHECK (
    "integration_tokens"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
ALTER POLICY "integration_tokens_update_own" ON "integration_tokens" TO authenticated USING (
    "integration_tokens"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  ) WITH CHECK (
    "integration_tokens"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
ALTER POLICY "integration_tokens_delete_own" ON "integration_tokens" TO authenticated USING (
    "integration_tokens"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
ALTER POLICY "oauth_state_tokens_insert" ON "oauth_state_tokens" TO authenticated WITH CHECK ("oauth_state_tokens"."auth_user_id" = (current_setting('request.jwt.claims', true)::json->>'sub'));--> statement-breakpoint
ALTER POLICY "oauth_state_tokens_select" ON "oauth_state_tokens" TO authenticated USING ("oauth_state_tokens"."auth_user_id" = (current_setting('request.jwt.claims', true)::json->>'sub'));--> statement-breakpoint
ALTER POLICY "oauth_state_tokens_delete" ON "oauth_state_tokens" TO authenticated USING ("oauth_state_tokens"."auth_user_id" = (current_setting('request.jwt.claims', true)::json->>'sub'));--> statement-breakpoint
ALTER POLICY "task_calendar_events_select_own" ON "task_calendar_events" TO authenticated USING (
    "task_calendar_events"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
   AND 
    EXISTS (
      SELECT 1 FROM "tasks"
      JOIN "modules" ON "modules"."id" = "tasks"."module_id"
      JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
      WHERE "tasks"."id" = "task_calendar_events"."task_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
ALTER POLICY "task_calendar_events_insert_own" ON "task_calendar_events" TO authenticated WITH CHECK (
    "task_calendar_events"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
   AND 
    EXISTS (
      SELECT 1 FROM "tasks"
      JOIN "modules" ON "modules"."id" = "tasks"."module_id"
      JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
      WHERE "tasks"."id" = "task_calendar_events"."task_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
ALTER POLICY "task_calendar_events_update_own" ON "task_calendar_events" TO authenticated USING (
    "task_calendar_events"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
   AND 
    EXISTS (
      SELECT 1 FROM "tasks"
      JOIN "modules" ON "modules"."id" = "tasks"."module_id"
      JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
      WHERE "tasks"."id" = "task_calendar_events"."task_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  ) WITH CHECK (
    "task_calendar_events"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
   AND 
    EXISTS (
      SELECT 1 FROM "tasks"
      JOIN "modules" ON "modules"."id" = "tasks"."module_id"
      JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
      WHERE "tasks"."id" = "task_calendar_events"."task_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
ALTER POLICY "task_calendar_events_delete_own" ON "task_calendar_events" TO authenticated USING (
    "task_calendar_events"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
   AND 
    EXISTS (
      SELECT 1 FROM "tasks"
      JOIN "modules" ON "modules"."id" = "tasks"."module_id"
      JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
      WHERE "tasks"."id" = "task_calendar_events"."task_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
ALTER POLICY "generation_attempts_select" ON "generation_attempts" TO authenticated USING (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "generation_attempts"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
ALTER POLICY "generation_attempts_insert" ON "generation_attempts" TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "generation_attempts"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
ALTER POLICY "learning_plans_select" ON "learning_plans" TO authenticated USING (
    "learning_plans"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
ALTER POLICY "learning_plans_insert" ON "learning_plans" TO authenticated WITH CHECK (
    "learning_plans"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
ALTER POLICY "learning_plans_update" ON "learning_plans" TO authenticated USING (
    "learning_plans"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  ) WITH CHECK (
    "learning_plans"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
ALTER POLICY "learning_plans_delete" ON "learning_plans" TO authenticated USING (
    "learning_plans"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
ALTER POLICY "plan_generations_select" ON "plan_generations" TO authenticated USING (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "plan_generations"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
ALTER POLICY "plan_generations_insert" ON "plan_generations" TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "plan_generations"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
ALTER POLICY "plan_generations_update" ON "plan_generations" TO authenticated USING (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "plan_generations"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "plan_generations"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
ALTER POLICY "plan_generations_delete" ON "plan_generations" TO authenticated USING (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "plan_generations"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
ALTER POLICY "plan_schedules_select" ON "plan_schedules" TO authenticated USING (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "plan_schedules"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
ALTER POLICY "plan_schedules_insert" ON "plan_schedules" TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "plan_schedules"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
ALTER POLICY "plan_schedules_update" ON "plan_schedules" TO authenticated USING (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "plan_schedules"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "plan_schedules"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
ALTER POLICY "plan_schedules_delete" ON "plan_schedules" TO authenticated USING (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "plan_schedules"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
ALTER POLICY "modules_select_own_plan" ON "modules" TO authenticated USING (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "modules"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
ALTER POLICY "modules_insert_own_plan" ON "modules" TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "modules"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
ALTER POLICY "modules_update_own_plan" ON "modules" TO authenticated USING (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "modules"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "modules"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
ALTER POLICY "modules_delete_own_plan" ON "modules" TO authenticated USING (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "modules"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
ALTER POLICY "task_progress_select_own" ON "task_progress" TO authenticated USING (
    "task_progress"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
ALTER POLICY "task_progress_insert_own" ON "task_progress" TO authenticated WITH CHECK (
          (
    "task_progress"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  )
          AND (
    EXISTS (
      SELECT 1 FROM "tasks"
      JOIN "modules" ON "modules"."id" = "tasks"."module_id"
      JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
      WHERE "tasks"."id" = "task_progress"."task_id"
      AND (
    "learning_plans"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  )
    )
  )
        );--> statement-breakpoint
ALTER POLICY "task_progress_update_own" ON "task_progress" TO authenticated USING (
    "task_progress"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  ) WITH CHECK (
        (
    "task_progress"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  )
        AND (
    EXISTS (
      SELECT 1 FROM "tasks"
      JOIN "modules" ON "modules"."id" = "tasks"."module_id"
      JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
      WHERE "tasks"."id" = "task_progress"."task_id"
      AND (
    "learning_plans"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  )
    )
  )
      );--> statement-breakpoint
ALTER POLICY "task_progress_delete_own" ON "task_progress" TO authenticated USING (
    "task_progress"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
ALTER POLICY "task_resources_select_own_plan" ON "task_resources" TO authenticated USING (
    EXISTS (
      SELECT 1 FROM "tasks"
      JOIN "modules" ON "modules"."id" = "tasks"."module_id"
      JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
      WHERE "tasks"."id" = "task_resources"."task_id"
      AND (
    "learning_plans"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  )
    )
  );--> statement-breakpoint
ALTER POLICY "task_resources_insert_own_plan" ON "task_resources" TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM "tasks"
      JOIN "modules" ON "modules"."id" = "tasks"."module_id"
      JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
      WHERE "tasks"."id" = "task_resources"."task_id"
      AND (
    "learning_plans"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  )
    )
  );--> statement-breakpoint
ALTER POLICY "task_resources_update_own_plan" ON "task_resources" TO authenticated USING (
    EXISTS (
      SELECT 1 FROM "tasks"
      JOIN "modules" ON "modules"."id" = "tasks"."module_id"
      JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
      WHERE "tasks"."id" = "task_resources"."task_id"
      AND (
    "learning_plans"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  )
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM "tasks"
      JOIN "modules" ON "modules"."id" = "tasks"."module_id"
      JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
      WHERE "tasks"."id" = "task_resources"."task_id"
      AND (
    "learning_plans"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  )
    )
  );--> statement-breakpoint
ALTER POLICY "task_resources_delete_own_plan" ON "task_resources" TO authenticated USING (
    EXISTS (
      SELECT 1 FROM "tasks"
      JOIN "modules" ON "modules"."id" = "tasks"."module_id"
      JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
      WHERE "tasks"."id" = "task_resources"."task_id"
      AND (
    "learning_plans"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  )
    )
  );--> statement-breakpoint
ALTER POLICY "tasks_select_own_plan" ON "tasks" TO authenticated USING (
      EXISTS (
        SELECT 1 FROM "modules"
        WHERE "modules"."id" = "tasks"."module_id"
        AND (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "modules"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  )
      )
    );--> statement-breakpoint
ALTER POLICY "tasks_insert_own_plan" ON "tasks" TO authenticated WITH CHECK (
      EXISTS (
        SELECT 1 FROM "modules"
        WHERE "modules"."id" = "tasks"."module_id"
        AND (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "modules"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  )
      )
    );--> statement-breakpoint
ALTER POLICY "tasks_update_own_plan" ON "tasks" TO authenticated USING (
      EXISTS (
        SELECT 1 FROM "modules"
        WHERE "modules"."id" = "tasks"."module_id"
        AND (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "modules"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  )
      )
    ) WITH CHECK (
      EXISTS (
        SELECT 1 FROM "modules"
        WHERE "modules"."id" = "tasks"."module_id"
        AND (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "modules"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  )
      )
    );--> statement-breakpoint
ALTER POLICY "tasks_delete_own_plan" ON "tasks" TO authenticated USING (
      EXISTS (
        SELECT 1 FROM "modules"
        WHERE "modules"."id" = "tasks"."module_id"
        AND (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "modules"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  )
      )
    );--> statement-breakpoint
ALTER POLICY "ai_usage_events_select_own" ON "ai_usage_events" TO authenticated USING (
    "ai_usage_events"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
ALTER POLICY "ai_usage_events_insert_own" ON "ai_usage_events" TO authenticated WITH CHECK (
    "ai_usage_events"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
ALTER POLICY "usage_metrics_select_own" ON "usage_metrics" TO authenticated USING (
    "usage_metrics"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
ALTER POLICY "usage_metrics_insert_own" ON "usage_metrics" TO authenticated WITH CHECK (
    "usage_metrics"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
ALTER POLICY "usage_metrics_update_own" ON "usage_metrics" TO authenticated USING (
    "usage_metrics"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  ) WITH CHECK (
    "usage_metrics"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
ALTER POLICY "usage_metrics_delete_own" ON "usage_metrics" TO authenticated USING (
    "usage_metrics"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
ALTER POLICY "job_queue_select_own" ON "job_queue" TO authenticated USING ("job_queue"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      ));--> statement-breakpoint
ALTER POLICY "job_queue_insert_own" ON "job_queue" TO authenticated WITH CHECK ("job_queue"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      ));
