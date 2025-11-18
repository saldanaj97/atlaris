CREATE TABLE IF NOT EXISTS "stripe_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"livemode" boolean NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stripe_webhook_events_event_id_unique" ON "stripe_webhook_events" USING btree ("event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stripe_webhook_events_created_at" ON "stripe_webhook_events" USING btree ("created_at");
--> statement-breakpoint
ALTER TABLE "stripe_webhook_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "stripe_webhook_events_select_service" ON "stripe_webhook_events" AS PERMISSIVE FOR SELECT TO "service_role" USING (true);
--> statement-breakpoint
CREATE POLICY "stripe_webhook_events_insert_service" ON "stripe_webhook_events" AS PERMISSIVE FOR INSERT TO "service_role" WITH CHECK (true);
