CREATE TYPE "public"."generation_status" AS ENUM('generating', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "ai_usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "resource_search_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query_key" text NOT NULL,
	"source" text NOT NULL,
	"params" jsonb NOT NULL,
	"results" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "resource_search_cache_query_key_unique" UNIQUE("query_key")
);
--> statement-breakpoint
ALTER TABLE "resource_search_cache" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "stripe_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"livemode" boolean NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_webhook_events_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
ALTER TABLE "stripe_webhook_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "learning_plans" ADD COLUMN "generation_status" "generation_status" DEFAULT 'generating' NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_plans" ADD COLUMN "is_quota_eligible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_plans" ADD COLUMN "finalized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ai_usage_user_id" ON "ai_usage_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_ai_usage_created_at" ON "ai_usage_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "resource_search_cache_source_expires_idx" ON "resource_search_cache" USING btree ("source","expires_at");--> statement-breakpoint
CREATE INDEX "idx_stripe_webhook_events_created_at" ON "stripe_webhook_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_learning_plans_user_quota" ON "learning_plans" USING btree ("user_id","is_quota_eligible");--> statement-breakpoint
CREATE INDEX "idx_learning_plans_user_generation_status" ON "learning_plans" USING btree ("user_id","generation_status");--> statement-breakpoint
CREATE POLICY "ai_usage_events_select_own" ON "ai_usage_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("ai_usage_events"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
      ));--> statement-breakpoint
CREATE POLICY "ai_usage_events_select_service" ON "ai_usage_events" AS PERMISSIVE FOR SELECT TO "service_role" USING (true);--> statement-breakpoint
CREATE POLICY "ai_usage_events_insert_own" ON "ai_usage_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("ai_usage_events"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
      ));--> statement-breakpoint
CREATE POLICY "ai_usage_events_insert_service" ON "ai_usage_events" AS PERMISSIVE FOR INSERT TO "service_role" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "resource_search_cache_select_service" ON "resource_search_cache" AS PERMISSIVE FOR SELECT TO "service_role" USING (true);--> statement-breakpoint
CREATE POLICY "resource_search_cache_insert_service" ON "resource_search_cache" AS PERMISSIVE FOR INSERT TO "service_role" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "resource_search_cache_update_service" ON "resource_search_cache" AS PERMISSIVE FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "resource_search_cache_delete_service" ON "resource_search_cache" AS PERMISSIVE FOR DELETE TO "service_role" USING (true);--> statement-breakpoint
CREATE POLICY "stripe_webhook_events_select_service" ON "stripe_webhook_events" AS PERMISSIVE FOR SELECT TO "service_role" USING (true);--> statement-breakpoint
CREATE POLICY "stripe_webhook_events_insert_service" ON "stripe_webhook_events" AS PERMISSIVE FOR INSERT TO "service_role" WITH CHECK (true);