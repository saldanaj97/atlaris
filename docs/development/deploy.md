# Deployment Notes

## PDF Removal Cutover

Migration `0027_windy_agent_zero` is not safe to run against an older app binary that still writes `origin='pdf'` or expects legacy PDF columns.

Required order:

1. Deploy the application release that no longer reads or writes PDF plan artifacts.
2. Wait for the rollout to finish across all pods/instances.
3. Verify the new release is healthy.
4. Run the Supabase migration workflow for the target environment (`staging-db-migrations.yaml` for `develop`, `production-db-migrations.yaml` for `main`), which applies committed migrations with `supabase db push`.

Do not reverse the order. Running the migration first can break rolling deploys or failovers against still-old binaries.

## Database migrations and internal workers

After deploying a release that includes new Supabase migrations:

1. Run the environment workflow (`staging-db-migrations.yaml` for `develop`, `production-db-migrations.yaml` for `main`).
2. If the CLI reports out-of-order local migrations, use `supabase db push --include-all` against the target project (see `docs/architecture/retention-cleanup-runbook.md`).
3. Set worker tokens in the target environment for enabled internal routes:
   - `REGENERATION_WORKER_TOKEN` for regeneration drains
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

See also:

- `docs/architecture/internal-worker-routes.md`
- `docs/architecture/regeneration-worker-runbook.md`
- `docs/architecture/retention-cleanup-runbook.md`
- `docs/architecture/plan-cleanup-runbook.md`
