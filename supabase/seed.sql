-- Seed data for local development
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
  'user_33d1Ci8mqFZqiIb7pMYj0671CXj',
  'local-dev@example.com',
  'local-dev-free',
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
