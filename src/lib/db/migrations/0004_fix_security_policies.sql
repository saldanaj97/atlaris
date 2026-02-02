-- Fix OAuth state tokens RLS policies (were permissive USING (true))
-- OAuth tokens must be restricted to their owner only

DROP POLICY IF EXISTS "oauth_state_tokens_insert" ON "oauth_state_tokens";
DROP POLICY IF EXISTS "oauth_state_tokens_select" ON "oauth_state_tokens";
DROP POLICY IF EXISTS "oauth_state_tokens_delete" ON "oauth_state_tokens";

CREATE POLICY "oauth_state_tokens_insert" ON "oauth_state_tokens"
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (
    clerk_user_id = (current_setting('request.jwt.claims', true)::json->>'sub')
  );

CREATE POLICY "oauth_state_tokens_select" ON "oauth_state_tokens"
  AS PERMISSIVE FOR SELECT TO public
  USING (
    clerk_user_id = (current_setting('request.jwt.claims', true)::json->>'sub')
  );

CREATE POLICY "oauth_state_tokens_delete" ON "oauth_state_tokens"
  AS PERMISSIVE FOR DELETE TO public
  USING (
    clerk_user_id = (current_setting('request.jwt.claims', true)::json->>'sub')
  );

-- Add policies for clerk_webhook_events table (service-role only access)
-- This table has RLS enabled but no policies, which blocks all access including webhooks
-- Webhooks run with service-role/superuser which bypasses RLS, so we add a restrictive
-- policy that blocks regular authenticated users from reading webhook events

CREATE POLICY "clerk_webhook_events_deny_all" ON "clerk_webhook_events"
  AS RESTRICTIVE FOR ALL TO public
  USING (false)
  WITH CHECK (false);
