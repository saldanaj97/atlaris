DROP FUNCTION IF EXISTS "private"."cleanup_retained_db_rows"(timestamp with time zone);--> statement-breakpoint

DROP TABLE IF EXISTS "stripe_webhook_events";--> statement-breakpoint

ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_stripe_customer_id_unique";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_stripe_subscription_id_unique";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "stripe_customer_id";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "stripe_subscription_id";--> statement-breakpoint

CREATE FUNCTION "private"."cleanup_retained_db_rows"(
  retention_now timestamp with time zone DEFAULT now()
)
RETURNS TABLE (
  expired_oauth_state_tokens integer,
  old_clerk_webhook_events integer,
  old_job_queue_rows integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = "public", pg_temp
AS $$
BEGIN
  DELETE FROM "oauth_state_tokens"
  WHERE "expires_at" < retention_now;
  GET DIAGNOSTICS expired_oauth_state_tokens = ROW_COUNT;

  DELETE FROM "clerk_webhook_events"
  WHERE "created_at" < retention_now - interval '45 days';
  GET DIAGNOSTICS old_clerk_webhook_events = ROW_COUNT;

  DELETE FROM "job_queue"
  WHERE "status" IN ('completed', 'failed')
    AND "completed_at" IS NOT NULL
    AND "completed_at" < retention_now - interval '30 days';
  GET DIAGNOSTICS old_job_queue_rows = ROW_COUNT;

  RETURN NEXT;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION "private"."cleanup_retained_db_rows"(timestamp with time zone) FROM PUBLIC, anon, authenticated;
