ALTER POLICY "task_calendar_events_select_own" ON "task_calendar_events" TO authenticated USING (
    "task_calendar_events"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
   AND 
    EXISTS (
      SELECT 1 FROM "tasks"
      JOIN "modules" ON "modules"."id" = "tasks"."module_id"
      JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
      WHERE "tasks"."id" = "task_calendar_events"."task_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
ALTER POLICY "task_calendar_events_insert_own" ON "task_calendar_events" TO authenticated WITH CHECK (
    "task_calendar_events"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
   AND 
    EXISTS (
      SELECT 1 FROM "tasks"
      JOIN "modules" ON "modules"."id" = "tasks"."module_id"
      JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
      WHERE "tasks"."id" = "task_calendar_events"."task_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
ALTER POLICY "task_calendar_events_update_own" ON "task_calendar_events" TO authenticated USING (
    "task_calendar_events"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
   AND 
    EXISTS (
      SELECT 1 FROM "tasks"
      JOIN "modules" ON "modules"."id" = "tasks"."module_id"
      JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
      WHERE "tasks"."id" = "task_calendar_events"."task_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  ) WITH CHECK (
    "task_calendar_events"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
   AND 
    EXISTS (
      SELECT 1 FROM "tasks"
      JOIN "modules" ON "modules"."id" = "tasks"."module_id"
      JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
      WHERE "tasks"."id" = "task_calendar_events"."task_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
ALTER POLICY "task_calendar_events_delete_own" ON "task_calendar_events" TO authenticated USING (
    "task_calendar_events"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
   AND 
    EXISTS (
      SELECT 1 FROM "tasks"
      JOIN "modules" ON "modules"."id" = "tasks"."module_id"
      JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
      WHERE "tasks"."id" = "task_calendar_events"."task_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );