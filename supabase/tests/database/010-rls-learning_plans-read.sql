-- 010-rls-learning_plans-read.sql
-- Behavioral RLS tests for learning_plans (read visibility, no app auth involved)
begin;

select
  plan (3);

-- Arrange: create two test users and seed plans owned by them.
select
  tests.create_supabase_user ('user1@test.com');

select
  tests.create_supabase_user ('user2@test.com');

-- Seed as service role to bypass RLS during setup
select
  tests.authenticate_as_service_role ();

-- Ensure a clean slate for deterministic counts within this transaction
-- Truncate domain tables that affect visibility tests
truncate table public.task_resources,
public.task_progress,
public.tasks,
public.plan_generations,
public.modules,
public.learning_plans,
public.users restart identity cascade;

-- Map auth users into our application users table (use auth uid as clerk_user_id for tests)
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

-- Insert four plans: two for each user (one public, one private)
with
  u1 as (
    select
      id
    from
      public.users
    where
      clerk_user_id = tests.get_supabase_uid ('user1@test.com')::text
    limit
      1
  ),
  u2 as (
    select
      id
    from
      public.users
    where
      clerk_user_id = tests.get_supabase_uid ('user2@test.com')::text
    limit
      1
  )
insert into
  public.learning_plans (
    user_id,
    topic,
    skill_level,
    weekly_hours,
    learning_style,
    visibility
  )
values
  (
    (
      select
        id
      from
        u1
    ),
    'U1 Public',
    'beginner',
    5,
    'reading',
    'public'
  ),
  (
    (
      select
        id
      from
        u1
    ),
    'U1 Private',
    'beginner',
    5,
    'reading',
    'private'
  ),
  (
    (
      select
        id
      from
        u2
    ),
    'U2 Public',
    'beginner',
    5,
    'reading',
    'public'
  ),
  (
    (
      select
        id
      from
        u2
    ),
    'U2 Private',
    'beginner',
    5,
    'reading',
    'private'
  );

-- Reset to anonymous
select
  tests.clear_authentication ();

-- Assert: anonymous sees only public plans (2)
select
  results_eq (
    'select count(*) from public.learning_plans',
    array[2::bigint],
    'anon sees only public plans'
  );

-- Act + Assert: as user1, sees own (2) + public-from-others (1) => 3
select
  tests.authenticate_as ('user1@test.com');

select
  results_eq (
    'select count(*) from public.learning_plans',
    array[3::bigint],
    'user1 sees their own plans and public plans from others'
  );

-- Act + Assert: user1 cannot update user2 plans (no row updated)
select
  results_eq (
    $$with upd as (
      update public.learning_plans set topic = 'Hack'
      where user_id in (
        select id from public.users where clerk_user_id = tests.get_supabase_uid('user2@test.com')::text
      )
      returning 1
    )
    select count(*) from upd$$,
    array[0::bigint],
    'user1 cannot update other users'' plans'
  );

select
  *
from
  finish ();

rollback;