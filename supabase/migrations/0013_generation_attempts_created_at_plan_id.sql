-- Composite index for selectOldestUserGenerationAttemptSince / selectUserGenerationAttemptsSince (attempts-helpers)
-- (join generation_attempts → learning_plans, filter by user_id + created_at, ORDER BY created_at).
-- After applying, verify with:
--   EXPLAIN (ANALYZE, BUFFERS) SELECT ga.created_at FROM generation_attempts ga
--   INNER JOIN learning_plans lp ON ga.plan_id = lp.id
--   WHERE lp.user_id = '<some-user-uuid>' AND ga.created_at >= NOW() - INTERVAL '30 days'
--   ORDER BY ga.created_at ASC LIMIT 1;
-- Expect: Index Scan using idx_generation_attempts_created_at_plan_id on generation_attempts
--
-- PRODUCTION-SAFETY: If this migration runs on a large table, creating the new index may take
-- time and hold locks. Prefer applying during low traffic or use CONCURRENTLY in a follow-up
-- (CREATE INDEX CONCURRENTLY in a separate migration) and document in ops runbook.
DROP INDEX IF EXISTS "idx_generation_attempts_created_at";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_generation_attempts_created_at_plan_id" ON "generation_attempts" USING btree ("created_at","plan_id");
