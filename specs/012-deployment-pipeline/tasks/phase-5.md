# Phase 5: Secrets Configuration

## Overview

Configure all required secrets and environment variables in Fly.io worker applications so they can connect to databases, AI providers, and other services.

## Prerequisites

- Phase 2 completed (Fly.io apps created)
- Access to all application secrets (OpenAI keys, Clerk keys, etc.)
- Neon database connection strings from Phase 1

## Tasks

### Task 5.1: Identify Required Secrets for Workers

**Objective:** Document all environment variables that workers need to function.

**Steps:**

1. Review worker code to identify required environment variables:
   - Open `src/workers/index.ts`
   - Open `src/workers/plan-regenerator.ts`
   - Check `src/lib/config/env.ts` for worker-specific env vars

2. Create a checklist of required secrets:

**Required for All Workers:**

- `DATABASE_URL` - Neon database connection string
- `NODE_ENV` - Should be "production"

**Required for Plan Generation:**

- `OPENAI_API_KEY` - OpenAI API key for plan generation
- `GOOGLE_GENERATIVE_AI_API_KEY` - Google AI key (if using Google provider)

**Required for Curation (if enabled):**

- `ENABLE_CURATION` - Set to "true" or "false"

**Optional (may be needed):**

- `CLERK_SECRET_KEY` - If workers need to verify user context
- `NEON_SERVICE_ROLE_KEY` - If using neon-specific features
- `STRIPE_SECRET_KEY` - If workers need to check subscription status

3. Document which secrets each environment needs:

**Staging Workers Need:**

- All above secrets pointing to staging/test resources
- `DATABASE_URL` → Neon staging branch URL

**Production Workers Need:**

- All above secrets pointing to production resources
- `DATABASE_URL` → Neon production branch URL

**Verification:**

- [ ] All required secrets documented
- [ ] Staging vs production secret values identified
- [ ] Optional secrets decision made (include or skip)

**Expected Output:**

- Complete list of secrets needed for Fly.io workers

---

### Task 5.2: Set Secrets for Staging Plan Generation Worker

**Objective:** Configure all secrets for `atlaris-worker-staging` app.

**Steps:**

1. Set DATABASE_URL secret:

   ```bash
   flyctl secrets set \
     DATABASE_URL="your-neon-staging-branch-connection-string" \
     --app atlaris-worker-staging
   ```

2. Set NODE_ENV:

   ```bash
   flyctl secrets set \
     NODE_ENV="production" \
     --app atlaris-worker-staging
   ```

3. Set OpenAI API key:

   ```bash
   flyctl secrets set \
     OPENAI_API_KEY="your-openai-api-key" \
     --app atlaris-worker-staging
   ```

4. (Optional) Set Google AI key if using:

   ```bash
   flyctl secrets set \
     GOOGLE_GENERATIVE_AI_API_KEY="your-google-ai-key" \
     --app atlaris-worker-staging
   ```

5. Set curation flag:

   ```bash
   flyctl secrets set \
     ENABLE_CURATION="false" \
     --app atlaris-worker-staging
   ```

6. (Optional) Set other secrets as needed:

   ```bash
   flyctl secrets set \
     CLERK_SECRET_KEY="your-clerk-secret" \
     STRIPE_SECRET_KEY="your-stripe-secret" \
     --app atlaris-worker-staging
   ```

7. Verify secrets were set:
   ```bash
   flyctl secrets list --app atlaris-worker-staging
   ```

**Verification:**

- [ ] All required secrets set for staging plan generator
- [ ] `flyctl secrets list` shows all secrets (values are hidden)
- [ ] No errors during secret setting

**Expected Output:**

- Staging plan generation worker secrets configured

---

### Task 5.3: Set Secrets for Staging Plan Regeneration Worker

**Objective:** Configure all secrets for `atlaris-worker-regenerator-staging` app.

**Steps:**

1. Set all secrets (same as Task 5.2, but for regenerator app):

   ```bash
   flyctl secrets set \
     DATABASE_URL="your-neon-staging-branch-connection-string" \
     NODE_ENV="production" \
     OPENAI_API_KEY="your-openai-api-key" \
     ENABLE_CURATION="false" \
     --app atlaris-worker-regenerator-staging
   ```

2. (Optional) Set additional secrets:

   ```bash
   flyctl secrets set \
     GOOGLE_GENERATIVE_AI_API_KEY="your-google-ai-key" \
     CLERK_SECRET_KEY="your-clerk-secret" \
     STRIPE_SECRET_KEY="your-stripe-secret" \
     --app atlaris-worker-regenerator-staging
   ```

3. Verify secrets:
   ```bash
   flyctl secrets list --app atlaris-worker-regenerator-staging
   ```

**Verification:**

- [ ] All required secrets set for staging plan regenerator
- [ ] Secrets match staging plan generator (same values)
- [ ] `flyctl secrets list` shows all secrets

**Expected Output:**

- Staging plan regeneration worker secrets configured

---

### Task 5.4: Set Secrets for Production Plan Generation Worker

**Objective:** Configure all secrets for `atlaris-worker-prod` app.

**Steps:**

1. Set DATABASE_URL secret (PRODUCTION database):

   ```bash
   flyctl secrets set \
     DATABASE_URL="your-neon-production-branch-connection-string" \
     --app atlaris-worker-prod
   ```

2. Set other required secrets:

   ```bash
   flyctl secrets set \
     NODE_ENV="production" \
     OPENAI_API_KEY="your-openai-api-key" \
     ENABLE_CURATION="false" \
     --app atlaris-worker-prod
   ```

3. (Optional) Set additional secrets:

   ```bash
   flyctl secrets set \
     GOOGLE_GENERATIVE_AI_API_KEY="your-google-ai-key" \
     CLERK_SECRET_KEY="your-clerk-secret" \
     STRIPE_SECRET_KEY="your-stripe-secret" \
     --app atlaris-worker-prod
   ```

4. Verify secrets:
   ```bash
   flyctl secrets list --app atlaris-worker-prod
   ```

**Verification:**

- [ ] All required secrets set for production plan generator
- [ ] DATABASE_URL points to PRODUCTION Neon branch
- [ ] All other secrets are production values
- [ ] `flyctl secrets list` shows all secrets

**Expected Output:**

- Production plan generation worker secrets configured

---

### Task 5.5: Set Secrets for Production Plan Regeneration Worker

**Objective:** Configure all secrets for `atlaris-worker-regenerator-prod` app.

**Steps:**

1. Set all secrets (same as Task 5.4, but for regenerator app):

   ```bash
   flyctl secrets set \
     DATABASE_URL="your-neon-production-branch-connection-string" \
     NODE_ENV="production" \
     OPENAI_API_KEY="your-openai-api-key" \
     ENABLE_CURATION="false" \
     --app atlaris-worker-regenerator-prod
   ```

2. (Optional) Set additional secrets:

   ```bash
   flyctl secrets set \
     GOOGLE_GENERATIVE_AI_API_KEY="your-google-ai-key" \
     CLERK_SECRET_KEY="your-clerk-secret" \
     STRIPE_SECRET_KEY="your-stripe-secret" \
     --app atlaris-worker-regenerator-prod
   ```

3. Verify secrets:
   ```bash
   flyctl secrets list --app atlaris-worker-regenerator-prod
   ```

**Verification:**

- [ ] All required secrets set for production plan regenerator
- [ ] DATABASE_URL points to PRODUCTION Neon branch
- [ ] Secrets match production plan generator
- [ ] `flyctl secrets list` shows all secrets

**Expected Output:**

- Production plan regeneration worker secrets configured

---

### Task 5.6: Verify Vercel Environment Variables

**Objective:** Ensure Vercel has all necessary environment variables for both staging and production.

**Steps:**

1. Navigate to Vercel dashboard → Your project → Settings → Environment Variables

2. Verify Preview (staging) environment has:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
   - `DATABASE_URL` (or equivalent Neon connection)
   - `NEXT_PUBLIC_NEON_URL` (if still using neon)
   - `STRIPE_SECRET_KEY`
   - `STRIPE_PUBLISHABLE_KEY`
   - `OPENAI_API_KEY`
   - Any other app-specific variables

3. Verify Production environment has:
   - All same variables as Preview
   - Values should be production-specific where applicable

4. Add/Update any missing variables:
   - Click "Add New"
   - Name: Variable name
   - Value: Variable value
   - Environments: Select "Preview" or "Production" or both
   - Click "Save"

**Verification:**

- [ ] All required env vars exist for Preview environment
- [ ] All required env vars exist for Production environment
- [ ] No errors or warnings in Vercel dashboard

**Expected Output:**

- Vercel environment variables verified and complete

---

### Task 5.7: Document Secrets Management Process

**Objective:** Create documentation for rotating and managing secrets.

**Steps:**

1. Create a secrets management document at `docs/secrets-management.md`:

```markdown
# Secrets Management

This document describes how to manage secrets across all environments.

## Environments

- **Staging:** Neon staging branch, Fly.io staging workers, Vercel preview
- **Production:** Neon production branch, Fly.io production workers, Vercel production

## Secret Locations

### GitHub Secrets (for CI/CD)

- `FLY_API_TOKEN` - Fly.io API token
- `VERCEL_TOKEN` - Vercel deployment token
- `DATABASE_URL_STAGING` - Neon staging connection string
- `DATABASE_URL_PROD` - Neon production connection string
- `SMOKE_TEST_API_KEY` - Test user API key

**Rotation:** Rotate every 90 days or immediately if compromised.

### Fly.io Secrets (for workers)

- `DATABASE_URL` - Neon connection string (staging or production)
- `OPENAI_API_KEY` - OpenAI API key
- `ENABLE_CURATION` - Feature flag for curation
- Optional: Clerk, Stripe, Google AI keys

**Rotation:** Use `flyctl secrets set` to update.

### Vercel Environment Variables (for Next.js)

- All public and secret keys for app functionality
- Managed via Vercel dashboard

**Rotation:** Update in Vercel dashboard → Settings → Environment Variables.

## Rotation Procedures

### Rotate Fly.io Token

1. Generate new token: `flyctl auth token`
2. Update GitHub secret: `FLY_API_TOKEN`
3. Test deployment workflow

### Rotate Database Connection String

1. Reset password in Neon dashboard if needed
2. Update GitHub secrets: `DATABASE_URL_STAGING`, `DATABASE_URL_PROD`
3. Update Fly.io secrets for all 4 worker apps
4. Verify workers can connect

### Rotate OpenAI API Key

1. Generate new key in OpenAI dashboard
2. Update Fly.io secrets for all 4 worker apps
3. Update Vercel env vars if Next.js uses it
4. Test plan generation

## Security Best Practices

- Never commit secrets to repository
- Use environment-specific secrets (don't share staging and production)
- Rotate tokens every 90 days minimum
- Use least-privilege access (read-only where possible)
- Audit secret access regularly
- Store backup copies in password manager
```

2. Save the file at `/Users/juansaldana/Projects/atlaris/docs/secrets-management.md`

3. Commit the documentation:
   ```bash
   git add docs/secrets-management.md
   git commit -m "docs: add secrets management guide"
   git push origin main
   ```

**Verification:**

- [ ] Secrets management document created
- [ ] Document covers all secret locations
- [ ] Rotation procedures documented
- [ ] File committed to repository

**Expected Output:**

- Secrets management documentation created

---

## Phase Completion Checklist

- [ ] Task 5.1: Required secrets identified and documented
- [ ] Task 5.2: Staging plan generator secrets set
- [ ] Task 5.3: Staging plan regenerator secrets set
- [ ] Task 5.4: Production plan generator secrets set
- [ ] Task 5.5: Production plan regenerator secrets set
- [ ] Task 5.6: Vercel environment variables verified
- [ ] Task 5.7: Secrets management documentation created

## Next Phase

Proceed to **Phase 6: Testing & Validation** to test the complete deployment pipeline end-to-end.

## Troubleshooting

**Issue:** `flyctl secrets set` fails with "app not found"

- **Solution:** Verify app name is correct with `flyctl apps list`; ensure you created the app in Phase 1

**Issue:** Worker crashes after setting secrets

- **Solution:** Check worker logs with `flyctl logs --app <app-name>` to see if secret values are invalid

**Issue:** Cannot set multiple secrets at once

- **Solution:** Fly.io sometimes requires secrets to be set individually; run separate commands for each secret

**Issue:** Database connection fails after setting DATABASE_URL

- **Solution:** Verify connection string includes `?sslmode=require` and credentials are correct

**Issue:** Worker can't find environment variable

- **Solution:** Ensure secret name matches exactly what worker code expects (case-sensitive)
