# Secrets Management

This document describes how to manage secrets across all environments.

## Environments

- **Staging:** Neon staging branch, Fly.io staging workers, Vercel preview
- **Production:** Neon production branch, Fly.io production workers, Vercel production

## Secret Locations

### GitHub Secrets (for CI/CD)

- `VERCEL_TOKEN` - Vercel deployment token
- `DATABASE_URL_STAGING` - Neon staging connection string
- `DATABASE_URL_PROD` - Neon production connection string
- `SMOKE_TEST_API_KEY` - Test user API key

**Rotation:** Rotate every 90 days or immediately if compromised.

### Vercel Environment Variables (for Next.js)

- All public and secret keys for app functionality
- Managed via Vercel dashboard

**Rotation:** Update in Vercel dashboard → Settings → Environment Variables.

## Rotation Procedures

### Rotate Database Connection String

1. Reset password in Neon dashboard if needed
2. Update GitHub secrets: `DATABASE_URL_STAGING`, `DATABASE_URL_PROD`
3. Update Fly.io secrets for all 4 worker apps
4. Verify workers can connect

### Rotate OpenRouter API Key

1. Generate new key in OpenRouter dashboard
2. Update Fly.io secrets for all 4 worker apps:
   ```bash
   flyctl secrets set OPENROUTER_API_KEY="new-key" --app <app-name>
   ```
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
