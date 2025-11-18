-- Setup PostgreSQL roles for RLS policies
-- These roles are used by RLS policies to control access

-- Create roles if they don't exist
DO $$
BEGIN
  -- Anonymous role (for unauthenticated requests)
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;

  -- Authenticated role (for authenticated user requests)
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;

  -- Service role (for backend/worker processes that bypass RLS)
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END
$$;

-- Grant necessary permissions to roles
-- The database owner can connect as these roles using SET ROLE
GRANT anon TO CURRENT_USER;
GRANT authenticated TO CURRENT_USER;
GRANT service_role TO CURRENT_USER;

-- Grant basic permissions to authenticated role
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Grant read-only to anon role (for public data)
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- Service role has full access (bypasses RLS via BYPASSRLS)
GRANT ALL ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Make sure future tables also get these permissions
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated, service_role;
