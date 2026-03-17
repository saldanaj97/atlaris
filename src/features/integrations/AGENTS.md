# Integrations Module

**Parent:** [Root AGENTS.md](../../../AGENTS.md)

## Overview

Shared OAuth utilities and CSRF state management for third-party integrations.

## Structure

```
integrations/
├── oauth.ts          # Token encrypt/decrypt, store/retrieve/revoke
└── oauth-state.ts    # CSRF state token issue/consume (single-file module)
```

## OAuth Flow

1. **Initiate**: `/api/v1/auth/google` → redirect to Google
2. **Callback**: `/api/v1/auth/google/callback` → exchange code, store tokens

Tokens stored in `integration_tokens` table with `provider` enum.

## Environment

Credentials via `@/lib/config/env`:

- `googleOAuthEnv.clientId`, `.clientSecret`, `.redirectUri`
- `oauthEncryptionEnv.encryptionKey`

Prod-required, test-optional semantics.

## Anti-Patterns

- Hardcoding credentials (use `@/lib/config/env`)
