-- 005-rls-structure.sql
-- Structural verification of RLS policies using pg_policies
-- Ensures the exact policy sets and command counts match the schema outline
begin;

select
  plan (16);

-- Helper: compact counts by cmd for a table
-- We will compare [SELECT, INSERT, UPDATE, DELETE] counts
-- 1) learning_plans
select
  results_eq (
    $$select policyname::text COLLATE "C"
    from pg_policies
   where schemaname = 'public' and tablename = 'learning_plans'
   order by policyname::text COLLATE "C"$$,
    $$values
    ('learning_plans_delete_own'::text COLLATE "C"),
    ('learning_plans_delete_service'::text COLLATE "C"),
    ('learning_plans_insert_own'::text COLLATE "C"),
    ('learning_plans_insert_service'::text COLLATE "C"),
    ('learning_plans_select_own'::text COLLATE "C"),
    ('learning_plans_select_public_anon'::text COLLATE "C"),
    ('learning_plans_select_public_auth'::text COLLATE "C"),
    ('learning_plans_select_service'::text COLLATE "C"),
    ('learning_plans_update_own'::text COLLATE "C"),
    ('learning_plans_update_service'::text COLLATE "C")$$,
    'learning_plans: exact policy set'
  );

select
  results_eq (
    $$select
      sum((cmd = 'SELECT')::int)::bigint as sel,
      sum((cmd = 'INSERT')::int)::bigint as ins,
      sum((cmd = 'UPDATE')::int)::bigint as upd,
      sum((cmd = 'DELETE')::int)::bigint as del
    from pg_policies where schemaname='public' and tablename='learning_plans'$$,
    $$values (4::bigint,2::bigint,2::bigint,2::bigint)$$,
    'learning_plans: cmd counts [SELECT, INSERT, UPDATE, DELETE]'
  );

-- 2) modules
select
  results_eq (
    $$select policyname::text COLLATE "C"
    from pg_policies
   where schemaname = 'public' and tablename = 'modules'
   order by policyname::text COLLATE "C"$$,
    $$values
    ('modules_delete_own_plan'::text COLLATE "C"),
    ('modules_delete_service'::text COLLATE "C"),
    ('modules_insert_own_plan'::text COLLATE "C"),
    ('modules_insert_service'::text COLLATE "C"),
    ('modules_select_own_plan'::text COLLATE "C"),
    ('modules_select_public_anon'::text COLLATE "C"),
    ('modules_select_public_auth'::text COLLATE "C"),
    ('modules_select_service'::text COLLATE "C"),
    ('modules_update_own_plan'::text COLLATE "C"),
    ('modules_update_service'::text COLLATE "C")$$,
    'modules: exact policy set'
  );

select
  results_eq (
    $$select
      sum((cmd = 'SELECT')::int)::bigint,
      sum((cmd = 'INSERT')::int)::bigint,
      sum((cmd = 'UPDATE')::int)::bigint,
      sum((cmd = 'DELETE')::int)::bigint
    from pg_policies where schemaname='public' and tablename='modules'$$,
    $$values (4::bigint,2::bigint,2::bigint,2::bigint)$$,
    'modules: cmd counts [SELECT, INSERT, UPDATE, DELETE]'
  );

-- 3) tasks
select
  results_eq (
    $$select policyname::text COLLATE "C"
    from pg_policies
   where schemaname = 'public' and tablename = 'tasks'
   order by policyname::text COLLATE "C"$$,
    $$values
    ('tasks_delete_own_plan'::text COLLATE "C"),
    ('tasks_delete_service'::text COLLATE "C"),
    ('tasks_insert_own_plan'::text COLLATE "C"),
    ('tasks_insert_service'::text COLLATE "C"),
    ('tasks_select_own_plan'::text COLLATE "C"),
    ('tasks_select_public_anon'::text COLLATE "C"),
    ('tasks_select_public_auth'::text COLLATE "C"),
    ('tasks_select_service'::text COLLATE "C"),
    ('tasks_update_own_plan'::text COLLATE "C"),
    ('tasks_update_service'::text COLLATE "C")$$,
    'tasks: exact policy set'
  );

select
  results_eq (
    $$select
      sum((cmd = 'SELECT')::int)::bigint,
      sum((cmd = 'INSERT')::int)::bigint,
      sum((cmd = 'UPDATE')::int)::bigint,
      sum((cmd = 'DELETE')::int)::bigint
    from pg_policies where schemaname='public' and tablename='tasks'$$,
    $$values (4::bigint,2::bigint,2::bigint,2::bigint)$$,
    'tasks: cmd counts [SELECT, INSERT, UPDATE, DELETE]'
  );

-- 4) task_resources
select
  results_eq (
    $$select policyname::text COLLATE "C"
    from pg_policies
   where schemaname = 'public' and tablename = 'task_resources'
   order by policyname::text COLLATE "C"$$,
    $$values
    ('task_resources_delete_own_plan'::text COLLATE "C"),
    ('task_resources_delete_service'::text COLLATE "C"),
    ('task_resources_insert_own_plan'::text COLLATE "C"),
    ('task_resources_insert_service'::text COLLATE "C"),
    ('task_resources_select_own_plan'::text COLLATE "C"),
    ('task_resources_select_public_anon'::text COLLATE "C"),
    ('task_resources_select_public_auth'::text COLLATE "C"),
    ('task_resources_select_service'::text COLLATE "C"),
    ('task_resources_update_own_plan'::text COLLATE "C"),
    ('task_resources_update_service'::text COLLATE "C")$$,
    'task_resources: exact policy set'
  );

select
  results_eq (
    $$select
      sum((cmd = 'SELECT')::int)::bigint,
      sum((cmd = 'INSERT')::int)::bigint,
      sum((cmd = 'UPDATE')::int)::bigint,
      sum((cmd = 'DELETE')::int)::bigint
    from pg_policies where schemaname='public' and tablename='task_resources'$$,
    $$values (4::bigint,2::bigint,2::bigint,2::bigint)$$,
    'task_resources: cmd counts [SELECT, INSERT, UPDATE, DELETE]'
  );

-- 5) task_progress
select
  results_eq (
    $$select policyname::text COLLATE "C"
    from pg_policies
   where schemaname = 'public' and tablename = 'task_progress'
   order by policyname::text COLLATE "C"$$,
    $$values
    ('task_progress_delete_own'::text COLLATE "C"),
    ('task_progress_delete_service'::text COLLATE "C"),
    ('task_progress_insert_own'::text COLLATE "C"),
    ('task_progress_insert_service'::text COLLATE "C"),
    ('task_progress_select_own'::text COLLATE "C"),
    ('task_progress_select_service'::text COLLATE "C"),
    ('task_progress_update_own'::text COLLATE "C"),
    ('task_progress_update_service'::text COLLATE "C")$$,
    'task_progress: exact policy set'
  );

select
  results_eq (
    $$select
      sum((cmd = 'SELECT')::int)::bigint,
      sum((cmd = 'INSERT')::int)::bigint,
      sum((cmd = 'UPDATE')::int)::bigint,
      sum((cmd = 'DELETE')::int)::bigint
    from pg_policies where schemaname='public' and tablename='task_progress'$$,
    $$values (2::bigint,2::bigint,2::bigint,2::bigint)$$,
    'task_progress: cmd counts [SELECT, INSERT, UPDATE, DELETE]'
  );

-- 6) plan_generations
select
  results_eq (
    $$select policyname::text COLLATE "C"
    from pg_policies
   where schemaname = 'public' and tablename = 'plan_generations'
   order by policyname::text COLLATE "C"$$,
    $$values
    ('plan_generations_delete_own'::text COLLATE "C"),
    ('plan_generations_delete_service'::text COLLATE "C"),
    ('plan_generations_insert_own'::text COLLATE "C"),
    ('plan_generations_insert_service'::text COLLATE "C"),
    ('plan_generations_select_own'::text COLLATE "C"),
    ('plan_generations_select_service'::text COLLATE "C"),
    ('plan_generations_update_own'::text COLLATE "C"),
    ('plan_generations_update_service'::text COLLATE "C")$$,
    'plan_generations: exact policy set'
  );

select
  results_eq (
    $$select
      sum((cmd = 'SELECT')::int)::bigint,
      sum((cmd = 'INSERT')::int)::bigint,
      sum((cmd = 'UPDATE')::int)::bigint,
      sum((cmd = 'DELETE')::int)::bigint
    from pg_policies where schemaname='public' and tablename='plan_generations'$$,
    $$values (2::bigint,2::bigint,2::bigint,2::bigint)$$,
    'plan_generations: cmd counts [SELECT, INSERT, UPDATE, DELETE]'
  );

-- 7) resources
select
  results_eq (
    $$select policyname::text COLLATE "C"
    from pg_policies
   where schemaname = 'public' and tablename = 'resources'
   order by policyname::text COLLATE "C"$$,
    $$values
    ('resources_delete_service'::text COLLATE "C"),
    ('resources_insert_service'::text COLLATE "C"),
    ('resources_select_anon'::text COLLATE "C"),
    ('resources_select_auth'::text COLLATE "C"),
    ('resources_update_service'::text COLLATE "C")$$,
    'resources: exact policy set'
  );

select
  results_eq (
    $$select
      sum((cmd = 'SELECT')::int)::bigint,
      sum((cmd = 'INSERT')::int)::bigint,
      sum((cmd = 'UPDATE')::int)::bigint,
      sum((cmd = 'DELETE')::int)::bigint
    from pg_policies where schemaname='public' and tablename='resources'$$,
    $$values (2::bigint,1::bigint,1::bigint,1::bigint)$$,
    'resources: cmd counts [SELECT, INSERT, UPDATE, DELETE]'
  );

-- 8) users
select
  results_eq (
    $$select policyname::text COLLATE "C"
    from pg_policies
   where schemaname = 'public' and tablename = 'users'
   order by policyname::text COLLATE "C"$$,
    $$values
    ('users_delete_service'::text COLLATE "C"),
    ('users_insert_own'::text COLLATE "C"),
    ('users_insert_service'::text COLLATE "C"),
    ('users_select_own'::text COLLATE "C"),
    ('users_select_service'::text COLLATE "C"),
    ('users_update_own_profile'::text COLLATE "C"),
    ('users_update_service'::text COLLATE "C")$$,
    'users: exact policy set'
  );

select
  results_eq (
    $$select
      sum((cmd = 'SELECT')::int)::bigint,
      sum((cmd = 'INSERT')::int)::bigint,
      sum((cmd = 'UPDATE')::int)::bigint,
      sum((cmd = 'DELETE')::int)::bigint
    from pg_policies where schemaname='public' and tablename='users'$$,
    $$values (2::bigint,2::bigint,2::bigint,1::bigint)$$,
    'users: cmd counts [SELECT, INSERT, UPDATE, DELETE]'
  );

select
  *
from
  finish ();

rollback;