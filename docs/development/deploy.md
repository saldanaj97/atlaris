# Deployment Notes

## Staged Production release lane

Before cutover, prove the Production **application** binary without moving public domains:

1. Preflight an exact clean `main` SHA.
2. Let Vercel remotely build and deploy that SHA with `--prod --skip-domain` without pushing `main`; do not pull Production variables into the checkout.
3. Run narrow exact-candidate smoke on the protected generated URL.
4. Do not promote the proof candidate.

After JCS-52 checks are proven, `.github/workflows/vercel-deploy.yml` uses the same remote `--prod` build; required checks withhold domains until approval and exact-candidate smoke pass, then Vercel aliases the same artifact automatically.

Full safety model, proof/cutover boundary, abandon/rollback, and observation requirements: [staged-production-deployment.md](../ci-cd/staged-production-deployment.md).

**Unreleased does not mean isolated from Production data or services.** Staged Production uses Production-scoped configuration.

Feature cutovers below still define migration expand/contract ordering relative to that app release.

On the Hobby plan, Staging uses Vercel Preview configuration scoped to `develop`; Custom Environments are not available. Native Git deployment creation remains enabled until the custom lanes and JCS-52 are proven and Juan explicitly approves cutover. The workflow's Production job remains skipped until both `VERCEL_NATIVE_GIT_DISABLED` and `VERCEL_DEPLOYMENT_CHECKS_READY` are `true` after that cutover.

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

## Authenticated users INSERT revoke cutover

Migration `20260811100400_revoke_users_authenticated_insert` is intentionally contract-only. The expand runner applies the explicit predeploy set; the confirmed contract phase runs `supabase db push --include-all` after the application rollout. Older binaries provision a first user through the authenticated database role and still need table-level `INSERT`; the new release provisions through the service-role boundary.

Required order:

1. Dispatch the target environment's migration workflow with phase `expand`. The users `INSERT` revoke must not be applied yet.
2. Deploy the release that uses service-role user provisioning, wait for all old instances to drain, and verify the new release is healthy.
3. Dispatch phase `contract` with confirmation `post-deploy-health-verified`. This applies the users `INSERT` revoke after the old binary path is no longer serving traffic.

Rolling back before the contract phase preserves the old binary's provisioning path. After the revoke is applied, do not roll back to a binary that provisions through `authenticated`; its first-user insert will fail with a permission error. Roll forward the service-role provisioner instead of restoring the broad grant as an ad hoc rollback step.

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
3. Each successful phase runs the read-only effective-privilege attestation automatically (`scripts/db/run-phased-migrations.sh` → `bash scripts/db/attest-effective-privileges.sh <expand|contract>`). To re-run it against the linked target, use:

```bash
bash scripts/db/attest-effective-privileges.sh          # defaults to contract
bash scripts/db/attest-effective-privileges.sh expand
bash scripts/db/attest-effective-privileges.sh contract
```

It fails closed if browser roles can bypass RLS, if any public application table lacks RLS, if effective table or column grants exceed the client allowlists, if `task_progress` loses its allowed writes, or if client roles can reach service-only tables, security-definer functions, the private schema, or unsafe default table-write grants. Full checklist and allowlist paths: [client-usage.md — Privilege model and attestation](../database/client-usage.md#privilege-model-and-attestation).
4. Set worker tokens in the target environment for enabled internal routes:
   - `REGENERATION_WORKER_TOKEN` for regeneration drains
   - `WORKER_HEALTH_TOKEN` for `GET /api/health/worker` operator metrics
   - `RETENTION_CLEANUP_ENABLED=true` and/or `PLAN_CLEANUP_ENABLED=true` plus `MAINTENANCE_WORKER_TOKEN` only when enabling maintenance routes
5. Verify plan cleanup scheduler and alerting when `PLAN_CLEANUP_ENABLED=true`:
   - Set the GitHub Actions repository variable `PLAN_CLEANUP_ENABLED=true`; scheduled workflow runs are skipped until this variable is enabled, while manual dispatch remains available for checks.
   - Set the same `MAINTENANCE_WORKER_TOKEN` value in Vercel Production and the GitHub Actions `Production – atlaris` environment secret.
   - Confirm `.github/workflows/plan-cleanup-scheduler.yml` runs every 15 minutes and returns `200` with `ok: true`.
   - Confirm Sentry monitor `plan-cleanup-maintenance` receives successful check-ins; GitHub workflow failures identify `401`, `503`, and `500` responses.
6. Verify scheduled retention cleanup after migration `20260522223908_schedule_retention_cleanup.sql`:

```sql
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname = 'retention-cleanup';
```

If the migration applied but no cron job exists, enable `pg_cron` in Supabase and register the job manually (see retention runbook).

7. Enable module lesson generation when the hosted environment should serve it:
   - Register the boolean flag before the first smoke test if it does not already exist:

```bash
vercel flags create module-lesson-generation \
  --description "Allow synchronous and workflow-backed module lesson generation" \
  --scope <team>
vercel flags disable module-lesson-generation --environment development --scope <team>
vercel flags disable module-lesson-generation --environment preview --scope <team>
vercel flags disable module-lesson-generation --environment production --scope <team>
```

   - Confirm `vercel flags inspect module-lesson-generation --scope <team>` reports `Off` for Development, Preview, and Production before the first smoke.
   - Leave the Vercel Flag `module-lesson-generation` disabled until Preview smoke confirms `POST /api/v1/plans/:planId/modules/:moduleId/lesson-content/generate` returns HTTP `503` with `disabled` (fail-closed).
   - Enable only the environment being validated after that check; restore it to `Off` after controlled Preview verification. When disabled or unevaluable, generation starts no workflow and performs no provider or quota work.
   - After enablement, verify from an authenticated session that lesson generation does not return `503 disabled` for an unlocked module. See `docs/architecture/plan-generation-architecture.md` (module lesson generation) and `docs/development/environment.md`.
7. Enable opted-in email notification delivery only after the env and ledger are ready:
   - Confirm `APP_URL` is the canonical https origin for that environment (required for unsubscribe and deeplink URLs; production throws if unset).
   - Configure `RESEND_API_KEY`, `RESEND_FROM`, and `EMAIL_UNSUBSCRIBE_TOKEN_SECRET` (see `emailEnv` in `docs/development/environment.md`).
   - Apply the email notification deliveries ledger migration and `20260811100200_enforce_resolved_email_delivery_payload_minimization` in the expand phase. After rollout health verification, the confirmed contract phase applies `20260811100300_scrub_resolved_email_delivery_payloads` to scrub historical resolved payloads and validate the invariant; then run the non-PII inventory in the email delivery runbook.
   - Enable the Vercel Flag `email-notification-delivery` after a smoke pass. The flag is fail-closed / default disabled.
   - Confirm Vercel Cron and `CRON_SECRET` are configured for production; keep `MAINTENANCE_WORKER_TOKEN` for manual recovery only. See `docs/architecture/internal-worker-routes.md`.

See also:

- `docs/architecture/internal-worker-routes.md`
- `docs/architecture/regeneration-worker-runbook.md`
- `docs/architecture/retention-cleanup-runbook.md`
- `docs/architecture/plan-cleanup-runbook.md`

## Email notification Vercel Cron cutover

The email scheduler must have exactly one active owner. This release removes the GitHub email scheduler and adds the two Vercel Cron entries together.

1. Run the migration workflow's `expand` phase before deploying code that starts email workflows. Its explicit safe list applies `20260710151930_create_email_notification_delivery_runs`, the delivery ledger, and `20260811100200_enforce_resolved_email_delivery_payload_minimization` without opening the contract gate.
2. Set a new `CRON_SECRET` in the target Vercel environment. Keep it distinct from `MAINTENANCE_WORKER_TOKEN`.
3. Deploy the application with `vercel.json`; confirm Vercel lists only `0 14 * * *` for `/api/cron/notifications/email?runKind=daily` and `30 14 * * 1` for `/api/cron/notifications/email?runKind=weekly`.
4. Leave the `email-notification-delivery` Vercel Flag disabled and verify both authenticated cron paths return the intentional `disabled` outcome without creating a run.
5. Enable a safe opted-in account, trigger one manual logical run, and inspect its database run, Workflow SDK run, Sentry monitor, and delivery ledger before enabling broader delivery.

See [`docs/architecture/email-notification-delivery-runbook.md`](../architecture/email-notification-delivery-runbook.md) for duplicate, failure, and `needs_review` recovery.

## Module lesson-generation error cleanup cutover

Deploy the release that keeps lesson-generation failure diagnostics in logs only before running `20260811100000_clear_module_lesson_generation_errors` in the confirmed contract phase. Wait for all older application instances to drain first; otherwise an older binary could write a raw diagnostic back after the cleanup.
