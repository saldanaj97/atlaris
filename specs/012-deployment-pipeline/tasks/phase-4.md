# Phase 4: Smoke Test Implementation

## Overview

Implement end-to-end smoke tests that validate the entire deployment stack (API → Database → Worker → AI provider) after staging deployments.

## Prerequisites

- Phase 3 completed (Deployment workflows created and committed)
- Staging environment deployed at least once
- Test user credentials or API authentication set up

## Tasks

### Task 4.1: Create Smoke Test Directory Structure

**Objective:** Set up the directory structure for smoke tests.

**Steps:**

1. Create smoke test directory:

   ```bash
   mkdir -p tests/smoke
   ```

2. Verify directory created:
   ```bash
   ls -la tests/
   ```

**Verification:**

- [ ] `tests/smoke/` directory exists
- [ ] Directory is empty and ready for test files

**Expected Output:**

- Smoke test directory structure created

---

### Task 4.2: Create Smoke Test Helper Utilities

**Objective:** Create utility functions for smoke tests (API client, database helpers, polling).

**Steps:**

1. Create `tests/smoke/helpers.ts`:

```typescript
import { createClient } from '@neon/neon-js';

export interface SmokeTestConfig {
  apiUrl: string;
  databaseUrl: string;
  apiKey: string;
}

/**
 * Create a plan via API
 */
export async function createPlan(
  config: SmokeTestConfig,
  payload: {
    topic: string;
    skillLevel: 'beginner' | 'intermediate' | 'advanced';
    weeklyHours: number;
  }
) {
  const response = await fetch(`${config.apiUrl}/api/plans`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to create plan: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

/**
 * Poll for job completion with exponential backoff
 */
export async function waitForJobCompletion(
  jobId: string,
  databaseUrl: string,
  maxWaitMs = 60000
): Promise<boolean> {
  const startTime = Date.now();
  let attempt = 0;

  while (Date.now() - startTime < maxWaitMs) {
    // Connect to database and check job status
    const neon = createClient(databaseUrl, 'service-role-key', {
      auth: { persistSession: false },
    });

    const { data: job, error } = await neon
      .from('jobs')
      .select('status')
      .eq('id', jobId)
      .single();

    if (error) {
      throw new Error(`Failed to query job: ${error.message}`);
    }

    if (job.status === 'completed') {
      return true;
    }

    if (job.status === 'failed') {
      throw new Error(`Job ${jobId} failed`);
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, ...
    const waitMs = Math.min(1000 * Math.pow(2, attempt), 8000);
    await sleep(waitMs);
    attempt++;
  }

  throw new Error(`Job ${jobId} did not complete within ${maxWaitMs}ms`);
}

/**
 * Verify plan exists with modules and tasks
 */
export async function verifyPlanExists(
  planId: string,
  databaseUrl: string
): Promise<{ modulesCount: number; tasksCount: number }> {
  const neon = createClient(databaseUrl, 'service-role-key', {
    auth: { persistSession: false },
  });

  // Get plan with modules and tasks
  const { data: plan, error: planError } = await neon
    .from('learning_plans')
    .select('id, title, modules(id, title, tasks(id, title))')
    .eq('id', planId)
    .single();

  if (planError) {
    throw new Error(`Failed to query plan: ${planError.message}`);
  }

  if (!plan) {
    throw new Error(`Plan ${planId} not found`);
  }

  const modulesCount = plan.modules?.length || 0;
  const tasksCount =
    plan.modules?.reduce(
      (sum, module) => sum + (module.tasks?.length || 0),
      0
    ) || 0;

  return { modulesCount, tasksCount };
}

/**
 * Cleanup test data
 */
export async function cleanupTestData(
  planId: string,
  databaseUrl: string
): Promise<void> {
  const neon = createClient(databaseUrl, 'service-role-key', {
    auth: { persistSession: false },
  });

  // Delete plan (CASCADE will delete modules, tasks, jobs)
  const { error } = await neon.from('learning_plans').delete().eq('id', planId);

  if (error) {
    console.error(`Failed to cleanup plan ${planId}:`, error.message);
  }
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

2. Save the file at `/Users/juansaldana/Projects/atlaris/tests/smoke/helpers.ts`

**Verification:**

- [ ] File created at `tests/smoke/helpers.ts`
- [ ] TypeScript compiles without errors

**Expected Output:**

- Smoke test helper utilities created

---

### Task 4.3: Create Plan Generation Smoke Test

**Objective:** Create the main smoke test that validates the entire plan generation flow.

**Steps:**

1. Create `tests/smoke/plan-generation.smoke.spec.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createPlan,
  waitForJobCompletion,
  verifyPlanExists,
  cleanupTestData,
  type SmokeTestConfig,
} from './helpers';

describe('Plan Generation Smoke Test', () => {
  let config: SmokeTestConfig;
  let createdPlanId: string;
  let createdJobId: string;

  beforeAll(() => {
    // Load configuration from environment variables
    config = {
      apiUrl: process.env.SMOKE_TEST_API_URL || 'http://localhost:3000',
      databaseUrl:
        process.env.SMOKE_TEST_DATABASE_URL || process.env.DATABASE_URL || '',
      apiKey: process.env.SMOKE_TEST_API_KEY || '',
    };

    // Validate configuration
    if (!config.apiUrl) {
      throw new Error('SMOKE_TEST_API_URL is required');
    }
    if (!config.databaseUrl) {
      throw new Error('SMOKE_TEST_DATABASE_URL is required');
    }
    if (!config.apiKey) {
      throw new Error('SMOKE_TEST_API_KEY is required');
    }
  });

  afterAll(async () => {
    // Cleanup test data if plan was created
    if (createdPlanId && config.databaseUrl) {
      await cleanupTestData(createdPlanId, config.databaseUrl);
    }
  });

  it('should create plan, process job, and generate modules/tasks', async () => {
    // Step 1: Create plan via API
    console.log('Step 1: Creating plan via API...');
    const planResponse = await createPlan(config, {
      topic: 'Smoke Test - TypeScript Basics',
      skillLevel: 'beginner',
      weeklyHours: 5,
    });

    expect(planResponse).toBeDefined();
    expect(planResponse.planId).toBeDefined();
    expect(planResponse.jobId).toBeDefined();

    createdPlanId = planResponse.planId;
    createdJobId = planResponse.jobId;

    console.log(`Plan created: ${createdPlanId}, Job: ${createdJobId}`);

    // Step 2: Wait for worker to process job
    console.log('Step 2: Waiting for worker to process job...');
    const jobCompleted = await waitForJobCompletion(
      createdJobId,
      config.databaseUrl,
      60000 // 60 second timeout
    );

    expect(jobCompleted).toBe(true);
    console.log('Job completed successfully');

    // Step 3: Verify plan exists with modules and tasks
    console.log('Step 3: Verifying plan structure...');
    const { modulesCount, tasksCount } = await verifyPlanExists(
      createdPlanId,
      config.databaseUrl
    );

    expect(modulesCount).toBeGreaterThan(0);
    expect(tasksCount).toBeGreaterThan(0);

    console.log(`Plan verified: ${modulesCount} modules, ${tasksCount} tasks`);
    console.log('✅ Smoke test passed!');
  }, 90000); // 90 second test timeout
});
```

2. Save the file at `/Users/juansaldana/Projects/atlaris/tests/smoke/plan-generation.smoke.spec.ts`

**Verification:**

- [ ] File created at `tests/smoke/plan-generation.smoke.spec.ts`
- [ ] TypeScript compiles without errors

**Expected Output:**

- Plan generation smoke test created

---

### Task 4.4: Add Smoke Test npm Script

**Objective:** Add a convenient npm script to run smoke tests.

**Steps:**

1. Open `package.json`

2. Add smoke test script to the `scripts` section:

```json
{
  "scripts": {
    // ... existing scripts
    "test:smoke": "vitest run tests/smoke --reporter=verbose"
  }
}
```

3. Save the file

**Verification:**

- [ ] `test:smoke` script added to package.json
- [ ] Script runs without errors (will fail until environment is configured)

**Expected Output:**

- Smoke test npm script available

---

### Task 4.5: Update Vitest Configuration for Smoke Tests

**Objective:** Ensure smoke tests can run with proper configuration.

**Steps:**

1. Open `vitest.config.ts`

2. Verify smoke tests can use the existing configuration or add a specific project if needed:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // ... existing config
  test: {
    // Add smoke test pattern to globals
    include: [
      'tests/**/*.{test,spec}.{ts,tsx}',
      'tests/smoke/**/*.smoke.spec.ts', // Explicitly include smoke tests
    ],
    // ... rest of config
  },
});
```

3. Save the file

**Verification:**

- [ ] Smoke tests are included in vitest configuration
- [ ] Test pattern matches `*.smoke.spec.ts` files

**Expected Output:**

- Vitest configuration updated to support smoke tests

---

### Task 4.6: Create Test User or API Key for Smoke Tests

**Objective:** Set up authentication credentials for smoke tests.

**Steps:**

**Option A: Create Test API Key (Recommended)**

1. Add API key authentication to your API routes (if not already present)

2. Generate a test API key:

   ```bash
   # Example: Create a simple UUID-based key
   node -e "console.log('test_' + require('crypto').randomUUID())"
   ```

3. Store the key in your application's database or environment config

4. Save the key for adding to GitHub secrets in Task 4.7

**Option B: Create Test Clerk User**

1. Log in to Clerk dashboard

2. Navigate to Users → Create User

3. Create a test user:
   - Email: `smoke-test@atlaris.test`
   - Password: Generate a secure password

4. Get the user's authentication token via Clerk API or test session

5. Save the token for adding to GitHub secrets in Task 4.7

**Verification:**

- [ ] Test credentials created (API key or Clerk user)
- [ ] Credentials can authenticate with your API
- [ ] Credentials saved securely for GitHub secrets

**Expected Output:**

- Test authentication credentials ready for smoke tests

---

### Task 4.7: Update GitHub Secrets with Smoke Test Configuration

**Objective:** Add smoke test configuration to GitHub secrets.

**Steps:**

1. Navigate to GitHub repository → Settings → Secrets and variables → Actions

2. Update `SMOKE_TEST_API_KEY` secret:
   - Click on `SMOKE_TEST_API_KEY`
   - Click "Update secret"
   - Value: The test API key or Clerk token from Task 4.6
   - Click "Update secret"

3. Add additional secret if using neon service role:

- Name: `NEON_SERVICE_ROLE_KEY_STAGING` (if needed for smoke tests)
- Value: Staging neon service role key
- Click "Add secret"

**Verification:**

- [ ] `SMOKE_TEST_API_KEY` updated with real credentials
- [ ] Any additional secrets added
- [ ] All secrets show as configured in GitHub

**Expected Output:**

- GitHub secrets updated with smoke test credentials

---

### Task 4.8: Update Staging Deployment Workflow with Smoke Tests

**Objective:** Replace the smoke test placeholder in the staging workflow with actual test execution.

**Steps:**

1. Open `.github/workflows/deploy-staging.yml`

2. Replace the `smoke-tests` job with:

```yaml
smoke-tests:
  name: Smoke Tests (Staging)
  needs: [deploy-nextjs]
  runs-on: ubuntu-latest
  timeout-minutes: 5
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

    - name: Run smoke tests
      env:
        SMOKE_TEST_API_URL: https://atlaris-git-staging-your-username.vercel.app # Update with your staging URL
        SMOKE_TEST_DATABASE_URL: ${{ secrets.DATABASE_URL_STAGING }}
        SMOKE_TEST_API_KEY: ${{ secrets.SMOKE_TEST_API_KEY }}
      run: pnpm test:smoke

    - name: Report smoke test results
      if: always()
      run: |
        if [ $? -eq 0 ]; then
          echo "✅ Smoke tests passed"
        else
          echo "❌ Smoke tests failed"
          exit 1
        fi
```

3. Update `SMOKE_TEST_API_URL` with your actual Vercel staging URL

4. Save the file

**Verification:**

- [ ] Smoke test job updated in workflow
- [ ] Environment variables configured correctly
- [ ] Staging URL is correct

**Expected Output:**

- Staging workflow now executes real smoke tests

---

### Task 4.9: Test Smoke Tests Locally

**Objective:** Verify smoke tests work locally before committing.

**Steps:**

1. Set environment variables for local test:

   ```bash
   export SMOKE_TEST_API_URL="http://localhost:3000"  # Or your staging URL
   export SMOKE_TEST_DATABASE_URL="your-neon-staging-db-url"
   export SMOKE_TEST_API_KEY="your-test-api-key"
   ```

2. Ensure local dev server is running (if testing against localhost):

   ```bash
   pnpm dev
   ```

3. Run smoke tests:

   ```bash
   pnpm test:smoke
   ```

4. Verify test output shows:
   - Plan created via API
   - Job processed by worker
   - Plan verified with modules and tasks
   - Test passes successfully

**Verification:**

- [ ] Smoke test runs successfully locally
- [ ] Test creates plan, waits for job, verifies structure
- [ ] Test cleanup removes test data

**Expected Output:**

- Smoke tests pass locally

---

### Task 4.10: Commit Smoke Test Files

**Objective:** Commit all smoke test implementation files.

**Steps:**

1. Stage smoke test files:

   ```bash
   git add tests/smoke/ \
           package.json \
           vitest.config.ts \
           .github/workflows/deploy-staging.yml
   ```

2. Commit the files:

   ```bash
   git commit -m "feat: implement smoke tests for deployment validation

   Add end-to-end smoke tests that validate deployments:
   - tests/smoke/helpers.ts: Utility functions for API calls, job polling, and verification
   - tests/smoke/plan-generation.smoke.spec.ts: Main smoke test for plan generation flow
   - Update package.json with test:smoke script
   - Update vitest.config.ts to support smoke tests
   - Update deploy-staging.yml to run smoke tests after deployment

   Smoke test flow:
   1. Create plan via API
   2. Poll database for job completion (60s timeout)
   3. Verify plan exists with modules and tasks
   4. Cleanup test data

   Tests validate the entire stack:
   - Next.js API endpoints
   - Database connectivity
   - Worker job processing
   - AI provider integration
   "
   ```

3. Push to `staging` branch:
   ```bash
   git push origin staging
   ```

**Verification:**

- [ ] All smoke test files committed
- [ ] Changes pushed to remote
- [ ] Files visible in GitHub repository

**Expected Output:**

- Smoke test implementation committed and ready for CI

---

## Phase Completion Checklist

- [ ] Task 4.1: Smoke test directory structure created
- [ ] Task 4.2: Smoke test helper utilities created
- [ ] Task 4.3: Plan generation smoke test created
- [ ] Task 4.4: npm smoke test script added
- [ ] Task 4.5: Vitest configuration updated
- [ ] Task 4.6: Test credentials created
- [ ] Task 4.7: GitHub secrets updated
- [ ] Task 4.8: Staging workflow updated with smoke tests
- [ ] Task 4.9: Smoke tests verified locally
- [ ] Task 4.10: All files committed and pushed

## Next Phase

Proceed to **Phase 5: Secrets Configuration** to configure all necessary secrets in Fly.io worker applications.

## Troubleshooting

**Issue:** Smoke test fails with "SMOKE_TEST_API_URL is required"

- **Solution:** Ensure environment variable is set before running tests

**Issue:** Smoke test times out waiting for job

- **Solution:** Check that workers are running and processing jobs; verify database connection

**Issue:** Cannot connect to neon in smoke test

- **Solution:** Verify database URL includes `?sslmode=require` and service role key is correct

**Issue:** API returns 401 Unauthorized

- **Solution:** Verify `SMOKE_TEST_API_KEY` is valid and API authentication is configured correctly

**Issue:** Smoke test fails cleanup

- **Solution:** Non-critical error; test data may persist but won't affect other tests
