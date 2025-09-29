-- Migration: generation_attempts RLS policies
-- Adds owner-scoped select/insert policies for generation_attempts table
DROP POLICY IF EXISTS "generation_attempts_select_own_plan" ON "generation_attempts";

--> statement-breakpoint
DROP POLICY IF EXISTS "generation_attempts_select_service" ON "generation_attempts";

--> statement-breakpoint
DROP POLICY IF EXISTS "generation_attempts_insert_own_plan" ON "generation_attempts";

--> statement-breakpoint
DROP POLICY IF EXISTS "generation_attempts_insert_service" ON "generation_attempts";

--> statement-breakpoint
CREATE POLICY "generation_attempts_select_own_plan" ON "generation_attempts" AS PERMISSIVE FOR
SELECT
  TO "authenticated" USING (
    EXISTS (
      SELECT
        1
      FROM
        "learning_plans"
      WHERE
        "learning_plans"."id" = "generation_attempts"."plan_id"
        AND "learning_plans"."user_id" IN (
          SELECT
            id
          FROM
            "users"
          WHERE
            "users"."clerk_user_id" = (
              select
                auth.jwt () ->> 'sub'
            )
        )
    )
  );

--> statement-breakpoint
CREATE POLICY "generation_attempts_select_service" ON "generation_attempts" AS PERMISSIVE FOR
SELECT
  TO "service_role" USING (true);

--> statement-breakpoint
CREATE POLICY "generation_attempts_insert_own_plan" ON "generation_attempts" AS PERMISSIVE FOR INSERT TO "authenticated"
WITH
  CHECK (
    EXISTS (
      SELECT
        1
      FROM
        "learning_plans"
      WHERE
        "learning_plans"."id" = "generation_attempts"."plan_id"
        AND "learning_plans"."user_id" IN (
          SELECT
            id
          FROM
            "users"
          WHERE
            "users"."clerk_user_id" = (
              select
                auth.jwt () ->> 'sub'
            )
        )
    )
  );

--> statement-breakpoint
CREATE POLICY "generation_attempts_insert_service" ON "generation_attempts" AS PERMISSIVE FOR INSERT TO "service_role"
WITH
  CHECK (true);