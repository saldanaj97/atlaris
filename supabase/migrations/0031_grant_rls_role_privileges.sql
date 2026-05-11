-- RLS policies only filter rows after the database role has table privileges.
-- Hosted/preview databases need these grants in migration history, not only in
-- CI or test bootstrap scripts.
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated, anon;

-- Reapply narrower write privileges after the broad authenticated grant.
REVOKE UPDATE ON "users" FROM authenticated;
GRANT UPDATE (name, preferred_ai_model, updated_at) ON "users" TO authenticated;

-- Client roles must not write worker-only queue rows.
REVOKE INSERT, UPDATE, DELETE ON "job_queue" FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON "job_queue" FROM anon;
