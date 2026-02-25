-- Align generation_attempts RLS policies with schema ownership semantics.

DROP POLICY IF EXISTS "generation_attempts_update" ON "generation_attempts";
CREATE POLICY "generation_attempts_update" ON "generation_attempts"
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "generation_attempts"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "generation_attempts"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );

DROP POLICY IF EXISTS "generation_attempts_delete_deny" ON "generation_attempts";
CREATE POLICY "generation_attempts_delete_deny" ON "generation_attempts"
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (false);
