# Phase 6: Testing & Validation

## Overview

Test the complete deployment pipeline end-to-end, verify all components work together, and establish runbook procedures for common operations.

## Prerequisites

- All previous phases completed (Phase 1-5)
- All secrets configured
- Workers deployed to Fly.io
- Vercel deployments active

## Tasks

### Task 6.1: Test Staging Deployment End-to-End

**Objective:** Trigger a complete staging deployment and verify all steps complete successfully.

**Steps:**

1. Make a trivial change to trigger deployment:

   ```bash
   # Add a comment to a file
   echo "# Test staging deployment" >> README.md
   git add README.md
   git commit -m "test: trigger staging deployment"
   git push origin main
   ```

2. Monitor the deployment in GitHub Actions:
   - Go to GitHub repository → Actions tab
   - Find the "Deploy - Staging" workflow run
   - Watch each job execute:
     - ✅ check-ci
     - ✅ migrate-database
     - ✅ deploy-workers (both workers)
     - ✅ deploy-nextjs
     - ✅ smoke-tests

3. Verify database migration ran:
   - Check workflow logs for "migrate-database" job
   - Look for "Migration completed successfully"

4. Verify workers deployed:
   - Check Fly.io logs:
     ```bash
     flyctl logs --app atlaris-worker-staging
     flyctl logs --app atlaris-worker-regenerator-staging
     ```
   - Look for "worker_start" log entries

5. Verify Next.js deployed:
   - Visit your Vercel staging URL
   - Verify site loads correctly

6. Verify smoke tests passed:
   - Check workflow logs for "smoke-tests" job
   - Look for "✅ Smoke tests passed"

**Verification:**

- [ ] All CI checks passed before deployment
- [ ] Database migration completed successfully
- [ ] Both workers deployed and running on Fly.io
- [ ] Next.js app deployed to Vercel staging
- [ ] Smoke tests passed
- [ ] Overall workflow status is "Success" (green check)

**Expected Output:**

- Complete staging deployment successful

---

### Task 6.2: Test Production Deployment End-to-End

**Objective:** Deploy to production and verify the production deployment workflow works.

**Steps:**

1. Ensure staging is healthy (from Task 6.1)

2. Merge `main` to `prod` branch:

   ```bash
   git checkout prod
   git merge main
   git push origin prod
   ```

3. Monitor the deployment in GitHub Actions:
   - Go to GitHub repository → Actions tab
   - Find the "Deploy - Production" workflow run
   - Watch each job execute:
     - ✅ check-ci
     - ✅ check-staging (verifies staging is healthy)
     - ✅ migrate-database
     - ✅ deploy-workers (both workers)
     - ✅ deploy-nextjs
     - ✅ smoke-tests (optional)

4. Verify production database migration:
   - Check workflow logs for "migrate-database" job
   - Verify it ran against production database

5. Verify production workers deployed:
   - Check Fly.io logs:
     ```bash
     flyctl logs --app atlaris-worker-prod
     flyctl logs --app atlaris-worker-regenerator-prod
     ```
   - Look for "worker_start" log entries

6. Verify production Next.js deployed:
   - Visit your Vercel production URL
   - Verify site loads correctly
   - Test creating a plan (end-to-end test)

**Verification:**

- [ ] CI checks passed on prod branch
- [ ] Staging health check passed
- [ ] Production database migration successful
- [ ] Both production workers deployed and running
- [ ] Next.js app deployed to Vercel production
- [ ] Overall workflow status is "Success"

**Expected Output:**

- Complete production deployment successful

---

### Task 6.3: Test Rollback Procedures

**Objective:** Verify you can rollback deployments if needed.

**Steps:**

**Test Worker Rollback (Staging):**

1. Check current release:

   ```bash
   flyctl releases --app atlaris-worker-staging
   ```

2. Rollback to previous release:

   ```bash
   flyctl releases rollback --app atlaris-worker-staging
   ```

3. Verify worker is running on previous version:

   ```bash
   flyctl status --app atlaris-worker-staging
   ```

4. Verify worker is processing jobs:

   ```bash
   flyctl logs --app atlaris-worker-staging
   ```

5. Roll forward again (deploy latest):
   ```bash
   # Trigger redeployment via workflow or manual deploy
   flyctl deploy --config fly.staging.worker.toml --app atlaris-worker-staging
   ```

**Test Vercel Rollback (Staging):**

1. Go to Vercel dashboard → Your project → Deployments

2. Find the previous successful deployment

3. Click the three dots → "Promote to Production" (or "Redeploy" for staging)

4. Verify the previous version is now live

5. Roll forward by deploying latest again (push to main)

**Verification:**

- [ ] Fly.io rollback successful, worker runs on previous version
- [ ] Vercel rollback successful, previous deployment is live
- [ ] Both services can be rolled forward again
- [ ] Rollback procedures documented

**Expected Output:**

- Rollback procedures verified and working

---

### Task 6.4: Test Database Migration Failure Handling

**Objective:** Verify deployments abort when migrations fail.

**Steps:**

**Create a failing migration:**

1. Create a new migration that will fail:

   ```bash
   # Example: Create a migration file manually
   mkdir -p src/lib/db/migrations
   cat > src/lib/db/migrations/0001_test_failure.sql << 'EOF'
   -- This migration intentionally fails for testing
   SELECT this_column_does_not_exist FROM nonexistent_table;
   EOF
   ```

2. Commit and push to staging:

   ```bash
   git add src/lib/db/migrations/0001_test_failure.sql
   git commit -m "test: add failing migration to test error handling"
   git push origin main
   ```

3. Watch the workflow fail:
   - Go to GitHub Actions
   - Verify "migrate-database" job fails
   - Verify subsequent jobs (deploy-workers, deploy-nextjs) are skipped
   - Deployment is aborted ✅

4. Remove the failing migration:

   ```bash
   git rm src/lib/db/migrations/0001_test_failure.sql
   git commit -m "test: remove failing migration"
   git push origin main
   ```

5. Verify deployment succeeds now

**Verification:**

- [ ] Failed migration aborts deployment
- [ ] Workers and Next.js do not deploy when migration fails
- [ ] Workflow status is "Failure" (red X)
- [ ] After removing bad migration, deployment succeeds

**Expected Output:**

- Migration failure handling works correctly

---

### Task 6.5: Test Smoke Test Failure Handling

**Objective:** Verify deployments are marked as failed when smoke tests fail.

**Steps:**

1. Temporarily break the smoke test:

   ```typescript
   // In tests/smoke/plan-generation.smoke.spec.ts
   // Change expect to fail:
   expect(modulesCount).toBeGreaterThan(1000); // Will always fail
   ```

2. Commit and push:

   ```bash
   git add tests/smoke/plan-generation.smoke.spec.ts
   git commit -m "test: intentionally fail smoke test"
   git push origin main
   ```

3. Watch the workflow:
   - Deployment jobs complete successfully
   - Smoke test job fails
   - Overall workflow is marked as "Failure"

4. Fix the smoke test:

   ```typescript
   // Restore original:
   expect(modulesCount).toBeGreaterThan(0);
   ```

5. Commit and push:

   ```bash
   git add tests/smoke/plan-generation.smoke.spec.ts
   git commit -m "test: restore smoke test"
   git push origin main
   ```

6. Verify deployment succeeds

**Verification:**

- [ ] Failed smoke test marks deployment as failed
- [ ] Deployment is live but flagged as problematic
- [ ] After fixing smoke test, deployment succeeds

**Expected Output:**

- Smoke test failure handling works correctly

---

### Task 6.6: Monitor Worker Performance and Logs

**Objective:** Establish baseline monitoring and log review procedures.

**Steps:**

1. Review staging worker logs:

   ```bash
   # View recent logs
   flyctl logs --app atlaris-worker-staging

   # Follow logs in real-time
   flyctl logs --app atlaris-worker-staging -f

   # Filter logs by level
   flyctl logs --app atlaris-worker-staging | grep ERROR
   ```

2. Check worker metrics in Fly.io dashboard:
   - Go to https://fly.io/dashboard
   - Navigate to each worker app
   - Review: CPU usage, memory usage, restart count

3. Test a real plan generation:
   - Visit your staging Next.js app
   - Create a new learning plan
   - Monitor worker logs to see job processing
   - Verify plan is generated successfully

4. Review worker statistics:

   ```bash
   # SSH into worker (if needed for debugging)
   flyctl ssh console --app atlaris-worker-staging
   ```

5. Document baseline metrics:
   - Average job processing time
   - Memory usage under load
   - CPU usage during AI calls

**Verification:**

- [ ] Can access and read worker logs
- [ ] Worker metrics visible in Fly.io dashboard
- [ ] Plan generation works end-to-end in staging
- [ ] Baseline performance documented

**Expected Output:**

- Worker monitoring procedures established

---

### Task 6.7: Create Deployment Runbook

**Objective:** Document common deployment operations for future reference.

**Steps:**

1. Create `docs/runbook.md`:

````markdown
# Deployment Runbook

This runbook covers common deployment operations and troubleshooting.

## Deployment Workflows

### Deploy to Staging

**Trigger:** Push to `main` branch
**Workflow:** `.github/workflows/deploy-staging.yml`
**Time:** ~10-15 minutes

**Steps:**

1. Push changes to `main`
2. CI checks run automatically
3. If CI passes, deployment starts:
   - Database migration (staging)
   - Worker deployment (Fly.io staging apps)
   - Next.js deployment (Vercel preview)
   - Smoke tests
4. Monitor at: https://github.com/<your-org>/atlaris/actions

### Deploy to Production

**Trigger:** Push to `prod` branch
**Workflow:** `.github/workflows/deploy-production.yml`
**Time:** ~10-15 minutes

**Steps:**

1. Ensure staging is healthy
2. Merge `main` to `prod`: `git checkout prod && git merge main && git push`
3. CI checks run on prod branch
4. Staging health check runs
5. If all checks pass, deployment starts:
   - Database migration (production)
   - Worker deployment (Fly.io production apps)
   - Next.js deployment (Vercel production)
6. Monitor at: https://github.com/<your-org>/atlaris/actions

## Emergency Procedures

### Rollback Workers

```bash
# Check releases
flyctl releases --app <app-name>

# Rollback to previous release
flyctl releases rollback --app <app-name>

# Verify rollback
flyctl status --app <app-name>
flyctl logs --app <app-name>
```
````

### Rollback Next.js (Vercel)

1. Go to Vercel dashboard
2. Navigate to Deployments
3. Find previous working deployment
4. Click "..." → "Promote to Production"

### Rollback Database (Emergency Only)

1. Go to Neon dashboard
2. Navigate to branch
3. Use point-in-time recovery to restore
4. Update connection strings in all apps

## Monitoring

### Worker Logs

```bash
# View recent logs
flyctl logs --app <app-name>

# Follow in real-time
flyctl logs --app <app-name> -f

# Filter by level
flyctl logs --app <app-name> | grep ERROR
```

### Worker Metrics

- Dashboard: https://fly.io/dashboard
- View: CPU, memory, restart count
- Alerts: Configure in Fly.io dashboard

### Database Monitoring

- Dashboard: https://console.neon.tech
- View: Connection count, query performance
- Branches: Production, Staging, Test

## Troubleshooting

### Deployment Failed - Migration Error

**Symptom:** "migrate-database" job fails
**Cause:** Invalid migration SQL or database connectivity issue
**Fix:**

1. Check workflow logs for error message
2. Verify migration SQL is correct
3. Test migration locally: `pnpm db:migrate`
4. Fix migration and push again

### Deployment Failed - Smoke Test Error

**Symptom:** "smoke-tests" job fails
**Cause:** Workers not processing jobs, API error, or test bug
**Fix:**

1. Check smoke test logs for specific error
2. Verify workers are running: `flyctl status --app <app-name>`
3. Check worker logs for job processing errors
4. Test manually by creating a plan in staging
5. Fix issue and redeploy

### Worker Not Processing Jobs

**Symptom:** Jobs stuck in "pending" status
**Cause:** Worker crashed, database connection issue, or secrets misconfigured
**Fix:**

1. Check worker status: `flyctl status --app <app-name>`
2. Check worker logs: `flyctl logs --app <app-name>`
3. Restart worker: `flyctl apps restart <app-name>`
4. Verify secrets: `flyctl secrets list --app <app-name>`
5. If needed, redeploy: trigger workflow or manual deploy

### Database Connection Errors

**Symptom:** Workers log "connection refused" or "SSL required"
**Cause:** Invalid connection string or network issue
**Fix:**

1. Verify DATABASE_URL includes `?sslmode=require`
2. Check Neon dashboard for branch status
3. Test connection locally with same connection string
4. Update secret if needed: `flyctl secrets set DATABASE_URL=...`

## Maintenance

### Update Secrets

See `docs/secrets-management.md` for rotation procedures.

### Scale Workers

```bash
# Increase instances (for zero-downtime)
flyctl scale count 2 --app <app-name>

# Increase resources
flyctl scale vm shared-cpu-2x --app <app-name>
flyctl scale memory 512 --app <app-name>
```

### View Costs

- Fly.io: https://fly.io/dashboard → Billing
- Neon: https://console.neon.tech → Billing
- Vercel: https://vercel.com → Settings → Billing

## Health Checks

### Quick Health Check

```bash
# Staging
curl https://your-staging-url.vercel.app/api/health
flyctl status --app atlaris-worker-staging

# Production
curl https://your-production-url.vercel.app/api/health
flyctl status --app atlaris-worker-prod
```

### Full Integration Test

1. Log in to staging/production
2. Create a new learning plan
3. Wait for plan to generate (~30-60 seconds)
4. Verify plan has modules and tasks
5. Check worker logs to see job processing

````

2. Save the file at `/Users/juansaldana/Projects/atlaris/docs/runbook.md`

3. Commit the runbook:
   ```bash
   git add docs/runbook.md
   git commit -m "docs: add deployment runbook"
   git push origin main
````

**Verification:**

- [ ] Runbook document created
- [ ] All common operations documented
- [ ] Troubleshooting procedures included
- [ ] File committed to repository

**Expected Output:**

- Deployment runbook created and available

---

### Task 6.8: Final Validation and Sign-Off

**Objective:** Perform final end-to-end validation of the entire deployment pipeline.

**Steps:**

1. Create a test feature branch:

   ```bash
   git checkout -b test/deployment-validation
   ```

2. Make a trivial change:

   ```bash
   echo "# Deployment pipeline validated" >> README.md
   git add README.md
   git commit -m "test: final deployment pipeline validation"
   git push origin test/deployment-validation
   ```

3. Create a PR to `main`:
   - Go to GitHub → Pull Requests → New Pull Request
   - Base: `main`, Compare: `test/deployment-validation`
   - Create PR

4. Verify PR checks run and pass:
   - ✅ CI - PR (trunk) workflow passes
   - ✅ Lint, type-check, build, tests all pass

5. Merge PR to `main`:
   - Click "Merge pull request"
   - Confirm merge

6. Verify staging deployment triggered:
   - ✅ Deploy - Staging workflow runs
   - ✅ All jobs complete successfully
   - ✅ Smoke tests pass

7. Promote to production:

   ```bash
   git checkout prod
   git merge main
   git push origin prod
   ```

8. Verify production deployment triggered:
   - ✅ Deploy - Production workflow runs
   - ✅ Staging health check passes
   - ✅ All jobs complete successfully

9. Test production end-to-end:
   - Visit production URL
   - Create a learning plan
   - Verify plan generates successfully
   - Check production worker logs

10. Document completion:
    - All phases complete ✅
    - Deployment pipeline operational ✅
    - Runbook and documentation in place ✅

**Verification:**

- [ ] PR workflow completes successfully
- [ ] Staging deployment completes successfully
- [ ] Production deployment completes successfully
- [ ] End-to-end test in production works
- [ ] All documentation is in place

**Expected Output:**

- Deployment pipeline fully validated and operational

---

## Phase Completion Checklist

- [ ] Task 6.1: Staging deployment tested end-to-end
- [ ] Task 6.2: Production deployment tested end-to-end
- [ ] Task 6.3: Rollback procedures tested
- [ ] Task 6.4: Migration failure handling tested
- [ ] Task 6.5: Smoke test failure handling tested
- [ ] Task 6.6: Worker monitoring established
- [ ] Task 6.7: Deployment runbook created
- [ ] Task 6.8: Final validation and sign-off completed

## Implementation Complete! 🎉

All phases of the deployment pipeline implementation are complete:

✅ **Phase 1:** Infrastructure Setup
✅ **Phase 2:** Worker Configuration
✅ **Phase 3:** Workflow Implementation
✅ **Phase 4:** Smoke Test Implementation
✅ **Phase 5:** Secrets Configuration
✅ **Phase 6:** Testing & Validation

## Next Steps

Now that your deployment pipeline is operational, you can:

1. **Monitor deployments** - Watch the Actions tab for deployment status
2. **Iterate on features** - Push to `main` for staging, merge to `prod` for production
3. **Scale when needed** - Increase worker instances as user base grows
4. **Upgrade to zero-downtime** - When you have paying customers, follow the upgrade path in the design doc

## Troubleshooting

**Issue:** Deployment takes longer than expected

- **Solution:** Check GitHub Actions logs to see which step is slow; workers may take time to build/deploy

**Issue:** Smoke tests occasionally fail with timeout

- **Solution:** Increase timeout in smoke test code; verify workers have enough resources to process jobs quickly

**Issue:** Workers restart frequently

- **Solution:** Check logs for errors; may need more memory or have configuration issues

**Issue:** Cost is higher than expected

- **Solution:** Review Fly.io billing dashboard; ensure only 4 workers are running; check resource allocation

## Documentation Index

- **Design:** [specs/012-deployment-pipeline/design.md](../design.md)
- **Runbook:** [docs/runbook.md](../../../docs/runbook.md)
- **Secrets Management:** [docs/secrets-management.md](../../../docs/secrets-management.md)
- **Worker Architecture:** [docs/workers/worker-architecture.md](../../../docs/workers/worker-architecture.md)
