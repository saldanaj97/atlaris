# Phase 5: Secrets Configuration

## Overview

Configure all required secrets and environment variables in Fly.io worker applications so they can connect to databases, AI providers, and other services.

## Prerequisites

- Phase 2 completed (Fly.io apps created)
- Access to all application secrets (Google AI keys, Stripe keys, etc.)
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

- `DATABASE_URL` - Neon database connection string (required by `@/lib/db/service-role`)
- `NODE_ENV` - Should be "production" for production workers

**Required for Plan Generation (AI Providers):**

- `GOOGLE_GENERATIVE_AI_API_KEY` - **Required** - Primary AI provider (Google Gemini)
- `STRIPE_SECRET_KEY` - **Required** - Used by worker-service.ts for `markPlanGenerationFailure` and `markPlanGenerationSuccess` to track usage

**Optional AI Providers (for fallback/overflow):**

- `OPENROUTER_API_KEY` - Optional - Only needed if `AI_ENABLE_OPENROUTER=true`
- `CF_API_TOKEN` or `CF_API_KEY` - Optional - For Cloudflare Workers AI (fallback provider)
- `CF_ACCOUNT_ID` - Optional - For Cloudflare Workers AI
- `CF_AI_GATEWAY` - Optional - For Cloudflare AI Gateway URL

**Required for Curation (if enabled):**

- `ENABLE_CURATION` - Set to "true" or "false" (defaults to false in production, true in dev/test)
- `YOUTUBE_API_KEY` - **Required if curation enabled** - Used for YouTube resource curation

**Optional Curation Settings:**

- `GOOGLE_CSE_ID` - Optional - Google Custom Search Engine ID for document search
- `GOOGLE_CSE_KEY` - Optional - Google Custom Search Engine API key
- `MIN_RESOURCE_SCORE` - Optional - Minimum resource score threshold (default: 0.6)
- `CURATION_CONCURRENCY` - Optional - Concurrency limit for curation (default: 3)
- `CURATION_TIME_BUDGET_MS` - Optional - Time budget for curation in ms (default: 30000)
- `CURATION_MAX_RESULTS` - Optional - Maximum results per task (default: 3)

**Optional Worker Configuration:**

- `WORKER_POLL_INTERVAL_MS` - Optional - Poll interval in milliseconds (default: 2000)
- `WORKER_CONCURRENCY` - Optional - Number of concurrent jobs (default: 1)

**Optional AI Configuration:**

- `AI_PROVIDER` - Optional - Explicit provider selection (e.g., "mock", "google", "router")
- `AI_PRIMARY` - Optional - Primary model name (default: 'gemini-1.5-flash')
- `AI_FALLBACK` - Optional - Fallback model name (default: '@cf/meta/llama-3.1-8b-instruct')
- `AI_MAX_OUTPUT_TOKENS` - Optional - Maximum output tokens (default: 1200)
- `AI_ENABLE_OPENROUTER` - Optional - Enable OpenRouter provider (default: false)

**Optional Logging:**

- `LOG_LEVEL` - Optional - Logging level (e.g., "debug", "info", "warn", "error")

**Not Required (but mentioned in original task):**

- `OPENAI_API_KEY` - **Not used** - Codebase uses Google AI and Cloudflare/OpenRouter, not OpenAI
- `CLERK_SECRET_KEY` - **Not required** - Workers use service-role DB client and don't need Clerk authentication
- `NEON_SERVICE_ROLE_KEY` - **Not required** - Workers use `DATABASE_URL` directly with postgres-js

3. Document which secrets each environment needs:

**Staging Workers Need:**

- `DATABASE_URL` → Neon staging branch URL (must include `?sslmode=require`)
- `NODE_ENV` → "production"
- `GOOGLE_GENERATIVE_AI_API_KEY` → Staging/test Google AI key (or same as prod if using shared key)
- `STRIPE_SECRET_KEY` → Stripe test mode secret key
- `ENABLE_CURATION` → "false" (recommended for staging) or "true" if testing curation
- `YOUTUBE_API_KEY` → Required only if `ENABLE_CURATION="true"`
- Optional: `WORKER_POLL_INTERVAL_MS`, `WORKER_CONCURRENCY` for tuning

**Production Workers Need:**

- `DATABASE_URL` → Neon production branch URL (must include `?sslmode=require`)
- `NODE_ENV` → "production"
- `GOOGLE_GENERATIVE_AI_API_KEY` → Production Google AI key
- `STRIPE_SECRET_KEY` → Stripe production secret key
- `ENABLE_CURATION` → "true" or "false" (explicit setting required in production)
- `YOUTUBE_API_KEY` → Required only if `ENABLE_CURATION="true"`
- Optional: `WORKER_POLL_INTERVAL_MS`, `WORKER_CONCURRENCY` for tuning
- Optional: `OPENROUTER_API_KEY`, `CF_API_TOKEN`, etc. if using fallback providers

**Verification:**

- [x] All required secrets documented
- [x] Staging vs production secret values identified
- [x] Optional secrets decision made (include or skip)

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

3. Set Google AI API key (required):

   ```bash
   flyctl secrets set \
     GOOGLE_GENERATIVE_AI_API_KEY="your-google-ai-key" \
     --app atlaris-worker-staging
   ```

4. Set Stripe secret key (required):

   ```bash
   flyctl secrets set \
     STRIPE_SECRET_KEY="your-stripe-test-secret-key" \
     --app atlaris-worker-staging
   ```

5. Set curation flag:

   ```bash
   flyctl secrets set \
     ENABLE_CURATION="false" \
     --app atlaris-worker-staging
   ```

6. (Optional) Set YouTube API key if curation is enabled:

   ```bash
   flyctl secrets set \
     YOUTUBE_API_KEY="your-youtube-api-key" \
     --app atlaris-worker-staging
   ```

7. (Optional) Set other optional secrets as needed:

   ```bash
   flyctl secrets set \
     OPENROUTER_API_KEY="your-openrouter-key" \
     CF_API_TOKEN="your-cloudflare-token" \
     WORKER_POLL_INTERVAL_MS="2000" \
     WORKER_CONCURRENCY="1" \
     --app atlaris-worker-staging
   ```

8. Verify secrets were set:
   ```bash
   flyctl secrets list --app atlaris-worker-staging
   ```

**Verification:**

- [x] All required secrets set for staging plan generator
- [x] `flyctl secrets list` shows all secrets (values are hidden)
- [x] No errors during secret setting

**Expected Output:**

- Staging plan generation worker secrets configured

---

### Task 5.3: Set Secrets for Staging Plan Regeneration Worker

**Objective:** Configure all secrets for `atlaris-worker-regenerator-staging` app.

**Steps:**

1. Set all required secrets (same as Task 5.2, but for regenerator app):

   ```bash
   flyctl secrets set \
     DATABASE_URL="your-neon-staging-branch-connection-string" \
     NODE_ENV="production" \
     GOOGLE_GENERATIVE_AI_API_KEY="your-google-ai-key" \
     STRIPE_SECRET_KEY="your-stripe-test-secret-key" \
     ENABLE_CURATION="false" \
     --app atlaris-worker-regenerator-staging
   ```

2. (Optional) Set additional secrets if needed:

   ```bash
   flyctl secrets set \
     YOUTUBE_API_KEY="your-youtube-api-key" \
     OPENROUTER_API_KEY="your-openrouter-key" \
     CF_API_TOKEN="your-cloudflare-token" \
     WORKER_POLL_INTERVAL_MS="2000" \
     WORKER_CONCURRENCY="1" \
     --app atlaris-worker-regenerator-staging
   ```

3. Verify secrets:
   ```bash
   flyctl secrets list --app atlaris-worker-regenerator-staging
   ```

**Verification:**

- [x] All required secrets set for staging plan regenerator
- [x] Secrets match staging plan generator (same values)
- [x] `flyctl secrets list` shows all secrets

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
     GOOGLE_GENERATIVE_AI_API_KEY="your-google-ai-key" \
     STRIPE_SECRET_KEY="your-stripe-production-secret-key" \
     ENABLE_CURATION="false" \
     --app atlaris-worker-prod
   ```

3. (Optional) Set additional secrets if needed:

   ```bash
   flyctl secrets set \
     YOUTUBE_API_KEY="your-youtube-api-key" \
     OPENROUTER_API_KEY="your-openrouter-key" \
     CF_API_TOKEN="your-cloudflare-token" \
     WORKER_POLL_INTERVAL_MS="2000" \
     WORKER_CONCURRENCY="1" \
     --app atlaris-worker-prod
   ```

4. Verify secrets:
   ```bash
   flyctl secrets list --app atlaris-worker-prod
   ```

**Verification:**

- [x] All required secrets set for production plan generator
- [x] DATABASE_URL points to PRODUCTION Neon branch
- [x] All other secrets are production values
- [x] `flyctl secrets list` shows all secrets

**Expected Output:**

- Production plan generation worker secrets configured

---

### Task 5.5: Set Secrets for Production Plan Regeneration Worker

**Objective:** Configure all secrets for `atlaris-worker-regenerator-prod` app.

**Steps:**

1. Set all required secrets (same as Task 5.4, but for regenerator app):

   ```bash
   flyctl secrets set \
     DATABASE_URL="your-neon-production-branch-connection-string" \
     NODE_ENV="production" \
     GOOGLE_GENERATIVE_AI_API_KEY="your-google-ai-key" \
     STRIPE_SECRET_KEY="your-stripe-production-secret-key" \
     ENABLE_CURATION="false" \
     --app atlaris-worker-regenerator-prod
   ```

2. (Optional) Set additional secrets if needed:

   ```bash
   flyctl secrets set \
     YOUTUBE_API_KEY="your-youtube-api-key" \
     OPENROUTER_API_KEY="your-openrouter-key" \
     CF_API_TOKEN="your-cloudflare-token" \
     WORKER_POLL_INTERVAL_MS="2000" \
     WORKER_CONCURRENCY="1" \
     --app atlaris-worker-regenerator-prod
   ```

3. Verify secrets:
   ```bash
   flyctl secrets list --app atlaris-worker-regenerator-prod
   ```

**Verification:**

- [x] All required secrets set for production plan regenerator
- [x] DATABASE_URL points to PRODUCTION Neon branch
- [x] Secrets match production plan generator
- [x] `flyctl secrets list` shows all secrets

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
   - `STRIPE_SECRET_KEY` (test mode)
   - `STRIPE_PUBLISHABLE_KEY` (test mode)
   - `GOOGLE_GENERATIVE_AI_API_KEY`
   - `YOUTUBE_API_KEY` (if curation enabled)
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

- [x] All required env vars exist for Preview environment
- [x] All required env vars exist for Production environment
- [x] No errors or warnings in Vercel dashboard

**Expected Output:**

- Vercel environment variables verified and complete

---

### Task 5.7: Document Secrets Management Process

**Objective:** Create documentation for rotating and managing secrets.

**Steps:**

1. Create a secrets management document at `docs/secrets-management.md`:

````markdown
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

**Required:**

- `DATABASE_URL` - Neon connection string (staging or production)
- `NODE_ENV` - Set to "production"
- `GOOGLE_GENERATIVE_AI_API_KEY` - Google AI API key (primary provider)
- `STRIPE_SECRET_KEY` - Stripe secret key (test mode for staging, production for prod)
- `ENABLE_CURATION` - Feature flag for curation ("true" or "false")

**Optional:**

- `YOUTUBE_API_KEY` - Required if curation enabled
- `OPENROUTER_API_KEY` - For OpenRouter fallback provider
- `CF_API_TOKEN` / `CF_API_KEY` - For Cloudflare Workers AI fallback
- `WORKER_POLL_INTERVAL_MS` - Worker polling interval (default: 2000)
- `WORKER_CONCURRENCY` - Worker concurrency (default: 1)

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

### Rotate Google AI API Key

1. Generate new key in Google AI Studio dashboard
2. Update Fly.io secrets for all 4 worker apps:
   ```bash
   flyctl secrets set GOOGLE_GENERATIVE_AI_API_KEY="new-key" --app <app-name>
   ```
````

3. Update Vercel env vars if Next.js uses it
4. Test plan generation

### Rotate Stripe Secret Key

1. Generate new key in Stripe dashboard (test mode for staging, production for prod)
2. Update Fly.io secrets for all 4 worker apps:
   ```bash
   flyctl secrets set STRIPE_SECRET_KEY="new-key" --app <app-name>
   ```
3. Update Vercel env vars
4. Test plan generation and usage tracking

## Security Best Practices

- Never commit secrets to repository
- Use environment-specific secrets (don't share staging and production)
- Rotate tokens every 90 days minimum
- Use least-privilege access (read-only where possible)
- Audit secret access regularly
- Store backup copies in password manager

````

2. Save the file at `/Users/juansaldana/Projects/atlaris/docs/secrets-management.md`

3. Commit the documentation:
   ```bash
   git add docs/secrets-management.md
   git commit -m "docs: add secrets management guide"
   git push origin staging
````

**Verification:**

- [x] Secrets management document created
- [x] Document covers all secret locations
- [x] Rotation procedures documented
- [x] File committed to repository

**Expected Output:**

- Secrets management documentation created

---

## Phase Completion Checklist

- [x] Task 5.1: Required secrets identified and documented
- [x] Task 5.2: Staging plan generator secrets set
- [x] Task 5.3: Staging plan regenerator secrets set
- [x] Task 5.4: Production plan generator secrets set
- [x] Task 5.5: Production plan regenerator secrets set
- [x] Task 5.6: Vercel environment variables verified
- [x] Task 5.7: Secrets management documentation created

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
