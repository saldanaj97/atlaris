# Integration Dependency Injection Architecture

## Overview

This document describes the current architecture for third-party integrations. The remaining integration surface is Google Calendar OAuth plus shared token storage, revocation, and sync-state persistence.

## Architecture Principles

### 1. Separation of Concerns

The integration architecture is split into four focused layers:

1. **Environment Configuration** (`src/lib/config/env.ts`)
   - Handles environment variable access with prod-required, test-optional semantics
   - Centralizes Google OAuth credentials and the shared OAuth encryption key

2. **Route Boundaries** (`src/app/api/v1/auth/google/*`, `src/app/api/v1/integrations/disconnect/route.ts`)
   - Own redirects, request validation, logging, and rate limiting
   - Keep provider-specific HTTP concerns at the edge of the system

3. **Shared OAuth Utilities** (`src/lib/integrations/oauth.ts`, `src/lib/integrations/oauth-state.ts`)
   - Encrypt, persist, retrieve, and revoke OAuth tokens
   - Manage CSRF-safe OAuth state tokens for initiation and callback flows

4. **Persistence Layer** (`src/lib/db/schema/tables/integrations.ts`)
   - Stores OAuth state tokens, integration tokens, Google Calendar sync state, and task calendar events
   - Enforces ownership with RLS policies on every user-facing table

### 2. Narrow Dependency Injection

The current integration surface does not need per-provider SDK abstractions. Instead, dependencies are injected at small seams where they improve testability.

```typescript
// src/lib/integrations/oauth.ts
export type IntegrationProvider = 'google_calendar';

export async function revokeGoogleTokens(
  accessToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  // Calls Google's revoke endpoint using the provided fetch implementation
}
```

This keeps the production path simple while still allowing unit tests to stub outbound requests without global mocks.

### 3. Factory Logic Lives at the Route Boundary

Client construction happens where it is actually needed today: the Google OAuth routes.

- `src/app/api/v1/auth/google/route.ts` reads `googleOAuthEnv`, creates the Google OAuth client, generates a state token, and redirects the user to Google.
- `src/app/api/v1/auth/google/callback/route.ts` validates the stored state token, exchanges the authorization code, and persists encrypted tokens through `storeOAuthTokens(...)`.
- `src/app/api/v1/integrations/disconnect/route.ts` validates the provider, revokes Google tokens, and deletes persisted credentials.

If a future integration introduces a heavy SDK surface, keep that SDK confined to the route or a dedicated factory module and pass only the smallest possible interface into shared logic.

### 4. Environment Variable Semantics

Environment variables use prod-required, test-optional semantics:

```typescript
// src/lib/config/env.ts
export const googleOAuthEnv = {
  get clientId() {
    return getServerRequiredProdOnly('GOOGLE_CLIENT_ID');
  },
  get clientSecret() {
    return getServerRequiredProdOnly('GOOGLE_CLIENT_SECRET');
  },
  get redirectUri() {
    return getServerRequiredProdOnly('GOOGLE_REDIRECT_URI');
  },
} as const;
```

This allows:

- Production: strict validation for OAuth credentials
- Development/Test: optional credentials, mocks, or test defaults

### 5. Centralized Test Environment

Test environment variables are centralized in `tests/setup/test-env.ts`:

```typescript
if (!process.env.GOOGLE_CLIENT_ID) {
  process.env.GOOGLE_CLIENT_ID = 'test_google_client_id';
}
if (!process.env.GOOGLE_CLIENT_SECRET) {
  process.env.GOOGLE_CLIENT_SECRET = 'test_google_client_secret';
}
if (!process.env.GOOGLE_REDIRECT_URI) {
  process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/oauth/callback';
}
```

This eliminates scattered env defaults across tests and keeps the integration setup aligned with the production entry points.

## Testing Strategy

### Unit Tests

Use narrow seams instead of global SDK mocking:

- `tests/unit/integrations/oauth.spec.ts` covers token encryption/decryption and persistence helpers.
- `tests/unit/integrations/oauth-revoke.spec.ts` injects a mock `fetch` into `revokeGoogleTokens(...)`.

### Integration Tests

Exercise the full request flow where it matters:

- `tests/integration/google-oauth.spec.ts` validates the Google OAuth initiation/callback flow.
- `tests/integration/oauth-storage.spec.ts` covers encrypted token persistence.
- `tests/integration/api/integrations-disconnect.spec.ts` verifies provider validation, revocation, and cleanup.

## Benefits

1. **Improved Testability**
   - External calls are stubbed at explicit function boundaries
   - OAuth flows can be tested without real Google credentials
   - Storage logic remains verifiable through integration tests

2. **Better Separation of Concerns**
   - Route handlers own HTTP behavior
   - Shared OAuth modules own token/state logic
   - Database tables own persistence and RLS guarantees

3. **Lower Maintenance Cost**
   - There is no dead provider-specific integration surface to maintain
   - Provider-specific changes stay localized to the Google OAuth routes/utilities
   - Future providers have a clear pattern to follow without reviving deleted paths

4. **Production Safety**
   - Strict env validation in production
   - Encrypted token storage by default
   - Stateful OAuth flows protected by database-backed CSRF tokens

## Migration Guide

When adding a new third-party integration:

1. Add the provider to `integrationProviderEnum` in `src/lib/db/enums.ts`.
2. Add any provider-specific credentials to `src/lib/config/env.ts`.
3. Create route handlers under `src/app/api/v1/auth/[provider]/` for initiation and callback if OAuth is required.
4. Reuse `src/lib/integrations/oauth.ts` and `src/lib/integrations/oauth-state.ts` when the provider fits the existing token model.
5. Add provider-specific sync state tables only when the integration needs durable sync bookkeeping.
6. Add unit tests for narrow dependency seams and integration tests for the full request flow.

## Related Files

- Environment config: `src/lib/config/env.ts`
- OAuth state helpers: `src/lib/integrations/oauth-state.ts`
- OAuth storage and revocation: `src/lib/integrations/oauth.ts`
- Google OAuth initiation: `src/app/api/v1/auth/google/route.ts`
- Google OAuth callback: `src/app/api/v1/auth/google/callback/route.ts`
- Integration disconnect route: `src/app/api/v1/integrations/disconnect/route.ts`
- Integration schema: `src/lib/db/schema/tables/integrations.ts`
- Test env defaults: `tests/setup/test-env.ts`
