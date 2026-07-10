CREATE TYPE "public"."email_notification_delivery_status" AS ENUM('pending', 'sent', 'skipped', 'failed', 'manual_review');--> statement-breakpoint
CREATE TABLE "email_notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category" "email_notification_category" NOT NULL,
	"delivery_key" text NOT NULL,
	"status" "email_notification_delivery_status" DEFAULT 'pending' NOT NULL,
	"claim_token" uuid,
	"claim_expires_at" timestamp with time zone,
	"provider_request" jsonb,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"provider_message_id" text,
	"failure_class" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_notification_deliveries_user_category_key_unique" UNIQUE("user_id","category","delivery_key"),
	CONSTRAINT "email_notification_deliveries_pending_claim_required" CHECK ("status" <> 'pending' OR (
		"claim_token" IS NOT NULL
		AND "claim_expires_at" IS NOT NULL
		AND "provider_request" IS NOT NULL
	))
);
--> statement-breakpoint
ALTER TABLE "email_notification_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "email_notification_deliveries" ADD CONSTRAINT "email_notification_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_email_notification_deliveries_status_updated_at" ON "email_notification_deliveries" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_email_notification_deliveries_pending_claim_expires_at" ON "email_notification_deliveries" USING btree ("claim_expires_at") WHERE "status" = 'pending';--> statement-breakpoint
CREATE POLICY "email_notification_deliveries_deny_all" ON "email_notification_deliveries" AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);--> statement-breakpoint
REVOKE ALL ON TABLE "email_notification_deliveries" FROM anon, authenticated;
