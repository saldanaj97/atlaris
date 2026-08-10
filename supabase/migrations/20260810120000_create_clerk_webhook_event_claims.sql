CREATE TABLE "clerk_webhook_event_claims" (
	"event_id" text PRIMARY KEY NOT NULL,
	"claim_token" uuid NOT NULL,
	"claim_expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clerk_webhook_event_claims" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "clerk_webhook_event_claims_deny_all" ON "clerk_webhook_event_claims" AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);
--> statement-breakpoint
CREATE INDEX "idx_clerk_webhook_event_claims_expires_at" ON "clerk_webhook_event_claims" USING btree ("claim_expires_at");
--> statement-breakpoint
REVOKE ALL ON TABLE "clerk_webhook_event_claims" FROM anon, authenticated;
--> statement-breakpoint

DROP FUNCTION IF EXISTS "private"."cleanup_retained_db_rows"(timestamp with time zone);
--> statement-breakpoint

CREATE FUNCTION "private"."cleanup_retained_db_rows"(
  retention_now timestamp with time zone DEFAULT now()
)
RETURNS TABLE (
  expired_oauth_state_tokens integer,
  expired_clerk_webhook_event_claims integer,
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

  DELETE FROM "clerk_webhook_event_claims"
  WHERE "claim_expires_at" < retention_now - interval '1 day';
  GET DIAGNOSTICS expired_clerk_webhook_event_claims = ROW_COUNT;

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
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION "private"."cleanup_retained_db_rows"(timestamp with time zone) FROM PUBLIC, anon, authenticated;
