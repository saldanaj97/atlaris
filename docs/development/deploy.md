# Deployment Notes

## PDF Removal Cutover

Migration `0027_windy_agent_zero` is not safe to run against an older app binary that still writes `origin='pdf'` or expects legacy PDF columns.

Required order:

1. Deploy the application release that no longer reads or writes PDF plan artifacts.
2. Wait for the rollout to finish across all pods/instances.
3. Verify the new release is healthy.
4. After rollout health is verified, manually dispatch the target environment's migration workflow with phase `contract` and confirmation `post-deploy-health-verified`.

Do not reverse the order. Running the migration first can break rolling deploys or failovers against still-old binaries.

## User Preferences Cutover

The `user_preferences` rollout is split into expand and contract phases. The expand migration (`20260703181947_create_user_preferences_foundation`) must exist in the database before deploying application code that joins `user_preferences` during auth lookup.

Required order:

1. Manually dispatch the target environment's migration workflow with phase `expand`. Confirm `20260703181947_create_user_preferences_foundation` succeeds before continuing.
2. Deploy the application release that reads and writes `user_preferences`.
3. Wait for the rollout to finish across all pods/instances and verify the new release is healthy.
4. Dispatch the workflow with phase `contract` and confirmation `post-deploy-health-verified`. This applies `20260801120000_drop_user_preference_columns`, which removes legacy preference columns from `users`.

Do not deploy the application release before the expand migration is applied. Authenticated requests load actor records via a `user_preferences` join and will fail with a missing-table error until that migration completes.

Do not run the contract migration before the new application release is fully rolled out. Older binaries may still read or write the legacy `users` preference columns during rolling deploys.

## Legacy Stripe entitlement archive

The expand phase runs `20260706221000_archive_legacy_stripe_entitlements` before the contract phase can drop the legacy Stripe columns. Before contract dispatch, verify every legacy Stripe identity was archived:

```sql
SELECT
  count(*) AS legacy_identities,
  count(archive.user_id) AS archived_identities
FROM users
LEFT JOIN legacy_stripe_entitlement_archive AS archive
  ON archive.user_id = users.id
WHERE users.stripe_customer_id IS NOT NULL
   OR users.stripe_subscription_id IS NOT NULL;
```

The counts must match. Export the archive to the approved operator location and verify each paid identity is owned by the expected Clerk user before entering the contract confirmation. The archive retains `user_id`, `auth_user_id`, both Stripe IDs, and the subscription projection fields; it does not restore Stripe commerce paths.

The phased migration runner refuses to continue when the drop version is already recorded but the archive version is missing. That state cannot be repaired from the current `users` table. Restore a pre-drop backup into an isolated database, export and verify the legacy identities, import them into `legacy_stripe_entitlement_archive` on the target, and only then repair version `20260706221000` as applied. Do not run the contract phase until the archive is present and verified.

## Database migrations and internal workers

After deploying a release that includes new Supabase migrations:

1. Before deploying code that needs new schema, manually dispatch the environment workflow's `expand` phase (`staging-db-migrations.yaml` from `develop`, `production-db-migrations.yaml` from `main`).
2. After rollout health and any migration-specific archive checks pass, dispatch `contract` with confirmation `post-deploy-health-verified`. Do not run `supabase db push --include-all` directly; the confirmed contract phase owns out-of-order/destructive application.
3. Set worker tokens in the target environment for enabled internal routes:
   - `REGENERATION_WORKER_TOKEN` for regeneration drains
   - `WORKER_HEALTH_TOKEN` for `GET /api/health/worker` operator metrics
   - `RETENTION_CLEANUP_ENABLED=true` and/or `PLAN_CLEANUP_ENABLED=true` plus `MAINTENANCE_WORKER_TOKEN` only when enabling maintenance routes
4. Verify plan cleanup scheduler and alerting when `PLAN_CLEANUP_ENABLED=true`:
   - Set the same `MAINTENANCE_WORKER_TOKEN` value in Vercel Production and the GitHub Actions `Production – atlaris` environment secret.
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
7. Enable opted-in email notification delivery only after the env and ledger are ready:
   - Confirm `APP_URL` is the canonical https origin for that environment (required for unsubscribe and deeplink URLs; production throws if unset).
   - Configure `RESEND_API_KEY`, `RESEND_FROM`, and `EMAIL_UNSUBSCRIBE_TOKEN_SECRET` (see `emailEnv` in `docs/development/environment.md`).
   - Apply the email notification deliveries ledger migration, then enable the Vercel Flag `email-notification-delivery` after a smoke pass. The flag is fail-closed / default disabled.
   - Confirm Vercel Cron and `CRON_SECRET` are configured for production; keep `MAINTENANCE_WORKER_TOKEN` for manual recovery only. See `docs/architecture/internal-worker-routes.md`.

See also:

- `docs/architecture/internal-worker-routes.md`
- `docs/architecture/regeneration-worker-runbook.md`
- `docs/architecture/retention-cleanup-runbook.md`
- `docs/architecture/plan-cleanup-runbook.md`

## Email notification Vercel Cron cutover

The email scheduler must have exactly one active owner. This release removes the GitHub email scheduler and adds the two Vercel Cron entries together.

1. Run the migration workflow's `expand` phase before deploying code that starts email workflows. Its explicit safe list applies both `20260710151930_create_email_notification_delivery_runs` and the future-dated delivery ledger without opening the contract gate.
2. Set a new `CRON_SECRET` in the target Vercel environment. Keep it distinct from `MAINTENANCE_WORKER_TOKEN`.
3. Deploy the application with `vercel.json`; confirm Vercel lists only `0 14 * * *` and `30 14 * * 1` for `/api/cron/notifications/email`.
4. Leave the `email-notification-delivery` Vercel Flag disabled and verify both authenticated cron paths return the intentional `disabled` outcome without creating a run.
5. Enable a safe opted-in account, trigger one manual logical run, and inspect its database run, Workflow SDK run, Sentry monitor, and delivery ledger before enabling broader delivery.

See [`docs/architecture/email-notification-delivery-runbook.md`](../architecture/email-notification-delivery-runbook.md) for duplicate, failure, and `needs_review` recovery.
