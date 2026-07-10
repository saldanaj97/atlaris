# Deployment Notes

## PDF Removal Cutover

Migration `0027_windy_agent_zero` is not safe to run against an older app binary that still writes `origin='pdf'` or expects legacy PDF columns.

Required order:

1. Deploy the application release that no longer reads or writes PDF plan artifacts.
2. Wait for the rollout to finish across all pods/instances.
3. Verify the new release is healthy.
4. Run the Supabase migration workflow for the target environment (`staging-db-migrations.yaml` from `develop`, `production-db-migrations.yaml` from `main`), which applies committed migrations with `supabase db push`.

Do not reverse the order. Running the migration first can break rolling deploys or failovers against still-old binaries.

## User Preferences Cutover

The `user_preferences` rollout is split into expand and contract phases. The expand migration (`20260703181947_create_user_preferences_foundation`) must exist in the database before deploying application code that joins `user_preferences` during auth lookup.

Required order:

1. Run the Supabase migration workflow so `20260703181947_create_user_preferences_foundation` is applied to the target environment (`staging-db-migrations.yaml` from `develop`, `production-db-migrations.yaml` from `main`).
2. Deploy the application release that reads and writes `user_preferences`.
3. Wait for the rollout to finish across all pods/instances and verify the new release is healthy.
4. Run the Supabase migration workflow again to apply the contract migration `20260801120000_drop_user_preference_columns`, which removes legacy preference columns from `users`.

Do not deploy the application release before the expand migration is applied. Authenticated requests load actor records via a `user_preferences` join and will fail with a missing-table error until that migration completes.

Do not run the contract migration before the new application release is fully rolled out. Older binaries may still read or write the legacy `users` preference columns during rolling deploys.

## Database migrations and internal workers

After deploying a release that includes new Supabase migrations:

1. Run the environment workflow (`staging-db-migrations.yaml` from `develop`, `production-db-migrations.yaml` from `main`).
2. If the CLI reports out-of-order local migrations, use `supabase db push --include-all` against the target project (see `docs/architecture/retention-cleanup-runbook.md`).
3. Set worker tokens in the target environment for enabled internal routes:
   - `REGENERATION_WORKER_TOKEN` for regeneration drains
   - `WORKER_HEALTH_TOKEN` for `GET /api/health/worker` operator metrics
   - `RETENTION_CLEANUP_ENABLED=true` and/or `PLAN_CLEANUP_ENABLED=true` plus `MAINTENANCE_WORKER_TOKEN` only when enabling maintenance routes
4. Verify plan cleanup scheduler and alerting when `PLAN_CLEANUP_ENABLED=true`:
   - Set the same `MAINTENANCE_WORKER_TOKEN` value in Vercel Production and the GitHub Actions repository secret.
   - Confirm `.github/workflows/plan-cleanup-scheduler.yml` runs every 15 minutes and returns `200` with `ok: true`.
   - Confirm Sentry monitor `plan-cleanup-maintenance` receives successful check-ins; GitHub workflow failures identify `401`, `503`, and `500` responses.
5. Verify scheduled retention cleanup after migration `20260522223908_schedule_retention_cleanup.sql`:

```sql
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname = 'retention-cleanup';
```

If the migration applied but no cron job exists, enable `pg_cron` in Supabase and register the job manually (see retention runbook).

6. Enable module lesson generation when the hosted environment should serve it:
   - Set `LESSON_GENERATION_ENABLED=true` in production/staging. When unset outside development, the flag defaults to **off** and `POST /api/v1/plans/:planId/modules/:moduleId/lesson-content/generate` returns HTTP `503` with `disabled`.
   - After deploy, verify from an authenticated session that lesson generation does not return `503 disabled` for an unlocked module. See `docs/architecture/plan-generation-architecture.md` (module lesson generation) and `docs/development/environment.md` (`LESSON_GENERATION_ENABLED`).

See also:

- `docs/architecture/internal-worker-routes.md`
- `docs/architecture/regeneration-worker-runbook.md`
- `docs/architecture/retention-cleanup-runbook.md`
- `docs/architecture/plan-cleanup-runbook.md`

## Email notification Vercel Cron cutover

The email scheduler must have exactly one active owner. This release removes the GitHub email scheduler and adds the two Vercel Cron entries together.

1. Apply `20260710151930_create_email_notification_delivery_runs` before deploying code that starts email workflows. Its Supabase CLI-generated version precedes the existing future-dated delivery-ledger migration, so the staging and production migration workflows use `supabase db push --include-all` to apply it when the ledger migration is already recorded remotely.
2. Set a new `CRON_SECRET` in the target Vercel environment. Keep it distinct from `MAINTENANCE_WORKER_TOKEN`.
3. Deploy the application with `vercel.json`; confirm Vercel lists only `0 14 * * *` and `30 14 * * 1` for `/api/cron/notifications/email`.
4. Leave the `email-notification-delivery` Vercel Flag disabled and verify both authenticated cron paths return the intentional `disabled` outcome without creating a run.
5. Enable a safe opted-in account, trigger one manual logical run, and inspect its database run, Workflow SDK run, Sentry monitor, and delivery ledger before enabling broader delivery.

See [`docs/architecture/email-notification-delivery-runbook.md`](../architecture/email-notification-delivery-runbook.md) for duplicate, failure, and `needs_review` recovery.
