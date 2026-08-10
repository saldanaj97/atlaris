-- SECURITY DEFINER functions must never inherit browser-role EXECUTE.
-- Limit the existing-object sweep so ordinary client-callable RPCs keep their grants.
DO $$
DECLARE
  function_identity regprocedure;
BEGIN
  FOR function_identity IN
    SELECT procedure.oid::regprocedure
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE procedure.prosecdef
      AND namespace.nspname IN ('public', 'private')
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      function_identity
    );
  END LOOP;
END;
$$;

-- Migrations create functions as postgres. Remove PostgreSQL's default EXECUTE
-- grant globally and clear the existing public-schema override for later functions.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
