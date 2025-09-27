-- 015-rls-generation_attempts.sql
-- RLS behavioral tests for generation_attempts (owners only access)
begin;

select
  plan (5);

-- Arrange: create auth users for owner and observer
select
  tests.create_supabase_user ('owner@test.com');

select
  tests.create_supabase_user ('other@test.com');

-- Seed domain data as service role to bypass RLS during setup
select
  tests.authenticate_as_service_role ();

truncate table public.generation_attempts,
public.task_resources,
public.task_progress,
public.tasks,
public.plan_generations,
public.modules,
public.learning_plans,
public.users restart identity cascade;

-- Map auth users into application users table
insert into
  public.users (id, clerk_user_id, email, name)
values
  (
    gen_random_uuid (),
    tests.get_supabase_uid ('owner@test.com')::text,
    'owner@test.com',
    'Owner User'
  ),
  (
    gen_random_uuid (),
    tests.get_supabase_uid ('other@test.com')::text,
    'other@test.com',
    'Other User'
  );

-- Create one plan per user
with
  owner_user as (
    select
      id
    from
      public.users
    where
      clerk_user_id = tests.get_supabase_uid ('owner@test.com')::text
    limit
      1
  ),
  other_user as (
    select
      id
    from
      public.users
    where
      clerk_user_id = tests.get_supabase_uid ('other@test.com')::text
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
    visibility,
    origin
  )
values
  ((select id from owner_user), 'Owner Plan', 'beginner', 5, 'reading', 'private', 'ai'),
  ((select id from other_user), 'Other Plan', 'beginner', 5, 'reading', 'private', 'ai');

-- Pre-seed one attempt for each plan
with
  owner_plan as (
    select id from public.learning_plans where topic = 'Owner Plan' limit 1
  ),
  other_plan as (
    select id from public.learning_plans where topic = 'Other Plan' limit 1
  )
insert into
  public.generation_attempts (
    plan_id,
    status,
    classification,
    duration_ms,
    modules_count,
    tasks_count,
    truncated_topic,
    truncated_notes,
    normalized_effort
  )
values
  ((select id from owner_plan), 'success', null, 2500, 3, 15, false, false, false),
  ((select id from other_plan), 'failure', 'timeout', 10000, 0, 0, false, false, false);

-- Reset session to anonymous
select
  tests.clear_authentication ();

-- Assert: anonymous users cannot read any generation attempts
select
  results_eq (
    'select count(*) from public.generation_attempts',
    array[0::bigint],
    'anon cannot read generation attempts'
  );

-- Act + Assert: owner sees only their own attempts
select
  tests.authenticate_as ('owner@test.com');

select
  results_eq (
    'select count(*) from public.generation_attempts',
    array[1::bigint],
    'owner sees only their attempts'
  );

select
  results_eq (
    $$select count(*) from public.generation_attempts where plan_id not in (
      select id from public.learning_plans where topic = 'Owner Plan'
    )$$,
    array[0::bigint],
    'owner does not see other users attempts'
  );

-- Owner can insert attempts for their own plan (should be exactly one row)
select
  results_eq (
    $$with ins as (
      insert into public.generation_attempts (
        plan_id,
        status,
        classification,
        duration_ms,
        modules_count,
        tasks_count,
        truncated_topic,
        truncated_notes,
        normalized_effort
      )
      values (
        (select id from public.learning_plans where topic = 'Owner Plan' limit 1),
        'failure',
        'validation',
        400,
        0,
        0,
        true,
        false,
        false
      )
      returning 1
    )
    select count(*) from ins$$,
    array[1::bigint],
    'owner can insert attempts for own plan'
  );

-- Owner cannot insert attempts for someone else (violates WITH CHECK)
select
  throws_ok (
    $$insert into public.generation_attempts (
      plan_id,
      status,
      classification,
      duration_ms,
      modules_count,
      tasks_count,
      truncated_topic,
      truncated_notes,
      normalized_effort
    )
    values (
      (select id from public.learning_plans where topic = 'Other Plan' limit 1),
      'failure',
      'provider_error',
      7500,
      0,
      0,
      false,
      false,
      false
    )$$,
    '42501',
    'owner cannot insert attempts for other plans'
  );

-- Other user sees only their own attempt
select
  tests.authenticate_as ('other@test.com');

select
  results_eq (
    'select count(*) from public.generation_attempts',
    array[1::bigint],
    'other user sees only their attempts'
  );

select
  results_eq (
    $$select count(*) from public.generation_attempts where plan_id not in (
      select id from public.learning_plans where topic = 'Other Plan'
    )$$,
    array[0::bigint],
    'other user cannot see owner attempts'
  );

select
  *
from
  finish ();

rollback;
