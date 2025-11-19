ALTER POLICY "notion_sync_state_insert_own" ON "notion_sync_state" TO authenticated WITH CHECK (
        "notion_sync_state"."user_id" IN (
          SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
        )
        AND EXISTS (
          SELECT 1 FROM "learning_plans"
          WHERE "learning_plans"."id" = "notion_sync_state"."plan_id"
          AND "learning_plans"."user_id" IN (
            SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
          )
        )
      );--> statement-breakpoint
ALTER POLICY "notion_sync_state_update_own" ON "notion_sync_state" TO authenticated USING (
        "notion_sync_state"."user_id" IN (
          SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
        )
        AND EXISTS (
          SELECT 1 FROM "learning_plans"
          WHERE "learning_plans"."id" = "notion_sync_state"."plan_id"
          AND "learning_plans"."user_id" IN (
            SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
          )
        )
      ) WITH CHECK (
        "notion_sync_state"."user_id" IN (
          SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
        )
        AND EXISTS (
          SELECT 1 FROM "learning_plans"
          WHERE "learning_plans"."id" = "notion_sync_state"."plan_id"
          AND "learning_plans"."user_id" IN (
            SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
          )
        )
      );--> statement-breakpoint
ALTER POLICY "notion_sync_state_delete_own" ON "notion_sync_state" TO authenticated USING (
        "notion_sync_state"."user_id" IN (
          SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
        )
        AND EXISTS (
          SELECT 1 FROM "learning_plans"
          WHERE "learning_plans"."id" = "notion_sync_state"."plan_id"
          AND "learning_plans"."user_id" IN (
            SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
          )
        )
      );