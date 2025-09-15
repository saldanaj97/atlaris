-- 011-rls-modules-read.sql
-- Behavioral RLS tests for modules (visibility via parent learning_plans)
begin;

select
  plan (3);

-- Arrange users
select
  tests.create_supabase_user ('user1@test.com');

select
  tests.create_supabase_user ('user2@test.com');

-- Seed as service role
select
  tests.authenticate_as_service_role ();

-- Clean slate to avoid cross-file/data contamination
truncate table public.task_resources,
public.task_progress,
public.tasks,
public.plan_generations,
public.modules,
public.learning_plans,
public.users restart identity cascade;

-- Map to app users
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

-- Create one private plan for user1 and one public plan for user2
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
  ),
  p as (
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
      )
    returning
      id,
      topic
  )
  -- Insert modules: 2 under U1 private plan, 1 under U2 public plan
insert into
  public.modules (
    plan_id,
    "order",
    title,
    description,
    estimated_minutes
  )
select
  (
    select
      id
    from
      p
    where
      topic = 'U1 Private'
  ),
  1,
  'U1 M1',
  null,
  30
union all
select
  (
    select
      id
    from
      p
    where
      topic = 'U1 Private'
  ),
  2,
  'U1 M2',
  null,
  45
union all
select
  (
    select
      id
    from
      p
    where
      topic = 'U2 Public'
  ),
  1,
  'U2 M1',
  null,
  20;

-- Reset to anonymous
select
  tests.clear_authentication ();

-- Assert: anonymous sees only modules from public plans (1)
select
  results_eq (
    'select count(*) from public.modules',
    array[1::bigint],
    'anon sees only modules of public plans'
  );

-- Act + Assert: as user1, sees own private modules (2) + public modules (1) => 3
select
  tests.authenticate_as ('user1@test.com');

select
  results_eq (
    'select count(*) from public.modules',
    array[3::bigint],
    'user1 sees their modules plus modules from public plans'
  );

-- Act + Assert: user1 cannot delete a module under user2 public plan
select
  results_eq (
    $$with del as (
      delete from public.modules m using public.learning_plans lp
      where m.plan_id = lp.id and lp.visibility = 'public'
      and lp.user_id in (
        select id from public.users where clerk_user_id = tests.get_supabase_uid('user2@test.com')::text
      )
      returning 1
    )
    select count(*) from del$$,
    array[0::bigint],
    'user1 cannot delete modules under other users'' plans even if public'
  );

select
  *
from
  finish ();

rollback;