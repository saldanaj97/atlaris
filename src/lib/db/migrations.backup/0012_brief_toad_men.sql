ALTER TABLE "integration_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "integration_tokens_select_own" ON "integration_tokens" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("integration_tokens"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
      ));--> statement-breakpoint
CREATE POLICY "integration_tokens_select_service" ON "integration_tokens" AS PERMISSIVE FOR SELECT TO "service_role" USING (true);--> statement-breakpoint
CREATE POLICY "integration_tokens_insert_own" ON "integration_tokens" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("integration_tokens"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
      ));--> statement-breakpoint
CREATE POLICY "integration_tokens_insert_service" ON "integration_tokens" AS PERMISSIVE FOR INSERT TO "service_role" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "integration_tokens_update_own" ON "integration_tokens" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("integration_tokens"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
      )) WITH CHECK ("integration_tokens"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
      ));--> statement-breakpoint
CREATE POLICY "integration_tokens_update_service" ON "integration_tokens" AS PERMISSIVE FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "integration_tokens_delete_own" ON "integration_tokens" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("integration_tokens"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
      ));--> statement-breakpoint
CREATE POLICY "integration_tokens_delete_service" ON "integration_tokens" AS PERMISSIVE FOR DELETE TO "service_role" USING (true);