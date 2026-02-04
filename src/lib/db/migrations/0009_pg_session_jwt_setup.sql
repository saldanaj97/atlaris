DO $$
DECLARE
  jwks_url text := current_setting('app.clerk_jwks_url', true);
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_session_jwt') THEN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_session_jwt';
  ELSE
    RAISE NOTICE 'pg_session_jwt extension is not available in this database; skipping.';
    RETURN;
  END IF;

  IF jwks_url IS NULL OR btrim(jwks_url) = '' THEN
    RAISE NOTICE 'Skipping pg_session_jwt JWKS configuration (app.clerk_jwks_url is not set).';
    RETURN;
  END IF;

  IF jwks_url !~ '^https://' THEN
    RAISE EXCEPTION 'app.clerk_jwks_url must use https:// (got: %)', jwks_url;
  END IF;

  BEGIN
    PERFORM auth.configure(
      jsonb_build_object(
        'jwks', jsonb_build_object(
          'url', jwks_url,
          'cache_duration_seconds', 3600
        )
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION 'pg_session_jwt JWKS configuration failed for %: %', jwks_url, SQLERRM;
  END;
END $$;
