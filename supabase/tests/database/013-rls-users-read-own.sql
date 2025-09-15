-- 013-rls-users-read-own.sql
-- Behavioral RLS tests for users table (each user can read only their own row)
begin;

select
  plan (3);

-- Arrange users
select
  tests.create_supabase_user ('user1@test.com');

select
  tests.create_supabase_user ('user2@test.com');

-- Seed as service role: create app user rows mapping auth uid to clerk_user_id for tests
select
  tests.authenticate_as_service_role ();

insert into
  public.users (id, clerk_user_id, email, name)
values
  (
    gen_random_uuid (),
    tests.get_supabase_uid ('user1@test.com')::text,
    'user1@test.com',
    'User 1'
  ),
  (
    gen_random_uuid (),
    tests.get_supabase_uid ('user2@test.com')::text,
    'user2@test.com',
    'User 2'
  );

-- Reset to anonymous
select
  tests.clear_authentication ();

-- Assert: anonymous cannot see any users (no anon select policy)
select
  results_eq (
    'select count(*) from public.users',
    array[0::bigint],
    'anon cannot see any user rows'
  );

-- Act + Assert: as user1, can see exactly one row (self)
select
  tests.authenticate_as ('user1@test.com');

select
  results_eq (
    'select count(*) from public.users',
    array[1::bigint],
    'user1 sees only their own user row'
  );

-- And user1 cannot see any row where clerk_user_id <> self
select
  results_eq (
    $$select count(*) from public.users where clerk_user_id <> tests.get_supabase_uid('user1@test.com')::text$$,
    array[0::bigint],
    'user1 cannot see other users'' rows'
  );

select
  *
from
  finish ();

rollback;