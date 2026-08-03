CREATE TABLE "legacy_stripe_entitlement_archive" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"auth_user_id" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"subscription_tier" "subscription_tier" NOT NULL,
	"subscription_status" "subscription_status",
	"subscription_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean NOT NULL,
	"archived_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "legacy_stripe_entitlement_archive" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "legacy_stripe_entitlement_archive_deny_all" ON "legacy_stripe_entitlement_archive" AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);--> statement-breakpoint
REVOKE ALL ON TABLE "legacy_stripe_entitlement_archive" FROM anon, authenticated;--> statement-breakpoint

INSERT INTO "legacy_stripe_entitlement_archive" (
	"user_id",
	"auth_user_id",
	"stripe_customer_id",
	"stripe_subscription_id",
	"subscription_tier",
	"subscription_status",
	"subscription_period_end",
	"cancel_at_period_end"
)
SELECT
	"id",
	"auth_user_id",
	"stripe_customer_id",
	"stripe_subscription_id",
	"subscription_tier",
	"subscription_status",
	"subscription_period_end",
	"cancel_at_period_end"
FROM "users"
WHERE "stripe_customer_id" IS NOT NULL
	OR "stripe_subscription_id" IS NOT NULL
ON CONFLICT ("user_id") DO NOTHING;
