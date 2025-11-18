-- removed duplicate generation_status enum and ai_usage_events table (see 0006, 0007)
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
-- removed duplicate stripe_webhook_events (see 0005)
-- removed duplicate learning_plans columns (see 0007) and ai_usage_events FKs/indexes/policies (see 0006)
CREATE INDEX "resource_search_cache_source_expires_idx" ON "resource_search_cache" USING btree ("source","expires_at");--> statement-breakpoint
-- removed duplicate stripe_webhook_events index (see 0005)
-- removed duplicate learning_plans indexes (see 0007)
CREATE POLICY "resource_search_cache_select_service" ON "resource_search_cache" AS PERMISSIVE FOR SELECT TO "service_role" USING (true);--> statement-breakpoint
CREATE POLICY "resource_search_cache_insert_service" ON "resource_search_cache" AS PERMISSIVE FOR INSERT TO "service_role" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "resource_search_cache_update_service" ON "resource_search_cache" AS PERMISSIVE FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "resource_search_cache_delete_service" ON "resource_search_cache" AS PERMISSIVE FOR DELETE TO "service_role" USING (true);--> statement-breakpoint
-- removed duplicate stripe_webhook_events policies (see 0005)
