ALTER TABLE "public"."users"
ADD COLUMN "clerk_billing_updated_at" timestamp with time zone;

COMMENT ON COLUMN "public"."users"."clerk_billing_updated_at" IS
'Latest Clerk Billing provider timestamp applied to the local entitlement projection.';
