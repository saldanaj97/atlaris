CREATE TABLE "clerk_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clerk_webhook_events_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
ALTER TABLE "clerk_webhook_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "idx_clerk_webhook_events_created_at" ON "clerk_webhook_events" USING btree ("created_at");