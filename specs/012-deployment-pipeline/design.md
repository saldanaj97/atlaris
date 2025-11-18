# CI/CD and Deployment Pipeline Design

**Date:** 2025-11-18
**Status:** Approved
**Author:** Design session with user

## Overview

This document describes the complete CI/CD and deployment pipeline architecture for Atlaris, including automated deployments for both the Next.js application and background worker processes. The design prioritizes zero-downtime deployments, comprehensive testing gates, and clear separation between staging and production environments.

## Goals

- **Zero-downtime deployments** with easy upgrade path from brief-downtime approach
- **Isolated staging and production environments** for safe testing
- **Automated deployments** triggered by git branch pushes
- **Comprehensive gates** including smoke tests before production
- **Database migration automation** integrated into deployment flow
- **Free tier optimization** with clear upgrade path as user base grows

## Architecture Overview

### Environment Architecture

**Staging Environment (`main` branch):**

- **Next.js App:** Vercel preview deployment
- **Plan Generation Worker:** Fly.io app `atlaris-worker-staging`
- **Plan Regeneration Worker:** Fly.io app `atlaris-worker-regenerator-staging`
- **Database:** Neon `staging` branch (PostgreSQL)

**Production Environment (`prod` branch):**

- **Next.js App:** Vercel production deployment
- **Plan Generation Worker:** Fly.io app `atlaris-worker-prod`
- **Plan Regeneration Worker:** Fly.io app `atlaris-worker-regenerator-prod`
- **Database:** Neon `production` branch (PostgreSQL)

**Test Environment (CI only):**

- **Database:** Neon `test` branch (ephemeral, truncated frequently)

### Key Principles

1. **Complete environment isolation** - Staging and production workers never share resources
2. **GitHub Actions orchestration** - All deployments controlled via workflows using Fly.io CLI and Vercel CLI
3. **Database-first migrations** - Migrations run before application deployments
4. **No code changes required** - Workers already have graceful shutdown handlers (SIGTERM/SIGINT)

## Deployment Flow

### Staging Deployment (Push to `main`)

**Trigger:** Push to `main` branch

**Prerequisites:**

- All CI checks pass (lint, type-check, build, unit tests, integration tests)

**Deployment Steps:**

1. **Database Migration**
   - Run `pnpm db:migrate` against Neon `staging` branch
   - Abort deployment if migration fails
   - Migrations are idempotent and run in transactions where possible

2. **Deploy Workers to Fly.io**
   - Deploy `atlaris-worker-staging` (plan generation worker)
   - Deploy `atlaris-worker-regenerator-staging` (plan regeneration worker)
   - Wait for Fly.io health checks to pass
   - Workers gracefully shut down existing processes (SIGTERM handlers)

3. **Deploy Next.js to Vercel**
   - Automatic deployment via Vercel GitHub integration or manual via Vercel CLI
   - Vercel handles build and deployment

4. **Run Smoke Tests**
   - End-to-end test: Create plan → Verify worker processes → Verify plan exists
   - Test validates entire stack: API → Database → Worker → AI provider
   - Timeout: 90 seconds (60s worker processing + 30s buffer)

5. **Report Status**
   - Update GitHub commit status
   - Mark staging as green ✅ if smoke tests pass

### Production Deployment (Push to `prod`)

**Trigger:** Push or merge to `prod` branch

**Prerequisites:**

- All CI checks pass on `prod` branch
- Staging deployment is green (last `main` branch deployment successful)

**Deployment Steps:**

1. **Database Migration**
   - Run `pnpm db:migrate` against Neon `production` branch
   - Migrations must have passed in staging first
   - Abort deployment if migration fails
   - Neon provides point-in-time recovery for rollback if needed

2. **Deploy Workers to Fly.io**
   - Deploy `atlaris-worker-prod` (plan generation worker)
   - Deploy `atlaris-worker-regenerator-prod` (plan regeneration worker)
   - Wait for Fly.io health checks
   - Brief downtime acceptable: 30-60 seconds during worker replacement

3. **Deploy Next.js to Vercel**
   - Deploy to Vercel production environment
   - Vercel handles build and deployment

4. **Optional Production Smoke Tests**
   - Quick verification (recommended but not blocking)

5. **Report Success**
   - Update GitHub commit status
   - Production deployment complete

## Database Strategy

### Neon Branch Architecture

**Single Neon Project with 3 Branches:**

1. **`production` branch** - Production database (primary/main branch)
2. **`staging` branch** - Staging environment (can branch from production for realistic data)
3. **`test` branch** - CI test runs (ephemeral, frequently reset)

### Migration Execution

**Staging Migrations:**

- Command: `pnpm db:migrate` with `DATABASE_URL_STAGING`
- Runs in GitHub Actions before worker/app deployment
- Failure aborts entire staging deployment
- Idempotent migrations ensure safe re-runs

**Production Migrations:**

- Command: `pnpm db:migrate` with `DATABASE_URL_PROD`
- Runs in GitHub Actions before worker/app deployment
- Safety measures:
  - Migrations validated in staging first
  - Always additive (add columns, never drop in same release)
  - Neon point-in-time recovery available for rollback
- Failure aborts production deployment immediately

**Migration Best Practices:**

- Never drop columns/tables in same release as code changes (two-phase: deprecate → remove later)
- Test migrations in staging before production
- Use existing `db:migrate:test-db` script for local validation
- All migrations should be reversible or have documented rollback procedures

### Environment Variables

**GitHub Secrets:**

- `DATABASE_URL_STAGING` - Neon `staging` branch connection string
- `DATABASE_URL_PROD` - Neon `production` branch connection string
- `DATABASE_URL` (test) - Neon `test` branch connection string (for CI)

## Fly.io Worker Configuration

### Worker Applications

**Staging Workers:**

1. **`atlaris-worker-staging`** - Plan generation worker
   - Runs: `src/workers/index.ts`
   - Region: Closest to Neon database region
   - Resources: Shared CPU, 256MB RAM (start small, scale up if needed)
   - Environment: `NODE_ENV=production`, `DATABASE_URL=<staging-branch>`

2. **`atlaris-worker-regenerator-staging`** - Plan regeneration worker
   - Runs: `src/workers/plan-regenerator.ts`
   - Same resources as plan generation worker
   - Polls same staging database queue independently

**Production Workers:**

1. **`atlaris-worker-prod`** - Plan generation worker
2. **`atlaris-worker-regenerator-prod`** - Plan regeneration worker

### Deployment Strategy

**Configuration Files:**

- `fly.staging.worker.toml` - Plan generator staging config
- `fly.staging.regenerator.toml` - Plan regenerator staging config
- `fly.prod.worker.toml` - Plan generator production config
- `fly.prod.regenerator.toml` - Plan regenerator production config
- `Dockerfile.worker` - Single Dockerfile for both worker types (CMD argument selects which to run)

**Deployment Characteristics:**

- Docker-based deployment (Fly.io builds from Dockerfile)
- Health checks: HTTP endpoint or process check
- Graceful shutdown: Workers already handle SIGTERM/SIGINT properly
- Auto-restart on crash: Fly.io automatic process supervision

**Current Approach (Brief Downtime):**

- Single worker instance per environment
- During deployment: old worker stops → new worker starts (30-60 second gap)
- Jobs queue in database during deployment, process when worker restarts
- Graceful shutdown handlers prevent job corruption

## GitHub Actions Workflows

### New Workflows

**1. Staging Deployment Workflow**

- **File:** `.github/workflows/deploy-staging.yml`
- **Trigger:** Push to `main` branch
- **Prerequisites:** All CI checks must pass (reuse existing `ci-main.yml` checks)
- **Steps:**
  1. Run database migrations → Neon `staging` branch
  2. Deploy workers to Fly.io
  3. Wait for Fly.io health checks
  4. Deploy Next.js to Vercel (CLI or auto-deploy)
  5. Run smoke tests
  6. Report commit status

**2. Production Deployment Workflow**

- **File:** `.github/workflows/deploy-production.yml`
- **Trigger:** Push/merge to `prod` branch
- **Prerequisites:**
  - All CI checks pass on `prod` branch
  - Staging deployment green (check `main` branch last commit status)
- **Steps:**
  1. Run database migrations → Neon `production` branch
  2. Deploy workers to Fly.io
  3. Wait for Fly.io health checks
  4. Deploy Next.js to Vercel production
  5. Optional: Run production smoke tests
  6. Report success

### Existing Workflows (Unchanged)

- `ci-pr.yml` - PR validation (lint, type-check, build, tests)
- `ci-main.yml` - Main branch validation (extended tests, e2e)
- `codeql.yml` - Security scanning
- `code-complexity.yml` - Code quality checks
- `code-duplication.yml` - Duplication detection

**Design Decision:** Deploy workflows are separate from CI checks for cleaner separation of concerns.

## Smoke Test Implementation

### Test Strategy

**Test Location:** `tests/smoke/plan-generation.smoke.spec.ts` (new smoke test suite)

**Test Flow:**

1. **Setup:** Use test user credentials (Clerk test user or API key)
2. **Create Plan:** POST to `/api/plans` with test payload (topic, skill level)
3. **Verify Job Created:** Check database for job insertion into queue
4. **Wait for Worker:** Poll for job completion (max 60 seconds, exponential backoff)
5. **Verify Plan Exists:** Query database for plan with modules and tasks
6. **Validate Structure:** Ensure plan has expected data (modules count > 0, tasks count > 0)
7. **Cleanup:** Delete test plan and job

### Execution Environment

**In GitHub Actions:**

- Runs as step after deployments complete
- Points to staging/production environment URLs and databases
- Failure marks deployment as failed
- Total timeout: 90 seconds (60s for worker processing + 30s buffer)

**Environment Variables:**

- `SMOKE_TEST_API_URL` - Staging/prod Next.js URL
- `SMOKE_TEST_DATABASE_URL` - Staging/prod database for verification
- `SMOKE_TEST_API_KEY` - Authentication for API calls

**Benefits:**

- Catches broken deployments before they reach users
- Validates entire stack: API → Database → Worker → AI provider
- Can be run manually for verification
- Tests the most critical user path (plan generation)

## Secrets and Environment Management

### GitHub Secrets (for Actions workflows)

**Deployment Credentials:**

- `FLY_API_TOKEN` - Fly.io API token for deploying workers
- `VERCEL_TOKEN` - Vercel token for deployments (if using CLI)
- `VERCEL_ORG_ID` - Vercel organization ID
- `VERCEL_PROJECT_ID` - Vercel project ID

**Database Connection Strings:**

- `DATABASE_URL_STAGING` - Neon `staging` branch connection string
- `DATABASE_URL_PROD` - Neon `production` branch connection string

**Smoke Test Credentials:**

- `SMOKE_TEST_API_KEY` - Test API key or Clerk test user token

### Application Secrets (for deployed apps)

**Existing Secrets (already configured):**

- OpenAI API keys
- Clerk authentication keys
- Stripe payment keys
- Supabase keys (transitioning to Neon)

**Fly.io Worker Secrets:**

- Set via `fly secrets set KEY=value -a app-name`
- Required for each worker app: database URL, AI provider keys, etc.

**Vercel Environment Variables:**

- Already configured in Vercel dashboard
- Separate for staging (preview) and production environments

### Security Best Practices

1. Never commit secrets to repository
2. Rotate API tokens periodically
3. Use least-privilege tokens (read-only where possible)
4. Separate staging and production secrets completely
5. Audit secret access regularly

## Zero-Downtime Upgrade Path

### Current Design (Brief Downtime Acceptable)

**Characteristics:**

- Single worker instance per environment
- 30-60 second gap during deployment (old stops → new starts)
- Jobs queue up during deployment, process when worker restarts
- Graceful shutdown handlers prevent job corruption
- Acceptable with no users; jobs are not time-sensitive

### Future Zero-Downtime Upgrade (When You Have Users)

**What Changes:**

1. **Run 2+ worker instances per environment**
   - Fly.io configuration: `scale count = 2` (or more)
   - Doubles worker cost (~$10-20/month → ~$20-40/month)

2. **Enable rolling deployments**
   - Fly.io deploys one instance at a time
   - Always at least one worker running and processing jobs
   - Configure in `fly.toml`: strategy = "rolling"

3. **Add health check endpoints**
   - Simple HTTP endpoint in workers returning 200 OK
   - Fly.io uses this to verify worker is ready before routing traffic
   - Can reuse existing graceful shutdown infrastructure

4. **Configure Fly.io deployment strategy**
   - Update `fly.toml` files with `wait_timeout` and health check config
   - Test in staging before production

**When to Upgrade:**

- Paying customers generating plans frequently
- 30-60 second delays become noticeable to users
- You need guaranteed 99.9% uptime SLA
- Revenue justifies additional infrastructure cost

**No Application Code Changes Required** - Only Fly.io configuration updates.

## Monitoring & Observability

### Current State (Documented for Future)

**Worker Metrics:**

- Job processing rate, queue depth, failures
- Already logged via existing structured logger
- Available in Fly.io logs dashboard

**Deployment Tracking:**

- GitHub deployment events
- Success/failure rates in Actions dashboard
- Commit status updates

**Database Monitoring:**

- Neon built-in monitoring
- Connection pool usage
- Query performance metrics

### Future Enhancements (When You Have Users)

**Alerting:**

- Set up when user base grows
- Options: Sentry, Datadog, or simple webhook to Slack/Discord
- Alert on: deployment failures, worker crashes, queue backup

**Metrics Dashboard:**

- Aggregate worker stats across environments
- Track deployment frequency and success rate
- Monitor job processing latency

## Rollback Strategy

### Workers (Fly.io)

**Command:** `fly releases rollback -a <app-name>`

- Instantly reverts to previous deployment
- Available via CLI or Fly.io dashboard
- Can specify specific version to rollback to

### Next.js (Vercel)

**Method:** Instant rollback in Vercel dashboard

- One-click revert to previous deployment
- No downtime during rollback
- Can rollback to any historical deployment

### Database (Neon)

**Method:** Point-in-time recovery (manual process)

- Available in Neon dashboard
- Can restore to any point in last 7 days (free tier)
- Creates new branch from backup point
- Requires updating connection strings to point to restored branch

**Prevention:**

- Always test migrations in staging first
- Use additive migrations (add columns, don't drop)
- Keep old columns during deprecation period
- Document rollback SQL for each migration

## Cost Estimates

### Current Configuration

**Fly.io Workers:**

- 4 worker instances (2 staging, 2 production)
- Shared CPU, 256MB RAM each
- Estimated: $10-20/month total
- Pay-as-you-go, scales with usage

**Neon Database:**

- Free tier: 1 project, unlimited branches
- 10GB storage, 100 hours compute/month
- Sufficient for early stage with no users
- Upgrade when needed: $19/month for more compute

**Vercel:**

- Free tier (hobby plan) or existing paid plan
- No additional cost for deployment automation

**Total Estimated Monthly Cost:** $10-30/month (mostly Fly.io workers)

### Upgrade Path Costs

**Zero-Downtime Workers:**

- 8 worker instances (4 staging, 4 production) with 2x redundancy
- Estimated: $20-40/month

**Neon Pro:**

- $19/month for increased compute and storage
- Required when user base grows

**Total with Upgrades:** $40-70/month

## Implementation Checklist

### Phase 1: Infrastructure Setup

- [ ] Create Neon project with branches (`production`, `staging`, `test`)
- [ ] Set up Fly.io account and install `flyctl` CLI
- [ ] Create 4 Fly.io apps (staging and production workers)
- [ ] Configure GitHub Secrets (Fly.io token, Neon connection strings, Vercel tokens)

### Phase 2: Worker Configuration

- [ ] Create `Dockerfile.worker` for workers
- [ ] Create 4 `fly.toml` config files (staging/prod for each worker type)
- [ ] Test local Docker builds
- [ ] Deploy workers manually to verify configuration

### Phase 3: Workflow Implementation

- [ ] Create `.github/workflows/deploy-staging.yml`
- [ ] Create `.github/workflows/deploy-production.yml`
- [ ] Implement database migration steps
- [ ] Add Fly.io deployment steps
- [ ] Configure Vercel deployment (if using CLI)

### Phase 4: Smoke Test Implementation

- [ ] Create `tests/smoke/plan-generation.smoke.spec.ts`
- [ ] Implement end-to-end test flow
- [ ] Add smoke test step to workflows
- [ ] Test smoke tests in staging environment

### Phase 5: Secrets Configuration

- [ ] Set Fly.io secrets for all 4 worker apps
- [ ] Verify Vercel environment variables
- [ ] Test deployments with real secrets
- [ ] Document secret rotation procedures

### Phase 6: Testing & Validation

- [ ] Test staging deployment end-to-end
- [ ] Verify smoke tests catch broken deployments
- [ ] Test production deployment
- [ ] Verify rollback procedures work
- [ ] Document runbook for common issues

## Future Considerations

### Potential Enhancements

1. **Preview Deployments for PRs**
   - Deploy ephemeral environments for each PR
   - Useful for testing before merge to `main`
   - Cost consideration: May exceed free tier quickly

2. **Automated Performance Testing**
   - Load test workers under realistic conditions
   - Establish performance baselines
   - Alert on regression

3. **Multi-Region Deployment**
   - Deploy workers closer to users globally
   - Reduce latency for international users
   - Significantly increases cost

4. **Canary Deployments**
   - Deploy to subset of production workers first
   - Monitor metrics before full rollout
   - Requires multiple production worker instances

5. **Database Migration Automation**
   - Automatic backup before migrations
   - Automatic rollback on failure detection
   - Migration approval workflow for production

## References

- [Fly.io Documentation](https://fly.io/docs/)
- [Vercel Deployment Documentation](https://vercel.com/docs/deployments)
- [Neon Branching Guide](https://neon.tech/docs/introduction/branching)
- [GitHub Actions Workflows](https://docs.github.com/en/actions/using-workflows)
- Worker Architecture: `docs/workers/worker-architecture.md`
- Testing Strategy: `docs/testing/testing.md`
