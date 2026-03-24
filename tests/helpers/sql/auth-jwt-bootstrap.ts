/**
 * `CREATE OR REPLACE FUNCTION auth.jwt()` — required by RLS policies that read
 * JWT claims from `request.jwt.claims` (see `src/lib/db/schema` policies).
 * Ephemeral and integration test databases must install this to mirror Neon/production.
 */
export const AUTH_JWT_BOOTSTRAP_SQL = `
CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql
AS $$ SELECT COALESCE(current_setting('request.jwt.claims', true)::jsonb, '{}'::jsonb) $$;
`.trim();
