CREATE SCHEMA IF NOT EXISTS "private";--> statement-breakpoint

CREATE OR REPLACE FUNCTION "private"."cleanup_retained_db_rows"(
  retention_now timestamp with time zone DEFAULT now()
)
RETURNS TABLE (
  expired_oauth_state_tokens integer,
  old_stripe_webhook_events integer,
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

  DELETE FROM "stripe_webhook_events"
  WHERE "created_at" < retention_now - interval '45 days';
  GET DIAGNOSTICS old_stripe_webhook_events = ROW_COUNT;

  DELETE FROM "job_queue"
  WHERE "status" IN ('completed', 'failed')
    AND "completed_at" IS NOT NULL
    AND "completed_at" < retention_now - interval '30 days';
  GET DIAGNOSTICS old_job_queue_rows = ROW_COUNT;

  RETURN NEXT;
END;
$$;--> statement-breakpoint

REVOKE ALL ON SCHEMA "private" FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "private"."cleanup_retained_db_rows"(timestamp with time zone) FROM PUBLIC, anon, authenticated;--> statement-breakpoint

DO $$
DECLARE
  has_pg_cron boolean;
  job_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_available_extensions
    WHERE name = 'pg_cron'
  )
  INTO has_pg_cron;

  IF NOT has_pg_cron THEN
    RAISE NOTICE 'pg_cron is not available; skipping retention cleanup schedule registration';
    RETURN;
  END IF;

  EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron';

  EXECUTE 'SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname = $1)'
  INTO job_exists
  USING 'retention-cleanup';

  IF job_exists THEN
    EXECUTE 'SELECT cron.unschedule($1)' USING 'retention-cleanup';
  END IF;

  EXECUTE 'SELECT cron.schedule($1, $2, $3)'
  USING
    'retention-cleanup',
    '0 3 * * *',
    'SELECT * FROM "private"."cleanup_retained_db_rows"();';
END;
$$;
