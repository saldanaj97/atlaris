DROP POLICY IF EXISTS "job_queue_insert_own" ON "job_queue";--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON "job_queue" FROM authenticated;
