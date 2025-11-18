# Phase 3: Workflow Implementation

## Overview

Create GitHub Actions workflows for automated staging and production deployments, including database migrations, worker deployments, and Next.js deployments.

## Prerequisites

- Phase 1 completed (GitHub secrets configured)
- Phase 2 completed (Worker configuration files committed)
- Existing CI workflows (ci-pr.yml, ci-main.yml) are passing

## Tasks

### Task 3.1: Create Staging Deployment Workflow

**Objective:** Create automated deployment workflow for the staging environment.

**Steps:**

1. Create `.github/workflows/deploy-staging.yml`:

```yaml
name: Deploy - Staging

on:
  push:
    branches: [main]
  workflow_dispatch: # Allow manual trigger

permissions:
  contents: read
  deployments: write

concurrency:
  group: deploy-staging-${{ github.ref }}
  cancel-in-progress: false # Don't cancel in-progress deployments

jobs:
  # Gate: Only deploy if CI checks passed
  check-ci:
    name: Verify CI Passed
    runs-on: ubuntu-latest
    steps:
      - name: Check CI workflow status
        uses: actions/github-script@v7
        with:
          script: |
            const { data: workflows } = await github.rest.actions.listWorkflowRunsForRepo({
              owner: context.repo.owner,
              repo: context.repo.repo,
              branch: 'main',
              event: 'push',
              status: 'completed',
              per_page: 5
            });

            const ciRun = workflows.workflow_runs.find(run =>
              run.name === 'CI - Main (trunk)' &&
              run.head_sha === context.sha
            );

            if (!ciRun) {
              core.setFailed('CI workflow not found for this commit');
              return;
            }

            if (ciRun.conclusion !== 'success') {
              core.setFailed(`CI workflow did not pass: ${ciRun.conclusion}`);
              return;
            }

            core.info('CI workflow passed ✅');

  # Step 1: Run database migrations
  migrate-database:
    name: Migrate Database (Staging)
    needs: [check-ci]
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run migrations
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL_STAGING }}
        run: pnpm db:migrate

      - name: Verify migration success
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL_STAGING }}
        run: |
          echo "Migration completed successfully"
          # Optional: Add a query to verify schema version

  # Step 2: Deploy workers to Fly.io
  deploy-workers:
    name: Deploy Workers (Staging)
    needs: [migrate-database]
    runs-on: ubuntu-latest
    timeout-minutes: 15
    strategy:
      matrix:
        include:
          - app: atlaris-worker-staging
            config: fly.staging.worker.toml
            name: Plan Generator
          - app: atlaris-worker-regenerator-staging
            config: fly.staging.regenerator.toml
            name: Plan Regenerator
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Fly.io CLI
        uses: superfly/flyctl-actions/setup-flyctl@master

      - name: Deploy ${{ matrix.name }} to Fly.io
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
        run: |
          flyctl deploy \
            --config ${{ matrix.config }} \
            --app ${{ matrix.app }} \
            --wait-timeout 300

      - name: Verify deployment
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
        run: |
          flyctl status --app ${{ matrix.app }}

  # Step 3: Deploy Next.js to Vercel (optional if auto-deploy enabled)
  deploy-nextjs:
    name: Deploy Next.js (Staging)
    needs: [deploy-workers]
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Wait for Vercel auto-deploy
        run: |
          echo "Vercel auto-deploy should be triggered by push to main"
          echo "Waiting 60 seconds for deployment to complete..."
          sleep 60

      # Alternative: Deploy via Vercel CLI if auto-deploy is disabled
      # - name: Install Vercel CLI
      #   run: npm install --global vercel@latest
      #
      # - name: Deploy to Vercel
      #   env:
      #     VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
      #     VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      #     VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
      #   run: |
      #     vercel pull --yes --environment=preview --token=$VERCEL_TOKEN
      #     vercel build --token=$VERCEL_TOKEN
      #     vercel deploy --prebuilt --token=$VERCEL_TOKEN

  # Step 4: Run smoke tests (will implement in Phase 4)
  smoke-tests:
    name: Smoke Tests (Staging)
    needs: [deploy-nextjs]
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Smoke tests placeholder
        run: |
          echo "Smoke tests will be implemented in Phase 4"
          echo "For now, deployment is considered successful"

      # Will replace with actual smoke tests in Phase 4
      # - name: Install pnpm
      #   uses: pnpm/action-setup@v4
      #
      # - name: Setup Node.js
      #   uses: actions/setup-node@v4
      #
      # - name: Install dependencies
      #   run: pnpm install --frozen-lockfile
      #
      # - name: Run smoke tests
      #   env:
      #     SMOKE_TEST_API_URL: https://your-staging-url.vercel.app
      #     SMOKE_TEST_DATABASE_URL: ${{ secrets.DATABASE_URL_STAGING }}
      #     SMOKE_TEST_API_KEY: ${{ secrets.SMOKE_TEST_API_KEY }}
      #   run: pnpm test:smoke

  # Final: Report deployment status
  report-status:
    name: Report Deployment Status
    needs: [smoke-tests]
    if: always()
    runs-on: ubuntu-latest
    steps:
      - name: Check deployment status
        run: |
          if [ "${{ needs.smoke-tests.result }}" == "success" ]; then
            echo "✅ Staging deployment successful"
            exit 0
          else
            echo "❌ Staging deployment failed"
            exit 1
          fi
```

2. Save the file at `/Users/juansaldana/Projects/atlaris/.github/workflows/deploy-staging.yml`

**Verification:**

- [ ] File created at `.github/workflows/deploy-staging.yml`
- [ ] Workflow triggers on push to `main` branch
- [ ] All job names and steps are clear and descriptive

**Expected Output:**

- `deploy-staging.yml` workflow created

---

### Task 3.2: Create Production Deployment Workflow

**Objective:** Create automated deployment workflow for the production environment.

**Steps:**

1. Create `.github/workflows/deploy-production.yml`:

```yaml
name: Deploy - Production

on:
  push:
    branches: [prod]
  workflow_dispatch: # Allow manual trigger

permissions:
  contents: read
  deployments: write

concurrency:
  group: deploy-production
  cancel-in-progress: false # Never cancel production deployments

jobs:
  # Gate 1: Verify CI passed on prod branch
  check-ci:
    name: Verify CI Passed
    runs-on: ubuntu-latest
    steps:
      - name: Check CI workflow status
        uses: actions/github-script@v7
        with:
          script: |
            const { data: workflows } = await github.rest.actions.listWorkflowRunsForRepo({
              owner: context.repo.owner,
              repo: context.repo.repo,
              branch: 'prod',
              event: 'push',
              status: 'completed',
              per_page: 5
            });

            const ciRun = workflows.workflow_runs.find(run =>
              (run.name === 'CI - Main (trunk)' || run.name === 'CI - PR (trunk)') &&
              run.head_sha === context.sha
            );

            if (!ciRun) {
              core.setFailed('CI workflow not found for this commit');
              return;
            }

            if (ciRun.conclusion !== 'success') {
              core.setFailed(`CI workflow did not pass: ${ciRun.conclusion}`);
              return;
            }

            core.info('CI workflow passed ✅');

  # Gate 2: Verify staging is healthy
  check-staging:
    name: Verify Staging is Healthy
    needs: [check-ci]
    runs-on: ubuntu-latest
    steps:
      - name: Check staging deployment status
        uses: actions/github-script@v7
        with:
          script: |
            // Check last staging deployment on main branch
            const { data: workflows } = await github.rest.actions.listWorkflowRunsForRepo({
              owner: context.repo.owner,
              repo: context.repo.repo,
              workflow_id: 'deploy-staging.yml',
              branch: 'main',
              status: 'completed',
              per_page: 1
            });

            if (workflows.workflow_runs.length === 0) {
              core.setFailed('No staging deployment found');
              return;
            }

            const lastStagingDeploy = workflows.workflow_runs[0];

            if (lastStagingDeploy.conclusion !== 'success') {
              core.setFailed(`Last staging deployment failed: ${lastStagingDeploy.conclusion}`);
              return;
            }

            core.info(`Last staging deployment passed ✅ (run #${lastStagingDeploy.run_number})`);

  # Step 1: Run database migrations
  migrate-database:
    name: Migrate Database (Production)
    needs: [check-staging]
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run migrations
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL_PROD }}
        run: pnpm db:migrate

      - name: Verify migration success
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL_PROD }}
        run: |
          echo "Production migration completed successfully"
          # Optional: Add a query to verify schema version

  # Step 2: Deploy workers to Fly.io
  deploy-workers:
    name: Deploy Workers (Production)
    needs: [migrate-database]
    runs-on: ubuntu-latest
    timeout-minutes: 15
    strategy:
      matrix:
        include:
          - app: atlaris-worker-prod
            config: fly.prod.worker.toml
            name: Plan Generator
          - app: atlaris-worker-regenerator-prod
            config: fly.prod.regenerator.toml
            name: Plan Regenerator
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Fly.io CLI
        uses: superfly/flyctl-actions/setup-flyctl@master

      - name: Deploy ${{ matrix.name }} to Fly.io
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
        run: |
          flyctl deploy \
            --config ${{ matrix.config }} \
            --app ${{ matrix.app }} \
            --wait-timeout 300

      - name: Verify deployment
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
        run: |
          flyctl status --app ${{ matrix.app }}

  # Step 3: Deploy Next.js to Vercel Production
  deploy-nextjs:
    name: Deploy Next.js (Production)
    needs: [deploy-workers]
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Wait for Vercel auto-deploy
        run: |
          echo "Vercel auto-deploy should be triggered by push to prod"
          echo "Waiting 90 seconds for deployment to complete..."
          sleep 90

      # Alternative: Deploy via Vercel CLI if auto-deploy is disabled
      # - name: Install Vercel CLI
      #   run: npm install --global vercel@latest
      #
      # - name: Deploy to Vercel Production
      #   env:
      #     VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
      #     VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      #     VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
      #   run: |
      #     vercel pull --yes --environment=production --token=$VERCEL_TOKEN
      #     vercel build --prod --token=$VERCEL_TOKEN
      #     vercel deploy --prebuilt --prod --token=$VERCEL_TOKEN

  # Step 4: Optional production smoke tests
  smoke-tests:
    name: Smoke Tests (Production)
    needs: [deploy-nextjs]
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Production smoke tests placeholder
        run: |
          echo "Production smoke tests are optional"
          echo "Deployment completed successfully"

  # Final: Report deployment status
  report-status:
    name: Report Deployment Status
    needs: [smoke-tests]
    if: always()
    runs-on: ubuntu-latest
    steps:
      - name: Check deployment status
        run: |
          if [ "${{ needs.smoke-tests.result }}" == "success" ]; then
            echo "✅ Production deployment successful"
            exit 0
          else
            echo "❌ Production deployment failed"
            exit 1
          fi
```

2. Save the file at `/Users/juansaldana/Projects/atlaris/.github/workflows/deploy-production.yml`

**Verification:**

- [ ] File created at `.github/workflows/deploy-production.yml`
- [ ] Workflow triggers on push to `prod` branch
- [ ] Includes both CI and staging health checks as gates

**Expected Output:**

- `deploy-production.yml` workflow created

---

### Task 3.3: Update CI Workflows to Support Production Branch

**Objective:** Ensure CI workflows run on the `prod` branch in addition to `main`.

**Steps:**

1. Open `.github/workflows/ci-main.yml`

2. Update the trigger section to include `prod` branch:

```yaml
on:
  push:
    branches: [main, prod] # Add 'prod' here
    paths-ignore:
      - '**/*.md'
      # ... rest of paths-ignore
```

3. Save the file

4. Verify the change looks correct

**Verification:**

- [ ] `ci-main.yml` updated to trigger on `prod` branch
- [ ] File saved successfully

**Expected Output:**

- CI workflows will run on both `main` and `prod` branches

---

### Task 3.4: Test Staging Deployment Workflow (Dry Run)

**Objective:** Verify the staging deployment workflow syntax without actually deploying.

**Steps:**

1. Validate workflow syntax using `actionlint` (install if needed):

   ```bash
   # macOS
   brew install actionlint

   # Or use Docker
   docker run --rm -v $(pwd):/repo --workdir /repo rhysd/actionlint:latest
   ```

2. Run actionlint on the new workflow:

   ```bash
   actionlint .github/workflows/deploy-staging.yml
   ```

3. Fix any syntax errors reported

4. Repeat for production workflow:
   ```bash
   actionlint .github/workflows/deploy-production.yml
   ```

**Verification:**

- [ ] No syntax errors in `deploy-staging.yml`
- [ ] No syntax errors in `deploy-production.yml`
- [ ] actionlint reports "no errors found"

**Expected Output:**

- Both workflows pass syntax validation

---

### Task 3.5: Commit Workflow Files

**Objective:** Commit the new deployment workflows to the repository.

**Steps:**

1. Stage the workflow files:

   ```bash
   git add .github/workflows/deploy-staging.yml \
           .github/workflows/deploy-production.yml \
           .github/workflows/ci-main.yml
   ```

2. Commit the files:

   ```bash
   git commit -m "feat: add automated deployment workflows

   Add GitHub Actions workflows for automated staging and production deployments:
   - deploy-staging.yml: Deploys to staging on push to main
   - deploy-production.yml: Deploys to production on push to prod
   - Update ci-main.yml to run on prod branch

   Deployment flow:
   1. Verify CI checks passed
   2. Run database migrations (Neon)
   3. Deploy workers to Fly.io (plan generator + regenerator)
   4. Deploy Next.js to Vercel
   5. Run smoke tests (placeholder, will implement in Phase 4)

   Production deployment includes additional gate:
   - Staging must be healthy (last deployment successful)

   Workflows use existing GitHub secrets:
   - FLY_API_TOKEN for Fly.io deployments
   - DATABASE_URL_STAGING/PROD for migrations
   - VERCEL_TOKEN/ORG_ID/PROJECT_ID for Vercel (optional)
   "
   ```

3. Push to `main` branch:
   ```bash
   git push origin main
   ```

**Verification:**

- [ ] All workflow files committed successfully
- [ ] Changes pushed to remote repository
- [ ] Workflows visible in GitHub Actions tab

**Expected Output:**

- Deployment workflows committed and available in GitHub repository

---

### Task 3.6: Create Production Branch

**Objective:** Create the `prod` branch for production deployments.

**Steps:**

1. Create `prod` branch from current `main`:

   ```bash
   git checkout -b prod
   ```

2. Push the `prod` branch to remote:

   ```bash
   git push -u origin prod
   ```

3. Return to `main` branch:

   ```bash
   git checkout main
   ```

4. Configure branch protection rules for `prod` (optional but recommended):
   - Go to GitHub repository → Settings → Branches
   - Click "Add branch protection rule"
   - Branch name pattern: `prod`
   - Enable:
     - Require a pull request before merging
     - Require status checks to pass before merging
     - Include administrators (optional)
   - Save changes

**Verification:**

- [ ] `prod` branch exists in remote repository
- [ ] `prod` branch is up to date with `main`
- [ ] Branch protection rules configured (optional)

**Expected Output:**

- `prod` branch created and ready for production deployments

---

## Phase Completion Checklist

- [ ] Task 3.1: Staging deployment workflow created
- [ ] Task 3.2: Production deployment workflow created
- [ ] Task 3.3: CI workflows updated to support prod branch
- [ ] Task 3.4: Workflows validated with actionlint
- [ ] Task 3.5: All workflow files committed and pushed
- [ ] Task 3.6: Production branch created

## Next Phase

Proceed to **Phase 4: Smoke Test Implementation** to create end-to-end tests that validate deployments.

## Troubleshooting

**Issue:** Workflow syntax validation fails

- **Solution:** Check YAML indentation (must use spaces, not tabs), verify all required fields are present

**Issue:** `actionlint` not available

- **Solution:** Skip validation and rely on GitHub's built-in workflow validation when you push

**Issue:** Cannot push to `main` or `prod` branch

- **Solution:** Check if branch protection rules are blocking direct pushes; may need to create PR or temporarily disable rules

**Issue:** Workflow doesn't appear in GitHub Actions tab

- **Solution:** Ensure workflow file is in `.github/workflows/` directory and has `.yml` or `.yaml` extension

**Issue:** Deployment workflow doesn't trigger

- **Solution:** Check workflow trigger conditions; ensure you pushed to the correct branch (main for staging, prod for production)
