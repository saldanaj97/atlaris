-- Seed data for local development.
-- Rebuilds only the fixed product-testing plans so rerunning the seed is safe.
insert into public.users (
  id,
  auth_user_id,
  email,
  name,
  subscription_tier,
  cancel_at_period_end,
  monthly_export_count
)
values (
  '11111111-1111-4111-8111-111111111111'::uuid,
  '00000000-0000-4000-8000-000000000001',
  'local-product-test@localhost.local',
  'Local Product Test',
  'free',
  false,
  0
)
on conflict (auth_user_id) do update set
  email = excluded.email,
  name = excluded.name,
  subscription_tier = excluded.subscription_tier,
  cancel_at_period_end = excluded.cancel_at_period_end,
  monthly_export_count = excluded.monthly_export_count;

insert into public.user_preferences (
  user_id,
  analytics_timezone
)
values (
  '11111111-1111-4111-8111-111111111111'::uuid,
  'America/Chicago'
)
on conflict (user_id) do update set
  analytics_timezone = excluded.analytics_timezone,
  updated_at = now();

delete from public.learning_plans
where id in (
  '11111111-1111-4111-8111-111111111201'::uuid,
  '11111111-1111-4111-8111-111111111202'::uuid,
  '11111111-1111-4111-8111-111111111203'::uuid
)
or id in (
  select
    ('11111111-1111-4111-8111-' || lpad((111111111300 + n)::text, 12, '0'))::uuid
  from generate_series(1, 42) as n
);

insert into public.learning_plans (
  id,
  user_id,
  topic,
  skill_level,
  weekly_hours,
  learning_style,
  start_date,
  visibility,
  origin,
  generation_status,
  is_quota_eligible,
  finalized_at,
  created_at,
  updated_at
)
values
  (
    '11111111-1111-4111-8111-111111111201'::uuid,
    '11111111-1111-4111-8111-111111111111'::uuid,
    'Browser Automation Polish',
    'intermediate',
    5,
    'practice',
    current_date - interval '52 days',
    'private',
    'manual',
    'ready',
    true,
    now() - interval '50 days',
    now() - interval '52 days',
    now() - interval '2 days'
  ),
  (
    '11111111-1111-4111-8111-111111111202'::uuid,
    '11111111-1111-4111-8111-111111111111'::uuid,
    'Workflow SDK TypeScript',
    'advanced',
    4,
    'mixed',
    current_date - interval '45 days',
    'private',
    'manual',
    'ready',
    true,
    now() - interval '43 days',
    now() - interval '45 days',
    now() - interval '1 day'
  ),
  (
    '11111111-1111-4111-8111-111111111203'::uuid,
    '11111111-1111-4111-8111-111111111111'::uuid,
    'Database Performance Review',
    'intermediate',
    3,
    'reading',
    current_date - interval '38 days',
    'private',
    'manual',
    'ready',
    true,
    now() - interval '36 days',
    now() - interval '38 days',
    now() - interval '3 days'
  );

insert into public.modules (id, plan_id, "order", title, description, estimated_minutes)
values
  ('11111111-1111-4111-8111-111111112111'::uuid, '11111111-1111-4111-8111-111111111201'::uuid, 1, 'Interaction Capture', 'Browser state, assertions, and durable selectors.', 130),
  ('11111111-1111-4111-8111-111111112112'::uuid, '11111111-1111-4111-8111-111111111201'::uuid, 2, 'Visual Review', 'Screenshots, layout checks, and regression notes.', 115),
  ('11111111-1111-4111-8111-111111112121'::uuid, '11111111-1111-4111-8111-111111111202'::uuid, 1, 'Workflow Runtime', 'Core workflow primitives and local execution.', 120),
  ('11111111-1111-4111-8111-111111112122'::uuid, '11111111-1111-4111-8111-111111111202'::uuid, 2, 'Type Contracts', 'Payload types, retries, and result handling.', 105),
  ('11111111-1111-4111-8111-111111112131'::uuid, '11111111-1111-4111-8111-111111111203'::uuid, 1, 'Query Basics', 'Indexes, plans, and query-shape hygiene.', 120),
  ('11111111-1111-4111-8111-111111112132'::uuid, '11111111-1111-4111-8111-111111111203'::uuid, 2, 'Operational Reads', 'Slow-query triage and production-safe checks.', 100);

insert into public.tasks (id, module_id, "order", title, description, estimated_minutes, has_micro_explanation)
values
  ('11111111-1111-4111-8111-111111113111'::uuid, '11111111-1111-4111-8111-111111112111'::uuid, 1, 'Map browser state', 'Capture page state before taking action.', 35, true),
  ('11111111-1111-4111-8111-111111113112'::uuid, '11111111-1111-4111-8111-111111112111'::uuid, 2, 'Write stable selectors', 'Prefer product signals over fragile structure.', 45, true),
  ('11111111-1111-4111-8111-111111113113'::uuid, '11111111-1111-4111-8111-111111112111'::uuid, 3, 'Check loading states', 'Verify the intermediate UI does not jump.', 50, false),
  ('11111111-1111-4111-8111-111111113114'::uuid, '11111111-1111-4111-8111-111111112112'::uuid, 1, 'Review desktop layout', 'Look for spacing and hierarchy breaks.', 40, true),
  ('11111111-1111-4111-8111-111111113115'::uuid, '11111111-1111-4111-8111-111111112112'::uuid, 2, 'Review mobile layout', 'Check truncation and stacked states.', 35, true),
  ('11111111-1111-4111-8111-111111113116'::uuid, '11111111-1111-4111-8111-111111112112'::uuid, 3, 'Compare screenshots', 'Keep evidence for design iteration.', 40, false),
  ('11111111-1111-4111-8111-111111113121'::uuid, '11111111-1111-4111-8111-111111112121'::uuid, 1, 'Create a local workflow', 'Run a workflow from a local harness.', 30, true),
  ('11111111-1111-4111-8111-111111113122'::uuid, '11111111-1111-4111-8111-111111112121'::uuid, 2, 'Trace workflow state', 'Inspect intermediate execution state.', 35, true),
  ('11111111-1111-4111-8111-111111113123'::uuid, '11111111-1111-4111-8111-111111112121'::uuid, 3, 'Handle retries', 'Make retry behavior explicit.', 45, false),
  ('11111111-1111-4111-8111-111111113124'::uuid, '11111111-1111-4111-8111-111111112122'::uuid, 1, 'Define payload types', 'Keep input and output contracts narrow.', 40, true),
  ('11111111-1111-4111-8111-111111113125'::uuid, '11111111-1111-4111-8111-111111112122'::uuid, 2, 'Validate result states', 'Make failure states visible to callers.', 35, false),
  ('11111111-1111-4111-8111-111111113126'::uuid, '11111111-1111-4111-8111-111111112122'::uuid, 3, 'Document runtime notes', 'Capture the short usage path.', 30, false),
  ('11111111-1111-4111-8111-111111113131'::uuid, '11111111-1111-4111-8111-111111112131'::uuid, 1, 'Read query plans', 'Use explain output to find waste.', 40, true),
  ('11111111-1111-4111-8111-111111113132'::uuid, '11111111-1111-4111-8111-111111112131'::uuid, 2, 'Audit missing indexes', 'Check predicates and join columns.', 50, true),
  ('11111111-1111-4111-8111-111111113133'::uuid, '11111111-1111-4111-8111-111111112131'::uuid, 3, 'Measure row counts', 'Compare estimates to actual data.', 30, false),
  ('11111111-1111-4111-8111-111111113134'::uuid, '11111111-1111-4111-8111-111111112132'::uuid, 1, 'Check slow reads', 'Find repeated expensive read paths.', 35, true),
  ('11111111-1111-4111-8111-111111113135'::uuid, '11111111-1111-4111-8111-111111112132'::uuid, 2, 'Verify safe fixes', 'Prefer one shared query change.', 35, false),
  ('11111111-1111-4111-8111-111111113136'::uuid, '11111111-1111-4111-8111-111111112132'::uuid, 3, 'Write follow-up notes', 'Record what still needs measurement.', 30, false);

insert into public.task_progress (id, task_id, user_id, status, completed_at, updated_at, created_at)
values
  ('11111111-1111-4111-8111-111111114111'::uuid, '11111111-1111-4111-8111-111111113111'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, 'completed', now() - interval '49 days', now() - interval '49 days', now() - interval '49 days'),
  ('11111111-1111-4111-8111-111111114112'::uuid, '11111111-1111-4111-8111-111111113112'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, 'completed', now() - interval '35 days', now() - interval '35 days', now() - interval '35 days'),
  ('11111111-1111-4111-8111-111111114113'::uuid, '11111111-1111-4111-8111-111111113113'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, 'completed', now() - interval '20 days', now() - interval '20 days', now() - interval '20 days'),
  ('11111111-1111-4111-8111-111111114114'::uuid, '11111111-1111-4111-8111-111111113114'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, 'completed', now() - interval '5 days', now() - interval '5 days', now() - interval '5 days'),
  ('11111111-1111-4111-8111-111111114115'::uuid, '11111111-1111-4111-8111-111111113115'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, 'in_progress', null, now() - interval '1 day', now() - interval '1 day'),
  ('11111111-1111-4111-8111-111111114121'::uuid, '11111111-1111-4111-8111-111111113121'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, 'completed', now() - interval '42 days', now() - interval '42 days', now() - interval '42 days'),
  ('11111111-1111-4111-8111-111111114122'::uuid, '11111111-1111-4111-8111-111111113122'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, 'completed', now() - interval '28 days', now() - interval '28 days', now() - interval '28 days'),
  ('11111111-1111-4111-8111-111111114123'::uuid, '11111111-1111-4111-8111-111111113123'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, 'completed', now() - interval '8 days', now() - interval '8 days', now() - interval '8 days'),
  ('11111111-1111-4111-8111-111111114124'::uuid, '11111111-1111-4111-8111-111111113124'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, 'in_progress', null, now() - interval '2 days', now() - interval '2 days'),
  ('11111111-1111-4111-8111-111111114131'::uuid, '11111111-1111-4111-8111-111111113131'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, 'completed', now() - interval '37 days', now() - interval '37 days', now() - interval '37 days'),
  ('11111111-1111-4111-8111-111111114132'::uuid, '11111111-1111-4111-8111-111111113132'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, 'completed', now() - interval '9 days', now() - interval '9 days', now() - interval '9 days'),
  ('11111111-1111-4111-8111-111111114133'::uuid, '11111111-1111-4111-8111-111111113133'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, 'in_progress', null, now() - interval '1 day', now() - interval '1 day')
on conflict (task_id, user_id) do update set
  status = excluded.status,
  completed_at = excluded.completed_at,
  updated_at = excluded.updated_at;

with extra_plans as (
  select
    n,
    ('11111111-1111-4111-8111-' || lpad((111111111300 + n)::text, 12, '0'))::uuid as plan_id,
    ('11111111-1111-4111-8111-' || lpad((111111112300 + n)::text, 12, '0'))::uuid as module_id,
    ('11111111-1111-4111-8111-' || lpad((111111113300 + n)::text, 12, '0'))::uuid as task_id,
    ('11111111-1111-4111-8111-' || lpad((111111114300 + n)::text, 12, '0'))::uuid as progress_id,
    (array[
      'API Contract Cleanup',
      'Calendar Sync Hardening',
      'Dashboard Activity Polish',
      'Error Boundary Review',
      'Feature Flag Strategy',
      'Import Pipeline Audit',
      'Job Queue Observability',
      'Keyboard Navigation Pass',
      'Learning Recap Workflow',
      'Mobile Plans Polish',
      'Notification Routing',
      'Onboarding Form Review',
      'Plan Generation Triage',
      'Profile Settings Cleanup'
    ])[((n - 1) % 14) + 1] || ' ' || lpad(n::text, 2, '0') as topic,
    25 + ((n % 5) * 10) as task_minutes
  from generate_series(1, 42) as n
)
insert into public.learning_plans (
  id,
  user_id,
  topic,
  skill_level,
  weekly_hours,
  learning_style,
  start_date,
  visibility,
  origin,
  generation_status,
  is_quota_eligible,
  finalized_at,
  created_at,
  updated_at
)
select
  plan_id,
  '11111111-1111-4111-8111-111111111111'::uuid,
  topic,
  (case when n % 3 = 0 then 'advanced' when n % 3 = 1 then 'beginner' else 'intermediate' end)::public.skill_level,
  2 + (n % 6),
  (case when n % 4 = 0 then 'video' when n % 4 = 1 then 'practice' when n % 4 = 2 then 'mixed' else 'reading' end)::public.learning_style,
  current_date - ((14 + n) * interval '1 day'),
  'private',
  (case when n % 5 = 0 then 'template' else 'manual' end)::public.plan_origin,
  'ready',
  true,
  now() - ((13 + n) * interval '1 day'),
  now() - ((14 + n) * interval '1 day'),
  now() - ((n % 9) * interval '1 day')
from extra_plans;

with extra_plans as (
  select
    n,
    ('11111111-1111-4111-8111-' || lpad((111111111300 + n)::text, 12, '0'))::uuid as plan_id,
    ('11111111-1111-4111-8111-' || lpad((111111112300 + n)::text, 12, '0'))::uuid as module_id,
    70 + ((n % 5) * 15) as module_minutes
  from generate_series(1, 42) as n
)
insert into public.modules (id, plan_id, "order", title, description, estimated_minutes)
select
  module_id,
  plan_id,
  1,
  'Core pass',
  'Seeded plan module for pagination and analytics density checks.',
  module_minutes
from extra_plans;

with extra_plans as (
  select
    n,
    ('11111111-1111-4111-8111-' || lpad((111111112300 + n)::text, 12, '0'))::uuid as module_id,
    ('11111111-1111-4111-8111-' || lpad((111111113300 + n)::text, 12, '0'))::uuid as task_id,
    25 + ((n % 5) * 10) as task_minutes
  from generate_series(1, 42) as n
)
insert into public.tasks (id, module_id, "order", title, description, estimated_minutes, has_micro_explanation)
select
  task_id,
  module_id,
  1,
  'Complete the representative milestone',
  'Single seeded task used to show list and chart density.',
  task_minutes,
  n % 2 = 0
from extra_plans;

with extra_plans as (
  select
    n,
    ('11111111-1111-4111-8111-' || lpad((111111113300 + n)::text, 12, '0'))::uuid as task_id,
    ('11111111-1111-4111-8111-' || lpad((111111114300 + n)::text, 12, '0'))::uuid as progress_id
  from generate_series(1, 42) as n
)
insert into public.task_progress (id, task_id, user_id, status, completed_at, updated_at, created_at)
select
  progress_id,
  task_id,
  '11111111-1111-4111-8111-111111111111'::uuid,
  (case when n % 4 = 0 then 'completed' when n % 4 = 1 then 'in_progress' else 'not_started' end)::public.progress_status,
  case when n % 4 = 0 then now() - ((n % 21) * interval '1 day') else null end,
  now() - ((n % 10) * interval '1 day'),
  now() - ((14 + n) * interval '1 day')
from extra_plans
on conflict (task_id, user_id) do update set
  status = excluded.status,
  completed_at = excluded.completed_at,
  updated_at = excluded.updated_at;

delete from public.learning_activity_events
where plan_id in (
  '11111111-1111-4111-8111-111111111201'::uuid,
  '11111111-1111-4111-8111-111111111202'::uuid,
  '11111111-1111-4111-8111-111111111203'::uuid
)
or plan_id in (
  select
    ('11111111-1111-4111-8111-' || lpad((111111111300 + n)::text, 12, '0'))::uuid
  from generate_series(1, 42) as n
);

with seeded_events (
  id,
  plan_id,
  module_id,
  task_id,
  previous_status,
  status,
  task_estimated_minutes,
  week_offset,
  day_offset,
  hour_offset
) as (
  values
    ('11111111-1111-4111-8111-111111115101'::uuid, '11111111-1111-4111-8111-111111111201'::uuid, '11111111-1111-4111-8111-111111112111'::uuid, '11111111-1111-4111-8111-111111113111'::uuid, null, 'completed', 35, 7, 1, 10),
    ('11111111-1111-4111-8111-111111115102'::uuid, '11111111-1111-4111-8111-111111111201'::uuid, '11111111-1111-4111-8111-111111112111'::uuid, '11111111-1111-4111-8111-111111113112'::uuid, null, 'in_progress', 45, 5, 1, 9),
    ('11111111-1111-4111-8111-111111115103'::uuid, '11111111-1111-4111-8111-111111111201'::uuid, '11111111-1111-4111-8111-111111112111'::uuid, '11111111-1111-4111-8111-111111113112'::uuid, 'in_progress', 'completed', 45, 5, 3, 11),
    ('11111111-1111-4111-8111-111111115104'::uuid, '11111111-1111-4111-8111-111111111201'::uuid, '11111111-1111-4111-8111-111111112111'::uuid, '11111111-1111-4111-8111-111111113113'::uuid, null, 'completed', 50, 4, 2, 14),
    ('11111111-1111-4111-8111-111111115105'::uuid, '11111111-1111-4111-8111-111111111201'::uuid, '11111111-1111-4111-8111-111111112112'::uuid, '11111111-1111-4111-8111-111111113114'::uuid, null, 'in_progress', 40, 3, 1, 10),
    ('11111111-1111-4111-8111-111111115106'::uuid, '11111111-1111-4111-8111-111111111201'::uuid, '11111111-1111-4111-8111-111111112112'::uuid, '11111111-1111-4111-8111-111111113114'::uuid, 'in_progress', 'completed', 40, 3, 2, 10),
    ('11111111-1111-4111-8111-111111115107'::uuid, '11111111-1111-4111-8111-111111111201'::uuid, '11111111-1111-4111-8111-111111112112'::uuid, '11111111-1111-4111-8111-111111113115'::uuid, null, 'in_progress', 35, 3, 4, 12),
    ('11111111-1111-4111-8111-111111115108'::uuid, '11111111-1111-4111-8111-111111111201'::uuid, '11111111-1111-4111-8111-111111112112'::uuid, '11111111-1111-4111-8111-111111113115'::uuid, 'not_started', 'in_progress', 35, 2, 3, 15),
    ('11111111-1111-4111-8111-111111115109'::uuid, '11111111-1111-4111-8111-111111111201'::uuid, '11111111-1111-4111-8111-111111112111'::uuid, '11111111-1111-4111-8111-111111113111'::uuid, 'completed', 'in_progress', 35, 1, 2, 10),
    ('11111111-1111-4111-8111-111111115110'::uuid, '11111111-1111-4111-8111-111111111201'::uuid, '11111111-1111-4111-8111-111111112111'::uuid, '11111111-1111-4111-8111-111111113111'::uuid, 'in_progress', 'completed', 35, 1, 3, 11),
    ('11111111-1111-4111-8111-111111115111'::uuid, '11111111-1111-4111-8111-111111111201'::uuid, '11111111-1111-4111-8111-111111112112'::uuid, '11111111-1111-4111-8111-111111113116'::uuid, null, 'in_progress', 40, 0, 1, 9),
    ('11111111-1111-4111-8111-111111115112'::uuid, '11111111-1111-4111-8111-111111111201'::uuid, '11111111-1111-4111-8111-111111112112'::uuid, '11111111-1111-4111-8111-111111113112'::uuid, 'completed', 'completed', 45, 0, 2, 10),
    ('11111111-1111-4111-8111-111111115113'::uuid, '11111111-1111-4111-8111-111111111201'::uuid, '11111111-1111-4111-8111-111111112111'::uuid, '11111111-1111-4111-8111-111111113113'::uuid, 'completed', 'completed', 50, 0, 3, 11),
    ('11111111-1111-4111-8111-111111115114'::uuid, '11111111-1111-4111-8111-111111111201'::uuid, '11111111-1111-4111-8111-111111112112'::uuid, '11111111-1111-4111-8111-111111113115'::uuid, 'in_progress', 'in_progress', 35, 0, 4, 12),
    ('11111111-1111-4111-8111-111111115201'::uuid, '11111111-1111-4111-8111-111111111202'::uuid, '11111111-1111-4111-8111-111111112121'::uuid, '11111111-1111-4111-8111-111111113121'::uuid, null, 'completed', 30, 6, 1, 10),
    ('11111111-1111-4111-8111-111111115202'::uuid, '11111111-1111-4111-8111-111111111202'::uuid, '11111111-1111-4111-8111-111111112121'::uuid, '11111111-1111-4111-8111-111111113122'::uuid, null, 'in_progress', 35, 6, 3, 10),
    ('11111111-1111-4111-8111-111111115203'::uuid, '11111111-1111-4111-8111-111111111202'::uuid, '11111111-1111-4111-8111-111111112121'::uuid, '11111111-1111-4111-8111-111111113122'::uuid, 'in_progress', 'completed', 35, 4, 1, 10),
    ('11111111-1111-4111-8111-111111115204'::uuid, '11111111-1111-4111-8111-111111111202'::uuid, '11111111-1111-4111-8111-111111112121'::uuid, '11111111-1111-4111-8111-111111113123'::uuid, null, 'completed', 45, 2, 2, 13),
    ('11111111-1111-4111-8111-111111115205'::uuid, '11111111-1111-4111-8111-111111111202'::uuid, '11111111-1111-4111-8111-111111112122'::uuid, '11111111-1111-4111-8111-111111113124'::uuid, null, 'in_progress', 40, 1, 4, 9),
    ('11111111-1111-4111-8111-111111115206'::uuid, '11111111-1111-4111-8111-111111111202'::uuid, '11111111-1111-4111-8111-111111112122'::uuid, '11111111-1111-4111-8111-111111113125'::uuid, null, 'in_progress', 35, 0, 2, 9),
    ('11111111-1111-4111-8111-111111115207'::uuid, '11111111-1111-4111-8111-111111111202'::uuid, '11111111-1111-4111-8111-111111112122'::uuid, '11111111-1111-4111-8111-111111113126'::uuid, null, 'not_started', 30, 0, 5, 11),
    ('11111111-1111-4111-8111-111111115301'::uuid, '11111111-1111-4111-8111-111111111203'::uuid, '11111111-1111-4111-8111-111111112131'::uuid, '11111111-1111-4111-8111-111111113131'::uuid, null, 'in_progress', 40, 7, 2, 9),
    ('11111111-1111-4111-8111-111111115302'::uuid, '11111111-1111-4111-8111-111111111203'::uuid, '11111111-1111-4111-8111-111111112131'::uuid, '11111111-1111-4111-8111-111111113131'::uuid, 'in_progress', 'completed', 40, 7, 4, 9),
    ('11111111-1111-4111-8111-111111115303'::uuid, '11111111-1111-4111-8111-111111111203'::uuid, '11111111-1111-4111-8111-111111112131'::uuid, '11111111-1111-4111-8111-111111113132'::uuid, null, 'completed', 50, 6, 1, 13),
    ('11111111-1111-4111-8111-111111115304'::uuid, '11111111-1111-4111-8111-111111111203'::uuid, '11111111-1111-4111-8111-111111112131'::uuid, '11111111-1111-4111-8111-111111113133'::uuid, null, 'in_progress', 30, 3, 3, 10),
    ('11111111-1111-4111-8111-111111115305'::uuid, '11111111-1111-4111-8111-111111111203'::uuid, '11111111-1111-4111-8111-111111112132'::uuid, '11111111-1111-4111-8111-111111113134'::uuid, null, 'in_progress', 35, 2, 2, 14),
    ('11111111-1111-4111-8111-111111115306'::uuid, '11111111-1111-4111-8111-111111111203'::uuid, '11111111-1111-4111-8111-111111112132'::uuid, '11111111-1111-4111-8111-111111113135'::uuid, null, 'not_started', 35, 0, 1, 10),
    ('11111111-1111-4111-8111-111111115307'::uuid, '11111111-1111-4111-8111-111111111203'::uuid, '11111111-1111-4111-8111-111111112132'::uuid, '11111111-1111-4111-8111-111111113136'::uuid, null, 'in_progress', 30, 0, 4, 15)
)
insert into public.learning_activity_events (
  id,
  user_id,
  plan_id,
  module_id,
  task_id,
  previous_status,
  status,
  task_estimated_minutes,
  occurred_at,
  created_at
)
select
  id,
  '11111111-1111-4111-8111-111111111111'::uuid,
  plan_id,
  module_id,
  task_id,
  previous_status::public.progress_status,
  status::public.progress_status,
  task_estimated_minutes,
  date_trunc('week', now())
    - (week_offset * interval '1 week')
    + (day_offset * interval '1 day')
    + (hour_offset * interval '1 hour'),
  now()
from seeded_events
on conflict (id) do update set
  previous_status = excluded.previous_status,
  status = excluded.status,
  task_estimated_minutes = excluded.task_estimated_minutes,
  occurred_at = excluded.occurred_at,
  created_at = excluded.created_at;

with extra_plans as (
  select
    n,
    ('11111111-1111-4111-8111-' || lpad((111111111300 + n)::text, 12, '0'))::uuid as plan_id,
    ('11111111-1111-4111-8111-' || lpad((111111112300 + n)::text, 12, '0'))::uuid as module_id,
    ('11111111-1111-4111-8111-' || lpad((111111113300 + n)::text, 12, '0'))::uuid as task_id,
    25 + ((n % 5) * 10) as task_minutes
  from generate_series(1, 42) as n
),
extra_events as (
  select
    ('11111111-1111-4111-8111-' || lpad((111111116000 + (plan.n * 10) + event.event_index)::text, 12, '0'))::uuid as id,
    plan.plan_id,
    plan.module_id,
    plan.task_id,
    event.previous_status,
    event.status,
    plan.task_minutes,
    date_trunc('week', now())
      - (event.week_offset * interval '1 week')
      + (event.day_offset * interval '1 day')
      + (event.hour_offset * interval '1 hour') as occurred_at
  from extra_plans as plan
  cross join lateral (
    select
      generated.event_index,
      case
        when generated.event_index <= 3 + (plan.n % 3) then plan.n % 8
        when generated.event_index <= 5 + (plan.n % 4) then (plan.n + 2) % 8
        else (plan.n + generated.event_index) % 8
      end as week_offset,
      1 + ((plan.n + generated.event_index) % 5) as day_offset,
      8 + ((plan.n * generated.event_index) % 8) as hour_offset,
      case
        when generated.event_index = 1 then null
        when generated.event_index % 3 = 0 then 'in_progress'
        when generated.event_index % 2 = 0 then 'not_started'
        else 'completed'
      end as previous_status,
      case
        when generated.event_index % 3 = 0 then 'completed'
        when generated.event_index % 2 = 0 then 'in_progress'
        else 'not_started'
      end as status
    from generate_series(1, 4 + (plan.n % 5)) as generated(event_index)
  ) as event(event_index, week_offset, day_offset, hour_offset, previous_status, status)
)
insert into public.learning_activity_events (
  id,
  user_id,
  plan_id,
  module_id,
  task_id,
  previous_status,
  status,
  task_estimated_minutes,
  occurred_at,
  created_at
)
select
  id,
  '11111111-1111-4111-8111-111111111111'::uuid,
  plan_id,
  module_id,
  task_id,
  previous_status::public.progress_status,
  status::public.progress_status,
  task_minutes,
  occurred_at,
  now()
from extra_events
on conflict (id) do update set
  previous_status = excluded.previous_status,
  status = excluded.status,
  task_estimated_minutes = excluded.task_estimated_minutes,
  occurred_at = excluded.occurred_at,
  created_at = excluded.created_at;
