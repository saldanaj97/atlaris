CREATE TABLE "notion_sync_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"notion_page_id" text NOT NULL,
	"notion_database_id" text,
	"sync_hash" text NOT NULL,
	"last_synced_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notion_sync_plan_id_unique" UNIQUE("plan_id")
);
--> statement-breakpoint
ALTER TABLE "notion_sync_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notion_sync_state" ADD CONSTRAINT "notion_sync_state_plan_id_learning_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."learning_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notion_sync_state" ADD CONSTRAINT "notion_sync_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notion_sync_state_plan_id_idx" ON "notion_sync_state" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "notion_sync_state_user_id_idx" ON "notion_sync_state" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "notion_sync_state_select_own" ON "notion_sync_state" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("notion_sync_state"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
      ));--> statement-breakpoint
CREATE POLICY "notion_sync_state_select_service" ON "notion_sync_state" AS PERMISSIVE FOR SELECT TO "service_role" USING (true);--> statement-breakpoint
CREATE POLICY "notion_sync_state_insert_own" ON "notion_sync_state" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("notion_sync_state"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
      ));--> statement-breakpoint
CREATE POLICY "notion_sync_state_insert_service" ON "notion_sync_state" AS PERMISSIVE FOR INSERT TO "service_role" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "notion_sync_state_update_own" ON "notion_sync_state" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("notion_sync_state"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
      )) WITH CHECK ("notion_sync_state"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
      ));--> statement-breakpoint
CREATE POLICY "notion_sync_state_update_service" ON "notion_sync_state" AS PERMISSIVE FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "notion_sync_state_delete_own" ON "notion_sync_state" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("notion_sync_state"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
      ));--> statement-breakpoint
CREATE POLICY "notion_sync_state_delete_service" ON "notion_sync_state" AS PERMISSIVE FOR DELETE TO "service_role" USING (true);