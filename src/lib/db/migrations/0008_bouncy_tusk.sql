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
CREATE INDEX "resource_search_cache_source_expires_idx" ON "resource_search_cache" USING btree ("source","expires_at");--> statement-breakpoint
CREATE INDEX "idx_stripe_webhook_events_created_at" ON "stripe_webhook_events" USING btree ("created_at");--> statement-breakpoint
CREATE POLICY "resource_search_cache_select_service" ON "resource_search_cache" AS PERMISSIVE FOR SELECT TO "service_role" USING (true);--> statement-breakpoint
CREATE POLICY "resource_search_cache_insert_service" ON "resource_search_cache" AS PERMISSIVE FOR INSERT TO "service_role" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "resource_search_cache_update_service" ON "resource_search_cache" AS PERMISSIVE FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "resource_search_cache_delete_service" ON "resource_search_cache" AS PERMISSIVE FOR DELETE TO "service_role" USING (true);--> statement-breakpoint
CREATE POLICY "stripe_webhook_events_select_service" ON "stripe_webhook_events" AS PERMISSIVE FOR SELECT TO "service_role" USING (true);--> statement-breakpoint
CREATE POLICY "stripe_webhook_events_insert_service" ON "stripe_webhook_events" AS PERMISSIVE FOR INSERT TO "service_role" WITH CHECK (true);
