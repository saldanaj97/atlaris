-- 012-rls-tasks-read.sql
-- Behavioral RLS tests for tasks (visibility via modules -> learning_plans)
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

-- Create one private plan for user1 and one public plan for user2, with modules
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
  lp as (
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
  ),
  mods as (
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
          lp
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
          lp
        where
          topic = 'U2 Public'
      ),
      1,
      'U2 M1',
      null,
      20
    returning
      id,
      title
  )
  -- Insert tasks: 2 under U1's module, 1 under U2's module
insert into
  public.tasks (
    module_id,
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
      mods
    where
      title = 'U1 M1'
  ),
  1,
  'U1 T1',
  null,
  15
union all
select
  (
    select
      id
    from
      mods
    where
      title = 'U1 M1'
  ),
  2,
  'U1 T2',
  null,
  25
union all
select
  (
    select
      id
    from
      mods
    where
      title = 'U2 M1'
  ),
  1,
  'U2 T1',
  null,
  10;

-- Reset to anonymous
select
  tests.clear_authentication ();

-- Assert: anonymous sees only tasks from public plans (1)
select
  results_eq (
    'select count(*) from public.tasks',
    array[1::bigint],
    'anon sees only tasks of public plans'
  );

-- Act + Assert: as user1, sees tasks in own private plan + public plan tasks => 3
select
  tests.authenticate_as ('user1@test.com');

select
  results_eq (
    'select count(*) from public.tasks',
    array[3::bigint],
    'user1 sees own tasks plus tasks of public plans'
  );

-- Act + Assert: user1 cannot update tasks under other users' plans
select
  results_eq (
    $$with upd as (
      update public.tasks t
      set title = 'Hack'
      from public.modules m
      join public.learning_plans lp on lp.id = m.plan_id
      where t.module_id = m.id
        and lp.user_id in (
          select id from public.users where clerk_user_id = tests.get_supabase_uid('user2@test.com')::text
        )
      returning 1
    )
    select count(*) from upd$$,
    array[0::bigint],
    'user1 cannot update tasks under other users'' plans'
  );

select
  *
from
  finish ();

rollback;