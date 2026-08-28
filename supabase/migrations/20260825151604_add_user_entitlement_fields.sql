CREATE SCHEMA IF NOT EXISTS "private";--> statement-breakpoint

ALTER TABLE "users" ADD COLUMN "initial_plan_generated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "free_access_plan_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "free_access_plan_selected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_free_access_plan_id_learning_plans_id_fk" FOREIGN KEY ("free_access_plan_id") REFERENCES "public"."learning_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE OR REPLACE FUNCTION "private"."backfill_user_entitlement_fields"()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = "public", pg_temp
AS $$
BEGIN
  -- Marker: extant successfully finalized initial AI plans only.
  -- Do not infer from monthly usage counters.
  UPDATE "users" AS target
  SET "initial_plan_generated_at" = source.earliest_at
  FROM (
    SELECT
      plan.user_id,
      MIN(
        CASE
          WHEN plan.finalized_at IS NOT NULL AND attempt.min_success_at IS NOT NULL
            THEN LEAST(plan.finalized_at, attempt.min_success_at)
          ELSE COALESCE(plan.finalized_at, attempt.min_success_at)
        END
      ) AS earliest_at
    FROM "learning_plans" AS plan
    LEFT JOIN LATERAL (
      SELECT MIN(generation_attempts.created_at) AS min_success_at
      FROM "generation_attempts"
      WHERE generation_attempts.plan_id = plan.id
        AND generation_attempts.status = 'success'
    ) AS attempt ON true
    WHERE plan.origin = 'ai'
      AND (
        plan.finalized_at IS NOT NULL
        OR attempt.min_success_at IS NOT NULL
      )
    GROUP BY plan.user_id
  ) AS source
  WHERE target.id = source.user_id
    AND target.initial_plan_generated_at IS NULL
    AND source.earliest_at IS NOT NULL;

  -- Current Free with exactly one retained eligible plan: consume selection.
  -- Paid users keep the marker but do not receive a Free-access plan.
  -- Multiple candidates leave selection pending.
  UPDATE "users" AS target
  SET
    "free_access_plan_id" = source.plan_id,
    "free_access_plan_selected_at" = now()
  FROM (
    SELECT candidate.user_id, MIN(candidate.plan_id::text)::uuid AS plan_id
    FROM (
      SELECT
        plan.user_id,
        plan.id AS plan_id
      FROM "learning_plans" AS plan
      LEFT JOIN LATERAL (
        SELECT MIN(generation_attempts.created_at) AS min_success_at
        FROM "generation_attempts"
        WHERE generation_attempts.plan_id = plan.id
          AND generation_attempts.status = 'success'
      ) AS attempt ON true
      WHERE (
          plan.finalized_at IS NOT NULL
          OR plan.is_quota_eligible = true
          OR attempt.min_success_at IS NOT NULL
        )
        AND NOT (
          plan.generation_status = 'failed'
          AND plan.is_quota_eligible = false
        )
    ) AS candidate
    GROUP BY candidate.user_id
    HAVING COUNT(*) = 1
  ) AS source
  WHERE target.id = source.user_id
    AND target.subscription_tier = 'free'
    AND target.initial_plan_generated_at IS NOT NULL
    AND target.free_access_plan_selected_at IS NULL;
END;
$$;--> statement-breakpoint

REVOKE ALL ON SCHEMA "private" FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "private"."backfill_user_entitlement_fields"() FROM PUBLIC, anon, authenticated;--> statement-breakpoint

SELECT "private"."backfill_user_entitlement_fields"();
