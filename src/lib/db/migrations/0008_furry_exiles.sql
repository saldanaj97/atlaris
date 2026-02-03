-- Remove obsolete public/anonymous read policies only.
-- Tenant-isolated authenticated policies (e.g., *_select_own_plan) remain in place.
DROP POLICY "learning_plans_select_own" ON "learning_plans";--> statement-breakpoint
DROP POLICY "modules_select_public_anon" ON "modules";--> statement-breakpoint
DROP POLICY "modules_select_public_auth" ON "modules";--> statement-breakpoint
DROP POLICY "resources_select_anon" ON "resources";--> statement-breakpoint
DROP POLICY "task_resources_select_public_anon" ON "task_resources";--> statement-breakpoint
DROP POLICY "task_resources_select_public_auth" ON "task_resources";--> statement-breakpoint
DROP POLICY "tasks_select_public_anon" ON "tasks";--> statement-breakpoint
DROP POLICY "tasks_select_public_auth" ON "tasks";--> statement-breakpoint
ALTER POLICY "learning_plans_select" ON "learning_plans" TO authenticated USING (
    "learning_plans"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
ALTER POLICY "task_progress_insert_own" ON "task_progress" TO authenticated WITH CHECK (
          (
    "task_progress"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
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
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  )
    )
  )
        );--> statement-breakpoint
ALTER POLICY "task_progress_update_own" ON "task_progress" TO authenticated USING (
    "task_progress"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  ) WITH CHECK (
        (
    "task_progress"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
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
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  )
    )
  )
      );
