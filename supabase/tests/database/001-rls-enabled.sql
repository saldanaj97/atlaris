-- 001-rls-enabled.sql
-- Quick schema-wide RLS coverage check
begin;

select
  plan (1);

-- Assert that all tables in the public schema have RLS enabled
select
  tests.rls_enabled ('public');

select
  *
from
  finish ();

rollback;