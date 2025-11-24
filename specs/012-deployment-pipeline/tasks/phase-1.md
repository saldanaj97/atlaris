# Phase 1: Infrastructure Setup

## Overview

Set up the foundational infrastructure for the deployment pipeline including Neon database branches, Fly.io applications, and GitHub repository secrets.

## Prerequisites

- Neon account created
- Fly.io account created and `flyctl` CLI installed
- GitHub repository access with admin permissions
- Vercel project already connected to repository

## Tasks

### Task 1.1: Create Neon Database Branches

**Objective:** Set up three Neon branches for production, staging, and test environments.

**Steps:**

1. Log in to Neon console at https://console.neon.tech
2. Navigate to your Neon project (or create a new one)
3. Create three branches:
   - `production` (main/primary branch) - may already exist
   - `staging` (branch from production to get schema)
   - `test` (branch from production to get schema)

4. For each branch, copy the connection string:
   - Navigate to branch → Connection Details
   - Copy the connection string (format: `postgresql://[user]:[password]@[host]/[database]?sslmode=require`)

5. Store connection strings securely (you'll add them to GitHub Secrets in Task 1.4)

**Verification:**

- [x] Three branches visible in Neon console
- [x] Each branch has a unique connection string
- [x] Connection strings include `?sslmode=require` parameter

**Expected Output:**

- `DATABASE_URL_PROD` - Production branch connection string
- `DATABASE_URL_STAGING` - Staging branch connection string
- `DATABASE_URL` - Test branch connection string (for CI)

---

### Task 1.2: Install and Configure Fly.io CLI

**Objective:** Install Fly.io CLI and authenticate.

**Steps:**

1. Install `flyctl` CLI:

   ```bash
   # macOS
   brew install flyctl

   # Linux
   curl -L https://fly.io/install.sh | sh

   # Windows
   pwsh -Command "iwr https://fly.io/install.ps1 -useb | iex"
   ```

2. Verify installation:

   ```bash
   flyctl version
   ```

3. Authenticate with Fly.io:

   ```bash
   flyctl auth login
   ```

   - This will open a browser window for authentication
   - Complete the login flow

4. Verify authentication:
   ```bash
   flyctl auth whoami
   ```

**Verification:**

- [x] `flyctl version` shows installed version
- [x] `flyctl auth whoami` shows your email/username
- [x] You can access Fly.io dashboard at https://fly.io/dashboard

**Expected Output:**

- Fly.io CLI installed and authenticated

---

### Task 1.3: Create Fly.io Applications

**Objective:** Create 4 Fly.io applications for staging and production workers.

**Steps:**

1. Create staging plan generation worker:

   ```bash
   flyctl apps create atlaris-worker-staging --org personal
   ```

2. Create staging plan regeneration worker:

   ```bash
   flyctl apps create atlaris-worker-regenerator-staging --org personal
   ```

3. Create production plan generation worker:

   ```bash
   flyctl apps create atlaris-worker-prod --org personal
   ```

4. Create production plan regeneration worker:

   ```bash
   flyctl apps create atlaris-worker-regenerator-prod --org personal
   ```

5. Verify all apps were created:
   ```bash
   flyctl apps list
   ```

**Verification:**

- [x] 4 apps visible in `flyctl apps list`
- [x] Apps are in the correct organization
- [x] Each app has a unique name matching the pattern above

**Expected Output:**

- 4 Fly.io applications created:
  - `atlaris-worker-staging`
  - `atlaris-worker-regenerator-staging`
  - `atlaris-worker-prod`
  - `atlaris-worker-regenerator-prod`

---

### Task 1.4: Configure GitHub Secrets

**Objective:** Add all required secrets to GitHub repository for CI/CD workflows.

**Steps:**

1. Navigate to your GitHub repository
2. Go to Settings → Secrets and variables → Actions
3. Click "New repository secret" for each of the following:

**Deployment Credentials:**

4. Add Fly.io API token:
   - Name: `FLY_API_TOKEN`
   - Value: Generate token with `flyctl auth token`
   - Click "Add secret"

5. Add Vercel token (if deploying via CLI):
   - Name: `VERCEL_TOKEN`
   - Value: Generate at https://vercel.com/account/tokens
   - Click "Add secret"

6. Add Vercel organization ID:
   - Name: `VERCEL_ORG_ID`
   - Value: Find in Vercel project settings → General
   - Click "Add secret"

7. Add Vercel project ID:
   - Name: `VERCEL_PROJECT_ID`
   - Value: Find in Vercel project settings → General
   - Click "Add secret"

**Database Connection Strings:**

8. Add staging database URL:
   - Name: `DATABASE_URL_STAGING`
   - Value: Neon `staging` branch connection string (from Task 1.1)
   - Click "Add secret"

9. Add production database URL:
   - Name: `DATABASE_URL_PROD`
   - Value: Neon `production` branch connection string (from Task 1.1)
   - Click "Add secret"

10. Update test database URL (if not already set):
    - Name: `DATABASE_URL`
    - Value: Neon `test` branch connection string (from Task 1.1)
    - Click "Add secret"

**Smoke Test Credentials (will configure in Phase 4):**

11. Add smoke test API key placeholder:
    - Name: `SMOKE_TEST_API_KEY`
    - Value: `placeholder` (will update in Phase 4)
    - Click "Add secret"

**Verification:**

- [x] Navigate to Settings → Secrets and variables → Actions
- [x] Verify all 8 secrets are listed
- [x] No secrets show their values (GitHub hides them)

**Expected Output:**

- 8 GitHub secrets configured:
  - `FLY_API_TOKEN`
  - `VERCEL_TOKEN`
  - `VERCEL_ORG_ID`
  - `VERCEL_PROJECT_ID`
  - `DATABASE_URL_STAGING`
  - `DATABASE_URL_PROD`
  - `DATABASE_URL` (test)
  - `SMOKE_TEST_API_KEY`

---

### Task 1.5: Verify Existing Application Secrets

**Objective:** Confirm all existing application secrets are available in the current environments.

**Steps:**

1. Verify Vercel environment variables:
   - Go to Vercel dashboard → Your project → Settings → Environment Variables
   - Confirm these exist for both Preview (staging) and Production:
     - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
     - `CLERK_SECRET_KEY`
   - `NEXT_PUBLIC_NEON_URL` (will transition to Neon)
   - `NEXT_PUBLIC_NEON_PUBLISHABLE_KEY` (may not be needed with Neon)
     - `STRIPE_SECRET_KEY`
     - `STRIPE_PUBLISHABLE_KEY`
     - `OPENAI_API_KEY`
     - Any other app-specific secrets

2. Note which secrets need to be added to Fly.io workers (will do in Phase 5)

**Verification:**

- [x] All required Vercel env vars exist for Preview environment
- [x] All required Vercel env vars exist for Production environment
- [x] List of secrets needed for Fly.io workers documented

**Expected Output:**

- Confirmation that Vercel has all necessary environment variables
- List of secrets to set in Fly.io (for Phase 5)

---

## Phase Completion Checklist

- [x] Task 1.1: Three Neon branches created with connection strings saved
- [x] Task 1.2: Fly.io CLI installed and authenticated
- [x] Task 1.3: Four Fly.io applications created
- [x] Task 1.4: Eight GitHub secrets configured
- [x] Task 1.5: Existing Vercel environment variables verified

## Next Phase

Proceed to **Phase 2: Worker Configuration** to create Dockerfiles and Fly.io configuration files for the worker applications.

## Troubleshooting

**Issue:** Neon connection string doesn't include `?sslmode=require`

- **Solution:** Manually append `?sslmode=require` to the connection string

**Issue:** `flyctl apps create` fails with "name already taken"

- **Solution:** Choose different app names or delete existing apps with `flyctl apps destroy <app-name>`

**Issue:** GitHub secrets not saving

- **Solution:** Ensure you have admin access to the repository; check repository settings permissions

**Issue:** Cannot generate Fly.io token

- **Solution:** Ensure you're authenticated with `flyctl auth login` first, then run `flyctl auth token`
