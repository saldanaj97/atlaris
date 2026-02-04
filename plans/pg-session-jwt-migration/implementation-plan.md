# Plan: Migrate RLS Identity to Database-Validated JWT (pg_session_jwt)

**Issue:** #192  
**Created:** 2026-02-03  
**Status:** Planning Complete - Awaiting Implementation Approval

---

## Executive Summary

**Current State:** The application sets user identity via `set_config('request.jwt.claims', '{"sub": "<clerkUserId>"}', false)`, which the database trusts without cryptographic verification.

**Problem:** An attacker who achieves SQL injection or connection manipulation could forge identity by setting `request.jwt.claims` to impersonate another user.

**Goal:** Move to database-validated identity where Neon's `pg_session_jwt` extension validates the Clerk JWT cryptographically using JWKS, eliminating the ability to forge identity.

**Impact:** Defense-in-depth security improvement. The database becomes the authoritative validator of identity, not just the enforcer of access control.

---

## Current Architecture Analysis

### Identity Flow (Current)

```
┌─────────────────────────────────────────────────────────────────┐
│                   CURRENT (App-Managed Identity)                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Request with Clerk session                                   │
│     ┌────────────────┐                                           │
│     │ API Handler    │                                           │
│     │ auth() returns │                                           │
│     │ Clerk user ID  │                                           │
│     └────────┬───────┘                                           │
│              │                                                   │
│  2. App extracts Clerk user ID, sets session variable            │
│     ┌────────▼───────────────────────────────────────┐          │
│     │ createAuthenticatedRlsClient(clerkUserId)      │          │
│     │  - Connect with owner role (BYPASSRLS)         │          │
│     │  - SET ROLE authenticated                      │          │
│     │  - set_config('request.jwt.claims',            │          │
│     │      '{"sub": "user_123"}', false)             │          │
│     └────────┬───────────────────────────────────────┘          │
│              │                                                   │
│  3. Database trusts app-provided identity                        │
│     ┌────────▼───────────────────────────────────────┐          │
│     │ RLS Policies                                   │          │
│     │  current_setting('request.jwt.claims', true)   │          │
│     │    ::json->>'sub' = user_id                    │          │
│     │                                                 │          │
│     │  NO CRYPTOGRAPHIC VERIFICATION                 │          │
│     └────────────────────────────────────────────────┘          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Vulnerability:** If an attacker can execute arbitrary SQL (injection, compromised connection, etc.), they can:

```sql
-- Impersonate any user
SELECT set_config('request.jwt.claims', '{"sub": "victim_user_id"}', false);

-- Now all queries appear to come from victim_user_id
SELECT * FROM learning_plans; -- Returns victim's private plans
```

### Files Involved

| File                                  | Current Responsibility                                    |
| ------------------------------------- | --------------------------------------------------------- |
| `src/lib/db/rls.ts`                   | Sets `request.jwt.claims` via `set_config()`              |
| `src/lib/db/schema/tables/common.ts`  | Defines `clerkSub = current_setting(...)`                 |
| `src/lib/db/schema/tables/*.ts`       | RLS policies use `clerkSub` for ownership checks          |
| `tests/helpers/rls.ts`                | Test helpers that create RLS clients with fake identities |
| `tests/security/rls.policies.spec.ts` | Tests verify policies work (but not identity validation)  |

---

## Option Analysis

### Option 1: pg_session_jwt Extension (Direct Postgres) ⭐ **RECOMMENDED**

#### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│              PROPOSED (Database-Validated Identity)              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Request with Clerk JWT                                       │
│     ┌────────────────┐                                           │
│     │ API Handler    │                                           │
│     │ getToken()     │                                           │
│     │ returns JWT    │                                           │
│     └────────┬───────┘                                           │
│              │                                                   │
│  2. App passes raw JWT to database                               │
│     ┌────────▼───────────────────────────────────────┐          │
│     │ createAuthenticatedRlsClient(jwt)              │          │
│     │  - Connect with owner role (BYPASSRLS)         │          │
│     │  - SET ROLE authenticated                      │          │
│     │  - SELECT auth.jwt_session_init(jwt)           │          │
│     │    ├─> Fetches Clerk JWKS from cache/URL       │          │
│     │    ├─> Verifies JWT signature                  │          │
│     │    ├─> Validates exp, aud, iss claims          │          │
│     │    └─> Extracts and stores claims in session   │          │
│     └────────┬───────────────────────────────────────┘          │
│              │                                                   │
│  3. Database provides validated identity                         │
│     ┌────────▼───────────────────────────────────────┐          │
│     │ RLS Policies                                   │          │
│     │  auth.user_id() = user_id                      │          │
│     │                                                 │          │
│     │  CRYPTOGRAPHICALLY VERIFIED                    │          │
│     │  Cannot be forged without valid JWT            │          │
│     └────────────────────────────────────────────────┘          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### How It Works

1. **Extension Setup** (one-time):

   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_session_jwt;

   -- Configure Clerk JWKS (JWT signing keys)
   SELECT auth.configure(
     jsonb_build_object(
       'jwks', jsonb_build_object(
         'url', 'https://clerk.YOUR_DOMAIN.com/.well-known/jwks.json',
         'cache_duration_seconds', 3600
       )
     )
   );
   ```

2. **Per-Request Flow**:

   ```typescript
   // Get JWT from Clerk session
   const jwt = await clerkClient.sessions.getToken();

   // Initialize database session with validated JWT
   await sql`SELECT auth.jwt_session_init(${jwt})`;
   await sql`SET ROLE authenticated`;

   // Now auth.user_id() returns the validated 'sub' claim
   ```

3. **Policy Updates**:

   ```typescript
   // Before: Trust app-provided claims
   export const clerkSub = sql`current_setting('request.jwt.claims', true)::json->>'sub'`;

   // After: Use database-validated identity
   export const clerkSub = sql`auth.user_id()`;
   ```

#### Pros

✅ **Defense in depth**: Database cryptographically validates JWT independently of app  
✅ **Minimal runtime changes**: Keep using `postgres` driver (no Neon Data API migration)  
✅ **Future-proof**: Access to all JWT claims via `auth.session()` if needed  
✅ **Standard Postgres**: Works with standard Postgres connections  
✅ **Clear security boundary**: Database is authoritative on identity  
✅ **Automatic key rotation**: JWKS URL fetches latest Clerk signing keys

#### Cons

⚠️ **Additional SQL calls per request**: `auth.jwt_session_init(jwt)` adds latency  
⚠️ **External dependency**: Database must reach Clerk JWKS endpoint (mitigated by caching)  
⚠️ **Extension compatibility**: Requires Neon support for `pg_session_jwt`  
⚠️ **JWT availability**: Must obtain raw JWT from Clerk (not just user ID)

#### Decision Factors

| Factor                     | Assessment                                             |
| -------------------------- | ------------------------------------------------------ |
| **Security**               | ✅ Strongest - DB validates cryptographically          |
| **Vendor Lock-in**         | ✅ Standard Postgres extension, portable               |
| **Migration Effort**       | ✅ Moderate - focused changes to RLS client + policies |
| **Runtime Performance**    | ⚠️ Small overhead (JWT validation + JWKS cache)        |
| **Operational Complexity** | ⚠️ Requires JWKS endpoint reachability                 |

---

### Option 2: Neon Data API with Automatic JWT Injection

#### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Neon Data API Approach                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Switch from postgres driver to @neon/serverless              │
│  2. Pass JWT in Authorization header to Neon Data API           │
│  3. Neon validates JWT server-side and injects identity          │
│  4. Database sees pre-validated claims via Neon internals        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Pros

✅ **Neon-managed validation**: JWT validation handled entirely by Neon  
✅ **Potential performance**: HTTP/2 connection multiplexing

#### Cons

❌ **Major runtime change**: Replace entire DB driver (`postgres` → `@neon/serverless`)  
❌ **Drizzle compatibility unknown**: Need to verify full Drizzle ORM support  
❌ **Strong vendor lock-in**: Cannot easily migrate to self-hosted Postgres  
❌ **Different operational characteristics**: HTTP API vs direct Postgres protocol  
❌ **Migration risk**: High - affects all database interactions  
❌ **Testing complexity**: Different driver behavior in tests vs production

#### Decision Factors

| Factor                     | Assessment                                 |
| -------------------------- | ------------------------------------------ |
| **Security**               | ✅ Strong - Neon validates                 |
| **Vendor Lock-in**         | ❌ Very high - locked to Neon Data API     |
| **Migration Effort**       | ❌ High - replace entire DB layer          |
| **Runtime Performance**    | ❓ Unknown - different performance profile |
| **Operational Complexity** | ⚠️ New monitoring/debugging surface        |

---

### Option 3: App-Side JWT Validation (Current + Clerk SDK)

#### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  App-Side Validation Approach                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. App validates JWT using Clerk SDK or @clerk/backend/jwt     │
│  2. Extract 'sub' claim only after successful validation        │
│  3. Set request.jwt.claims only with validated identity         │
│  4. Database continues using current_setting() mechanism         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Pros

✅ **Minimal DB changes**: Keep existing policy structure  
✅ **Use existing Clerk SDK**: Already validated and tested  
✅ **No new dependencies**: No database extension required

#### Cons

❌ **No defense in depth**: Database still trusts app-provided claims  
❌ **Same attack surface**: SQL injection can still forge identity  
❌ **Not aligned with issue goals**: Issue specifically requests "DB-validated identity"  
❌ **Security theater**: Validates JWT but doesn't address core threat model

#### Decision Factors

| Factor                     | Assessment                          |
| -------------------------- | ----------------------------------- |
| **Security**               | ❌ Weak - database still trusts app |
| **Vendor Lock-in**         | ✅ None                             |
| **Migration Effort**       | ✅ Minimal                          |
| **Runtime Performance**    | ✅ No change                        |
| **Operational Complexity** | ✅ No change                        |

---

## Recommended Approach: Option 1 (pg_session_jwt)

### Rationale

**Option 1 is the safest, most robust, and easiest to maintain choice because:**

1. **Defense in Depth**: Even if the application has a SQL injection vulnerability, attackers cannot forge identity without a valid Clerk JWT signed by Clerk's private keys.

2. **Aligned with Security Goals**: The issue explicitly states "move to DB-validated identity" and "remove reliance on `request.jwt.claims` being set by app code." Option 1 is the only approach that truly achieves this.

3. **Minimal Runtime Changes**: We keep using the `postgres` driver and standard Postgres connections. No major architectural shifts.

4. **Future-Proof**: The `pg_session_jwt` extension provides access to all JWT claims via `auth.session()`, not just `sub`. This allows future expansion (e.g., validating roles, permissions) without another migration.

5. **Standard Postgres**: The extension works with standard Postgres connections, making it portable if we ever migrate away from Neon.

6. **Low Migration Risk**: Changes are focused to three areas:
   - RLS client initialization (`src/lib/db/rls.ts`)
   - Identity helper (`src/lib/db/schema/tables/common.ts`)
   - Test helpers (`tests/helpers/rls.ts`)

**Option 2 is rejected because:**

- High vendor lock-in to Neon Data API
- Major migration effort with unknown compatibility issues
- Doesn't align with our preference for standard Postgres patterns

**Option 3 is rejected because:**

- Doesn't achieve defense in depth (database still trusts app)
- Not what the issue is asking for
- Solves the wrong problem (validating JWT in app vs database)

---

## Critical Decision: Feasibility Spike First

**BEFORE implementing, we MUST verify:**

1. **Does `pg_session_jwt` work with standard Postgres connections?**
   - Neon docs: https://neon.com/docs/extensions/pg_session_jwt
   - Test in staging with direct connection (not Data API)

2. **How to configure Clerk JWKS?**
   - JWKS URL format: `https://clerk.YOUR_DOMAIN.com/.well-known/jwks.json`
   - Cache duration settings
   - Fallback if JWKS endpoint unreachable

3. **What SQL calls are needed per request?**
   - `SELECT auth.jwt_session_init(<jwt>)` - validates and initializes
   - Does this work before or after `SET ROLE`?
   - How are errors surfaced (invalid JWT, expired, etc.)?

4. **How to obtain raw JWT from Clerk session?**
   - Test: `await clerkClient.sessions.getToken(sessionId)`
   - Or: `auth().getToken()` in App Router
   - Verify JWT format matches `pg_session_jwt` expectations

**Output:** ADR (Architecture Decision Record) documenting:

- Test results for each question above
- Performance impact measurement (latency added)
- Error handling scenarios (invalid JWT, JWKS unreachable, etc.)
- Confirmation of "go" or "pivot to Option 2/3"

---

## Coordination with Issue #191

### Relationship Analysis

| Issue | Scope                                                               | Files Modified                                            |
| ----- | ------------------------------------------------------------------- | --------------------------------------------------------- |
| #191  | Add `to: 'authenticated'/'anonymous'` to policy definitions         | `src/lib/db/schema/tables/*.ts` (policies)                |
| #192  | Change identity source from `current_setting()` to `auth.user_id()` | `src/lib/db/schema/tables/common.ts`, `src/lib/db/rls.ts` |

**Good news:** These issues are **complementary and non-conflicting**.

- **#191** modifies the `to` field in `pgPolicy()` calls
- **#192** modifies the `clerkSub` helper function and RLS client initialization

**They touch different parts of the schema files:**

- #191: `pgPolicy(..., { to: 'authenticated', ... })`
- #192: `export const clerkSub = sql\`auth.user_id()\``

### Safe Sequencing

**Option A: Sequential (Recommended)**

1. Complete #191 first (as currently planned)
2. Merge #191 to `develop`
3. Start #192 work from latest `develop`
4. Merge #192 to `develop`

**Benefits:**

- Clean migration history
- Each issue has isolated migration
- Easier to revert if needed
- No merge conflict risk

**Option B: Parallel (Acceptable if Careful)**

1. #191 continues on `feature/rls-role-scoping`
2. #192 starts on `feature/pg-session-jwt-migration` branched from latest `develop`
3. When #191 is done, merge to `develop`
4. Rebase #192 branch on `develop` (may have schema file conflicts)
5. Resolve conflicts (should be minimal - different lines)
6. Merge #192 to `develop`

**Risks:**

- Schema file merge conflicts (manageable)
- Two migrations generated - must apply in order

**Recommendation:** **Sequential (Option A)** to minimize risk and complexity.

---

## Implementation Plan

### Phase 0: Feasibility Spike ⚠️ CRITICAL - DO THIS FIRST

**Goal:** Verify `pg_session_jwt` works as expected with our stack.

#### Step 0.1: Research pg_session_jwt

**Tasks:**

- [ ] Read Neon docs: https://neon.com/docs/extensions/pg_session_jwt
- [ ] Confirm compatibility with direct Postgres connections (not just Data API)
- [ ] Identify required SQL initialization calls
- [ ] Check Clerk JWKS URL format

**Expected Output:** Notes document with:

- Extension installation command
- JWKS configuration SQL
- Per-request initialization SQL pattern
- Any limitations or gotchas

#### Step 0.2: Enable Extension in Staging

```sql
-- Run in staging database
CREATE EXTENSION IF NOT EXISTS pg_session_jwt;

-- Verify installation
SELECT * FROM pg_available_extensions WHERE name = 'pg_session_jwt';
```

**Verify:**

- [ ] Extension installed without errors
- [ ] `auth` schema created
- [ ] Functions available: `auth.jwt_session_init()`, `auth.user_id()`, `auth.session()`

#### Step 0.3: Configure Clerk JWKS

**Get Clerk JWKS URL:**

```bash
# From Clerk dashboard or via discovery endpoint
curl https://YOUR_CLERK_DOMAIN.clerk.accounts.dev/.well-known/openid-configuration
# Look for "jwks_uri" field
```

**Configure in database:**

```sql
SELECT auth.configure(
  jsonb_build_object(
    'jwks', jsonb_build_object(
      'url', 'https://YOUR_CLERK_DOMAIN.clerk.accounts.dev/.well-known/jwks.json',
      'cache_duration_seconds', 3600
    )
  )
);

-- Verify configuration
SELECT auth.get_configuration();
```

**Verify:**

- [ ] Configuration accepted without errors
- [ ] JWKS URL is reachable from database (test with `SELECT auth.fetch_jwks()`)

#### Step 0.4: Test JWT Validation Manually

**Obtain a real Clerk JWT:**

```typescript
// In a test API route or script
import { clerkClient } from '@clerk/nextjs/server';

const user = await clerkClient.users.getUser('user_xxx');
const sessions = await clerkClient.users.getUserSessions('user_xxx');
const jwt = await clerkClient.sessions.getToken(sessions[0].id);

console.log('JWT:', jwt);
```

**Test in database:**

```sql
-- Connect to staging database
BEGIN;

SET ROLE authenticated;

-- Initialize session with JWT
SELECT auth.jwt_session_init('eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...');

-- Verify identity extraction
SELECT auth.user_id(); -- Should return Clerk user ID from 'sub' claim
SELECT auth.session(); -- Should return full validated claims as JSON

ROLLBACK;
```

**Verify:**

- [ ] `auth.jwt_session_init()` succeeds with valid JWT
- [ ] `auth.user_id()` returns correct Clerk user ID
- [ ] `auth.session()` returns expected claims
- [ ] Invalid JWT is rejected with clear error
- [ ] Expired JWT is rejected

#### Step 0.5: Test Error Scenarios

**Test cases:**

1. **Invalid JWT signature:**

   ```sql
   SELECT auth.jwt_session_init('eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature');
   -- Expected: Error with message about invalid signature
   ```

2. **Expired JWT:**

   ```sql
   -- Use a JWT with exp claim in the past
   SELECT auth.jwt_session_init('<expired_jwt>');
   -- Expected: Error about expired token
   ```

3. **JWKS unreachable (simulate by misconfiguring URL):**

   ```sql
   SELECT auth.configure(
     jsonb_build_object(
       'jwks', jsonb_build_object('url', 'https://invalid.example.com/jwks.json')
     )
   );

   SELECT auth.jwt_session_init('<valid_jwt>');
   -- Expected: Error about JWKS fetch failure
   ```

**Document:**

- Error messages for each scenario
- HTTP status codes if relevant
- How to surface these errors to users

#### Step 0.6: Measure Performance Impact

**Benchmark:**

```typescript
// Measure latency of auth.jwt_session_init()
const iterations = 100;
const timings = [];

for (let i = 0; i < iterations; i++) {
  const start = performance.now();
  await sql`SELECT auth.jwt_session_init(${jwt})`;
  const end = performance.now();
  timings.push(end - start);
}

const avg = timings.reduce((a, b) => a + b) / timings.length;
console.log(`Average JWT validation time: ${avg.toFixed(2)}ms`);
```

**Acceptance Criteria:**

- JWT validation adds < 50ms average latency (with JWKS cached)
- First request (JWKS fetch) may be slower (< 500ms acceptable)

#### Step 0.7: Write ADR (Architecture Decision Record)

**Create:** `plans/pg-session-jwt-migration/adr-001-feasibility-results.md`

**Contents:**

```markdown
# ADR 001: pg_session_jwt Feasibility Results

## Date

YYYY-MM-DD

## Status

[Accepted | Rejected | Needs Discussion]

## Context

Tested Neon's pg_session_jwt extension for database-validated JWT authentication.

## Test Results

### Extension Installation

- ✅/❌ Extension available in Neon
- ✅/❌ Works with direct Postgres connections

### JWKS Configuration

- Clerk JWKS URL: [URL]
- Cache duration: 3600s
- ✅/❌ JWKS reachable from database

### JWT Validation

- ✅/❌ Valid JWT accepted
- ✅/❌ auth.user_id() returns correct value
- ✅/❌ Invalid JWT rejected with clear error

### Error Handling

- Invalid signature: [error message]
- Expired JWT: [error message]
- JWKS unreachable: [error message]

### Performance

- Average validation latency: X ms
- First request (JWKS fetch): Y ms

## Decision

[Proceed with Option 1 | Pivot to Option 2 | Pivot to Option 3]

## Rationale

[Why we made this decision based on test results]

## Next Steps

[If proceeding: Phase 1. If pivoting: Alternative plan]
```

**CRITICAL:** Do not proceed to Phase 1 until ADR is written and decision is "Proceed with Option 1".

---

### Phase 1: Extension Setup (Production)

**Prerequisite:** Phase 0 ADR shows "Proceed with Option 1"

#### Step 1.1: Enable Extension in Production

**Migration file:** `0XXX_enable_pg_session_jwt.sql`

```sql
-- Enable pg_session_jwt extension
CREATE EXTENSION IF NOT EXISTS pg_session_jwt;

-- Configure Clerk JWKS
SELECT auth.configure(
  jsonb_build_object(
    'jwks', jsonb_build_object(
      'url', 'https://YOUR_CLERK_DOMAIN.clerk.accounts.dev/.well-known/jwks.json',
      'cache_duration_seconds', 3600
    )
  )
);
```

**Apply migration:**

```bash
# Staging first
pnpm db:migrate

# Verify
psql $DATABASE_URL -c "SELECT * FROM pg_available_extensions WHERE name = 'pg_session_jwt';"
psql $DATABASE_URL -c "SELECT auth.get_configuration();"

# Then production (after testing)
```

#### Step 1.2: Add Environment Variables (if needed)

If Clerk JWKS URL varies by environment:

```bash
# .env.local / .env.staging / .env.production
CLERK_JWKS_URL=https://YOUR_DOMAIN.clerk.accounts.dev/.well-known/jwks.json
```

**Update:** `src/lib/config/env.ts`

```typescript
export const authEnv = {
  get jwksUrl() {
    return getServerRequired('CLERK_JWKS_URL');
  },
} as const;
```

---

### Phase 2: RLS Client Migration

**Files Modified:**

- `src/lib/db/rls.ts` (main changes)
- `src/lib/api/auth.ts` (if needed for JWT extraction)

#### Step 2.1: Add JWT Extraction Utility

**File:** `src/lib/api/auth.ts` (or create if doesn't exist)

```typescript
import { auth } from '@clerk/nextjs/server';

/**
 * Extracts the raw Clerk JWT from the current session.
 * Required for database-validated RLS via pg_session_jwt.
 *
 * @returns Promise resolving to JWT string
 * @throws Error if no session or JWT unavailable
 */
export async function getClerkJwt(): Promise<string> {
  const { getToken } = await auth();

  // Get JWT for the current session
  const jwt = await getToken();

  if (!jwt) {
    throw new Error('No Clerk JWT available in session');
  }

  return jwt;
}

/**
 * Extracts Clerk user ID from session (for backwards compatibility).
 * Use getClerkJwt() for new RLS client.
 */
export async function getEffectiveClerkUserId(): Promise<string> {
  const { userId } = await auth();

  if (!userId) {
    throw new Error('User not authenticated');
  }

  return userId;
}
```

#### Step 2.2: Update RLS Client for Authenticated Users

**File:** `src/lib/db/rls.ts`

**Current code:**

```typescript
export async function createAuthenticatedRlsClient(
  clerkUserId: string
): Promise<RlsClientResult> {
  const jwtClaims = JSON.stringify({ sub: clerkUserId });

  const sql: Sql = postgres(connectionUrl, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  await sql.unsafe('SET ROLE authenticated');
  await sql.unsafe('SET search_path = public');
  await sql`SELECT set_config('request.jwt.claims', ${jwtClaims}, false)`;

  // ... rest
}
```

**New code:**

````typescript
/**
 * Creates an RLS-enforced database client for authenticated users.
 *
 * Uses pg_session_jwt extension to validate Clerk JWT cryptographically
 * at the database layer. The database verifies the JWT signature using
 * Clerk's JWKS and extracts the identity, preventing identity forgery.
 *
 * @param clerkJwt - The raw Clerk JWT token from the session
 * @returns Promise resolving to RLS client result with database client and cleanup function
 *
 * @example
 * ```typescript
 * import { getClerkJwt } from '@/lib/api/auth';
 *
 * const jwt = await getClerkJwt();
 * const { db: rlsDb, cleanup } = await createAuthenticatedRlsClient(jwt);
 * try {
 *   const plans = await rlsDb.select().from(learningPlans);
 * } finally {
 *   await cleanup();
 * }
 * ```
 */
export async function createAuthenticatedRlsClient(
  clerkJwt: string
): Promise<RlsClientResult> {
  const connectionUrl = databaseEnv.nonPoolingUrl || databaseEnv.url;
  const sql: Sql = postgres(connectionUrl, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  try {
    // Switch to authenticated role (without BYPASSRLS privilege)
    await sql.unsafe('SET ROLE authenticated');

    // Set search_path after SET ROLE (role switch may reset it)
    await sql.unsafe('SET search_path = public');

    // Initialize session with cryptographically validated JWT
    // This validates the JWT signature using Clerk JWKS, checks expiry,
    // and extracts claims into the session. The database is now the
    // authoritative validator of identity.
    await sql`SELECT auth.jwt_session_init(${clerkJwt})`;

    // After jwt_session_init, auth.user_id() returns the validated 'sub' claim
    // RLS policies can now safely use auth.user_id() knowing the database
    // verified the identity cryptographically.

    let isCleanedUp = false;

    const cleanup = async () => {
      if (isCleanedUp) return;
      isCleanedUp = true;

      try {
        await sql.end({ timeout: 5 });
      } catch (error) {
        logger.warn(
          { error, clerkJwtPrefix: clerkJwt.substring(0, 20) },
          'Failed to close RLS database connection'
        );
      }
    };

    return {
      db: drizzle(sql, { schema }),
      cleanup,
    };
  } catch (error) {
    // If JWT validation fails, close connection immediately
    await sql.end({ timeout: 5 });

    // Re-throw with context
    logger.error({ error }, 'Failed to initialize RLS client with JWT');
    throw new Error(
      `RLS client initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
````

**Error Handling Considerations:**

Add typed error handling for JWT validation failures:

```typescript
/**
 * Error thrown when JWT validation fails at database layer.
 */
export class JwtValidationError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'JwtValidationError';
  }
}

// In createAuthenticatedRlsClient:
try {
  await sql`SELECT auth.jwt_session_init(${clerkJwt})`;
} catch (error) {
  await sql.end({ timeout: 5 });

  // Check if error is JWT-specific
  const errorMessage = error instanceof Error ? error.message : String(error);

  if (errorMessage.includes('expired') || errorMessage.includes('signature')) {
    throw new JwtValidationError(
      'JWT validation failed at database layer',
      error
    );
  }

  throw error;
}
```

#### Step 2.3: Update Runtime Selector

**File:** `src/lib/db/runtime.ts`

**Current signature:**

```typescript
export function getDb(): DbClient {
  const clerkUserId = getEffectiveClerkUserId();
  const { db } = await createAuthenticatedRlsClient(clerkUserId);
  return db;
}
```

**New signature:**

```typescript
import { getClerkJwt } from '@/lib/api/auth';

/**
 * Returns an RLS-enforced database client for the current request context.
 *
 * Uses database-validated JWT authentication via pg_session_jwt.
 * The database cryptographically verifies the Clerk JWT, preventing
 * identity forgery even in the presence of SQL injection.
 */
export async function getDb(): Promise<DbClient> {
  const jwt = await getClerkJwt();
  const { db } = await createAuthenticatedRlsClient(jwt);
  return db;
}
```

**Note:** This changes `getDb()` from synchronous to async. All call sites must be updated to `await getDb()`.

**Alternative (if sync is required):** Keep the current pattern but document that it's a planned migration.

#### Step 2.4: Update Anonymous Client (No Changes Required)

Anonymous users don't have a JWT, so they continue using the current pattern:

```typescript
export async function createAnonymousRlsClient(): Promise<RlsClientResult> {
  // ... existing implementation unchanged ...

  // Anonymous users still use set_config with null
  await sql`SELECT set_config('request.jwt.claims', ${'null'}, false)`;

  // ... rest ...
}
```

**Rationale:** Anonymous access doesn't need JWT validation because there's no identity to validate. RLS policies for anonymous are scoped to `to: 'anonymous'` role and check `visibility = 'public'` without identity claims.

---

### Phase 3: Policy Migration

**Files Modified:**

- `src/lib/db/schema/tables/common.ts` (identity helper)
- All policy files (automatic via helper change)

#### Step 3.1: Update Identity Helper

**File:** `src/lib/db/schema/tables/common.ts`

**Current code:**

```typescript
// Clerk JWT subject helper (Clerk user ID)
// Uses PostgreSQL session variable instead of neon-specific auth.jwt()
// The JWT claims must be set when establishing the RLS-enforced connection
// via the createRlsClient() function in @/lib/db/rls
export const clerkSub = sql`current_setting('request.jwt.claims', true)::json->>'sub'`;
```

**New code:**

```typescript
/**
 * Clerk user ID extracted from database-validated JWT.
 *
 * Uses pg_session_jwt extension's auth.user_id() function which returns
 * the 'sub' claim from a cryptographically validated JWT. The database
 * verifies the JWT signature using Clerk's JWKS, preventing identity forgery.
 *
 * SECURITY: This value is trusted because the database validated the JWT
 * signature. An attacker cannot forge this value without a valid JWT signed
 * by Clerk's private keys.
 *
 * COMPATIBILITY: For anonymous users, auth.user_id() returns NULL, which is
 * the expected behavior for policies checking ownership.
 *
 * @see src/lib/db/rls.ts - createAuthenticatedRlsClient() calls auth.jwt_session_init()
 * @see https://neon.com/docs/extensions/pg_session_jwt
 */
export const clerkSub = sql`auth.user_id()`;
```

**Impact:** All RLS policies that use `clerkSub` (via `recordOwnedByCurrentUser()` and `planOwnedByCurrentUser()`) now automatically use database-validated identity.

#### Step 3.2: Verify Policy Helpers

**File:** `src/lib/db/schema/policy-helpers.ts` (if it exists, otherwise inline in policy files)

**Current usage:**

```typescript
export const recordOwnedByCurrentUser = (userIdColumn: AnyPgColumn) =>
  sql`${userIdColumn} = ${clerkSub}`;

export const planOwnedByCurrentUser = (planTable: typeof learningPlans) =>
  sql`EXISTS (
    SELECT 1 FROM ${learningPlans}
    WHERE ${learningPlans.id} = ${planTable.id}
      AND ${recordOwnedByCurrentUser(learningPlans.userId)}
  )`;
```

**Verification:** No changes needed - helpers continue to work with new `clerkSub` definition.

#### Step 3.3: Generate Migration

```bash
pnpm db:generate
```

**Expected migration:** None (or empty) - the change is runtime-only. `auth.user_id()` is a SQL function call, not a schema change.

**If migration is generated:** Review carefully. We don't expect schema DDL changes, only runtime behavior changes.

#### Step 3.4: Test Policy Behavior

**Manual verification:**

```sql
-- Test authenticated user can access their own data
BEGIN;

SET ROLE authenticated;
SELECT auth.jwt_session_init('<valid_jwt_for_user_123>');

-- Should return only user_123's plans
SELECT id, user_id FROM learning_plans;

ROLLBACK;
```

```sql
-- Test authenticated user cannot access other users' data
BEGIN;

SET ROLE authenticated;
SELECT auth.jwt_session_init('<valid_jwt_for_user_123>');

-- Should return empty (user_456's plans not visible)
SELECT id, user_id FROM learning_plans WHERE user_id = 'user_456';

ROLLBACK;
```

```sql
-- Test anonymous user can only read public plans
BEGIN;

SET ROLE anonymous;
-- No JWT for anonymous users

-- Should return only public plans
SELECT id, visibility FROM learning_plans;

ROLLBACK;
```

---

### Phase 4: Testing

**Files Modified:**

- `tests/helpers/rls.ts` (test utilities)
- `tests/security/rls.policies.spec.ts` (add negative tests)
- All integration/e2e tests using RLS (call site updates)

#### Step 4.1: Update Test Helpers

**File:** `tests/helpers/rls.ts`

**Current code:**

```typescript
export async function createRlsDbForUser(clerkUserId: string) {
  const result = await createAuthenticatedRlsClient(clerkUserId);
  return result.db;
}
```

**Challenge:** Tests don't have real Clerk JWTs. We need to either:

1. Generate fake JWTs that pass signature validation (requires test JWKS)
2. Keep test environment using old `set_config` mechanism
3. Use a test-only bypass

**Recommended Approach: Test-Only Configuration**

**Option A: Dual-Mode RLS Client (Test vs Production)**

```typescript
// src/lib/db/rls.ts

/**
 * Creates RLS client with different validation strategies based on environment.
 *
 * Production: Uses pg_session_jwt for cryptographic validation
 * Test: Uses legacy set_config for easier test data setup
 */
export async function createAuthenticatedRlsClient(
  clerkJwtOrUserId: string
): Promise<RlsClientResult> {
  const connectionUrl = databaseEnv.nonPoolingUrl || databaseEnv.url;
  const sql: Sql = postgres(connectionUrl, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  try {
    await sql.unsafe('SET ROLE authenticated');
    await sql.unsafe('SET search_path = public');

    // In test environment, allow passing user ID directly for easier testing
    if (
      process.env.NODE_ENV === 'test' &&
      !clerkJwtOrUserId.startsWith('eyJ')
    ) {
      // Legacy test mode: set user ID directly
      const jwtClaims = JSON.stringify({ sub: clerkJwtOrUserId });
      await sql`SELECT set_config('request.jwt.claims', ${jwtClaims}, false)`;
    } else {
      // Production mode: validate JWT cryptographically
      await sql`SELECT auth.jwt_session_init(${clerkJwtOrUserId})`;
    }

    // ... rest of cleanup logic ...
  } catch (error) {
    // ... error handling ...
  }
}
```

**Tests continue to work:**

```typescript
// tests/helpers/rls.ts - no changes needed
export async function createRlsDbForUser(clerkUserId: string) {
  const result = await createAuthenticatedRlsClient(clerkUserId);
  return result.db;
}
```

**Option B: Separate Test Extension Configuration**

Configure `pg_session_jwt` in test environment to accept test JWTs:

```sql
-- In test database setup
SELECT auth.configure(
  jsonb_build_object(
    'jwks', jsonb_build_object(
      'keys', jsonb_build_array(
        -- Add test signing key
        jsonb_build_object(
          'kty', 'RSA',
          'use', 'sig',
          'kid', 'test-key-1',
          'n', '<test_public_key_modulus>',
          'e', 'AQAB'
        )
      )
    )
  )
);
```

**Generate test JWTs:**

```typescript
// tests/helpers/jwt.ts
import * as jose from 'jose';

const TEST_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----`;

export async function generateTestJwt(clerkUserId: string): Promise<string> {
  const privateKey = await jose.importPKCS8(TEST_PRIVATE_KEY, 'RS256');

  const jwt = await new jose.SignJWT({ sub: clerkUserId })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);

  return jwt;
}
```

**Update test helper:**

```typescript
// tests/helpers/rls.ts
import { generateTestJwt } from './jwt';

export async function createRlsDbForUser(clerkUserId: string) {
  const jwt = await generateTestJwt(clerkUserId);
  const result = await createAuthenticatedRlsClient(jwt);
  return result.db;
}
```

**Recommendation:** **Option A (Dual-Mode)** for simplicity. Option B is more realistic but adds complexity for testing.

#### Step 4.2: Add Negative Security Tests

**File:** `tests/security/rls.policies.spec.ts`

Add tests to verify the old attack vector no longer works:

```typescript
describe('Identity validation security', () => {
  it('setting request.jwt.claims manually does NOT grant access (JWT validation required)', async () => {
    // This test proves that an attacker who achieves SQL injection
    // cannot impersonate users by setting request.jwt.claims directly.

    const victim = await createTestUser();
    const victimPlan = await createTestPlan({ userId: victim.id });

    // Attempt to forge identity using the old set_config approach
    const maliciousDb = postgres(databaseEnv.nonPoolingUrl || databaseEnv.url, {
      max: 1,
    });

    await maliciousDb.unsafe('SET ROLE authenticated');
    await maliciousDb`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: victim.id })}, false)`;

    // Query using Drizzle with forged identity
    const db = drizzle(maliciousDb, { schema });

    // Should return empty because auth.user_id() returns NULL
    // (JWT was never validated via auth.jwt_session_init())
    const plans = await db.select().from(learningPlans);

    expect(plans).toHaveLength(0); // Attack failed - no access to victim's data

    await maliciousDb.end();
  });

  it('invalid JWT is rejected with clear error', async () => {
    await expect(async () => {
      const { db, cleanup } =
        await createAuthenticatedRlsClient('invalid.jwt.token');
      await cleanup();
    }).rejects.toThrow(/JWT validation failed/);
  });

  it('expired JWT is rejected', async () => {
    // Generate JWT with exp in the past
    const expiredJwt = await generateTestJwt('user_123', { expiresIn: '-1h' });

    await expect(async () => {
      const { db, cleanup } = await createAuthenticatedRlsClient(expiredJwt);
      await cleanup();
    }).rejects.toThrow(/expired/);
  });
});
```

#### Step 4.3: Update Integration Tests

**Search for test files using RLS:**

```bash
grep -r "createRlsDbForUser\|createAnonRlsDb" tests/ --include="*.spec.ts"
```

**For each file:**

1. If using Option A (dual-mode), no changes needed
2. If using Option B (test JWTs), verify helper usage is correct

**Example test that should still work:**

```typescript
// tests/integration/plans.spec.ts
describe('Plan creation with RLS', () => {
  it('user can create and read their own plan', async () => {
    const user = await createTestUser();
    const rlsDb = await createRlsDbForUser(user.clerkUserId);

    // Create plan via RLS client
    const [plan] = await rlsDb
      .insert(learningPlans)
      .values({
        userId: user.id,
        topic: 'Test',
        skillLevel: 'beginner',
        weeklyHours: 10,
        learningStyle: 'mixed',
      })
      .returning();

    // Read back via RLS client
    const plans = await rlsDb.select().from(learningPlans);

    expect(plans).toHaveLength(1);
    expect(plans[0].id).toBe(plan.id);
  });
});
```

#### Step 4.4: Run Test Suites

```bash
# Unit tests (should have no RLS usage, should pass without changes)
pnpm test

# Security tests (with new negative tests)
RUN_RLS_TESTS=1 pnpm test tests/security/

# Integration tests
pnpm test:integration

# E2E tests
pnpm test:e2e
```

**Acceptance Criteria:**

- [ ] All existing tests pass
- [ ] New negative test proves old attack doesn't work
- [ ] Invalid/expired JWT tests pass

---

### Phase 5: API Route Updates

**Files Modified:** All API routes using `getDb()`

#### Step 5.1: Identify Call Sites

```bash
grep -r "getDb()" src/app/api --include="*.ts"
```

**Expected change:** If `getDb()` is now async, update call sites:

```typescript
// Before
const db = getDb();
const plans = await db.select().from(learningPlans);

// After
const db = await getDb();
const plans = await db.select().from(learningPlans);
```

**If this is too many changes:** Keep `getDb()` synchronous and use different function name for new behavior:

```typescript
// Alternative: Add new function, deprecate old one
export async function getAuthenticatedDb(): Promise<DbClient> {
  const jwt = await getClerkJwt();
  const { db } = await createAuthenticatedRlsClient(jwt);
  return db;
}

// Mark old function as deprecated
/** @deprecated Use getAuthenticatedDb() for JWT-validated RLS */
export function getDb(): DbClient {
  // Keep old implementation for backwards compat during migration
}
```

**Recommendation:** Assess number of call sites. If < 50, update directly. If > 50, use deprecation approach with gradual migration.

#### Step 5.2: Update Error Handling

API routes may need to handle new JWT validation errors:

```typescript
// src/app/api/v1/plans/route.ts

export async function GET(request: Request) {
  try {
    const db = await getDb();
    const plans = await db.select().from(learningPlans);

    return NextResponse.json({ plans });
  } catch (error) {
    if (error instanceof JwtValidationError) {
      // JWT validation failed - user session may be expired or tampered
      return NextResponse.json(
        { error: 'Authentication failed. Please sign in again.' },
        { status: 401 }
      );
    }

    // Other errors
    logger.error({ error }, 'Failed to fetch plans');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

---

### Phase 6: Cleanup and Documentation

#### Step 6.1: Remove Old Code (If Fully Migrated)

If all RLS clients now use JWT validation:

**Delete:**

- Old `set_config('request.jwt.claims', ...)` calls in production code paths
- Test-only dual-mode logic (if using Option A initially)

**Keep:**

- Anonymous client's `set_config` (still needed for anonymous users)

#### Step 6.2: Update Documentation

**Files to update:**

1. `src/lib/db/AGENTS.md`

   ```markdown
   ## RLS Architecture (Updated)

   Uses Neon's `pg_session_jwt` extension for database-validated identity:

   1. Client obtains Clerk JWT via `getClerkJwt()`
   2. RLS client calls `SELECT auth.jwt_session_init(jwt)`
   3. Database validates JWT signature using Clerk JWKS
   4. Policies use `auth.user_id()` for cryptographically verified identity

   **Security:** Database is authoritative on identity. App cannot forge identity
   without a valid Clerk JWT signed by Clerk's private keys.
   ```

2. `src/lib/db/rls.ts` (inline comments - already updated in Step 2.2)

3. `docs/rules/database/client-usage.md` (if it exists)

   ```markdown
   ## RLS Identity Validation

   The database validates user identity cryptographically using `pg_session_jwt`:

   - JWTs are verified using Clerk's JWKS (public signing keys)
   - Identity cannot be forged without a valid Clerk-signed JWT
   - Provides defense-in-depth against SQL injection attacks
   ```

4. `CHANGELOG.md`

   ```markdown
   ## [Unreleased]

   ### Security

   - Migrated RLS identity to database-validated JWT using pg_session_jwt extension
   - Database now cryptographically verifies Clerk JWTs using JWKS
   - Identity can no longer be forged via set_config manipulation
   ```

#### Step 6.3: Update ADR (Final)

**File:** `plans/pg-session-jwt-migration/adr-001-feasibility-results.md`

Add "Implementation Completed" section:

```markdown
## Implementation Completed

**Date:** YYYY-MM-DD

### Verification

- ✅ Extension enabled in production
- ✅ JWKS configured and reachable
- ✅ All API routes updated
- ✅ All tests passing
- ✅ Security tests prove old attack vector blocked

### Production Deployment

- Staging deployed: YYYY-MM-DD
- Production deployed: YYYY-MM-DD
- Rollback plan: [describe if needed]

### Performance Impact

- Average request latency increase: X ms
- JWKS cache hit rate: Y%
- No user-facing issues reported
```

---

## Verification Checklist

### Pre-Deployment (Staging)

- [ ] **Phase 0: Feasibility spike completed**
  - [ ] ADR written with "Proceed" decision
  - [ ] Extension works with direct Postgres connections
  - [ ] JWT validation succeeds with real Clerk JWTs
  - [ ] Error scenarios tested and documented
  - [ ] Performance impact measured and acceptable

- [ ] **Phase 1: Extension setup**
  - [ ] Extension enabled in staging database
  - [ ] JWKS configured correctly
  - [ ] Manual verification: `auth.user_id()` returns correct value

- [ ] **Phase 2: RLS client migration**
  - [ ] `createAuthenticatedRlsClient()` uses `auth.jwt_session_init()`
  - [ ] Error handling for invalid/expired JWTs
  - [ ] `getClerkJwt()` utility implemented
  - [ ] Test mode configured (Option A or B)

- [ ] **Phase 3: Policy migration**
  - [ ] `clerkSub` updated to use `auth.user_id()`
  - [ ] No migration generated (or reviewed if generated)
  - [ ] Manual SQL tests confirm policies work

- [ ] **Phase 4: Testing**
  - [ ] Unit tests pass
  - [ ] Integration tests pass
  - [ ] Security tests pass (including new negative tests)
  - [ ] E2E tests pass
  - [ ] Negative test proves `set_config` forgery blocked

- [ ] **Phase 5: API routes**
  - [ ] All `getDb()` call sites updated
  - [ ] Error handling for `JwtValidationError`
  - [ ] Manual API testing with real Clerk sessions

- [ ] **Phase 6: Documentation**
  - [ ] AGENTS.md updated
  - [ ] Inline comments updated
  - [ ] CHANGELOG.md updated
  - [ ] ADR finalized

### Post-Deployment (Production)

- [ ] **Smoke tests**
  - [ ] Login flow works
  - [ ] Plan creation works
  - [ ] Plan retrieval shows correct user-scoped data
  - [ ] Public plan sharing works for anonymous users

- [ ] **Security verification**
  - [ ] Cross-user access blocked (user A cannot read user B's private plans)
  - [ ] Anonymous users can only read public plans
  - [ ] Invalid JWT returns 401 error

- [ ] **Monitoring**
  - [ ] Database connection metrics stable
  - [ ] JWT validation latency within acceptable range
  - [ ] JWKS cache hit rate > 95%
  - [ ] No increase in authentication errors

- [ ] **Rollback readiness**
  - [ ] Migration can be reverted if needed
  - [ ] Old code path documented (in case of emergency rollback)

---

## Rollback Plan

If critical issues arise in production:

### Emergency Rollback (Hot Fix)

**Scenario:** Production is broken, users cannot authenticate.

**Steps:**

1. **Revert RLS client to old implementation:**

   ```bash
   git revert <commit_hash_of_phase_2>
   git push origin main --force
   ```

2. **Deploy immediately:**

   ```bash
   # Trigger production deployment
   ```

3. **Verify:**
   - Authentication works
   - RLS policies enforce correctly
   - No data leakage

4. **Post-incident:**
   - Review what failed
   - Fix in feature branch
   - Re-test in staging before re-deploying

### Graceful Rollback (Planned)

**Scenario:** We decide to abandon pg_session_jwt after deployment but no emergency.

**Steps:**

1. **Keep extension enabled** (no harm if not used)

2. **Revert code changes:**
   - `src/lib/db/rls.ts` → restore `set_config` approach
   - `src/lib/db/schema/tables/common.ts` → restore `current_setting()`

3. **Generate migration:**

   ```bash
   pnpm db:generate
   ```

4. **Deploy to staging, verify, then production**

---

## Risk Assessment

| Risk                                   | Likelihood | Impact | Mitigation                                              |
| -------------------------------------- | ---------- | ------ | ------------------------------------------------------- |
| **JWKS endpoint unreachable**          | Low        | High   | JWKS cached for 1 hour; monitor Clerk status page       |
| **JWT validation adds latency**        | Medium     | Low    | Measured in Phase 0; acceptable if < 50ms               |
| **Extension incompatible with driver** | Low        | High   | Verified in Phase 0 feasibility spike                   |
| **Breaking existing tests**            | Medium     | Medium | Dual-mode (Option A) maintains test compatibility       |
| **Breaking API routes**                | Low        | High   | Gradual migration + comprehensive testing               |
| **Clerk JWT format changes**           | Low        | High   | Standard JWT format; unlikely to break                  |
| **Anonymous user access breaks**       | Low        | Medium | Anonymous uses separate client; not affected by changes |

---

## Success Criteria

**Phase 0 (Feasibility):**

- [ ] ADR document confirms extension works with our stack
- [ ] JWT validation succeeds with real Clerk tokens
- [ ] Performance impact measured and acceptable

**Implementation:**

- [ ] All RLS policies use `auth.user_id()` instead of `current_setting()`
- [ ] `auth.jwt_session_init()` called for all authenticated connections
- [ ] Zero regression in existing tests
- [ ] New negative test proves old attack vector blocked

**Production:**

- [ ] No increase in authentication errors
- [ ] Cross-user access still blocked (RLS still works)
- [ ] Average request latency increase < 50ms
- [ ] Manual security testing confirms identity cannot be forged

---

## Appendix A: SQL Reference

### pg_session_jwt Extension Functions

```sql
-- Initialize session with JWT (validates and extracts claims)
SELECT auth.jwt_session_init('<jwt_token>');

-- Get user ID from validated JWT (returns 'sub' claim)
SELECT auth.user_id(); -- Returns: 'user_2xyz...' or NULL

-- Get full session claims as JSON
SELECT auth.session(); -- Returns: {"sub": "user_xyz", "iat": 1234567890, ...}

-- Configure JWKS
SELECT auth.configure(
  jsonb_build_object(
    'jwks', jsonb_build_object(
      'url', 'https://example.com/.well-known/jwks.json',
      'cache_duration_seconds', 3600
    )
  )
);

-- View current configuration
SELECT auth.get_configuration();

-- Manually fetch JWKS (for debugging)
SELECT auth.fetch_jwks();
```

### Debugging Queries

```sql
-- Check if extension is enabled
SELECT * FROM pg_available_extensions WHERE name = 'pg_session_jwt';

-- Check current role
SELECT current_role;

-- Check auth.user_id() value
SELECT auth.user_id();

-- Check full session
SELECT auth.session();

-- Test policy manually
EXPLAIN (ANALYZE, VERBOSE)
SELECT * FROM learning_plans
WHERE user_id = auth.user_id();
```

---

## Appendix B: Clerk JWKS Discovery

### Finding Your Clerk JWKS URL

1. **Via Clerk Dashboard:**
   - Go to Clerk Dashboard → Settings → API Keys
   - Look for "Issuer" URL (e.g., `https://clerk.your-domain.com`)
   - JWKS URL: `https://clerk.your-domain.com/.well-known/jwks.json`

2. **Via OpenID Configuration:**

   ```bash
   curl https://clerk.YOUR_DOMAIN.com/.well-known/openid-configuration | jq .jwks_uri
   ```

3. **Verify JWKS is reachable:**
   ```bash
   curl https://clerk.YOUR_DOMAIN.com/.well-known/jwks.json
   # Should return JSON with "keys" array
   ```

### Example JWKS Response

```json
{
  "keys": [
    {
      "use": "sig",
      "kty": "RSA",
      "kid": "ins_2XYZ...",
      "alg": "RS256",
      "n": "0vx7agoebGcQSuuPiLJXZptN9...",
      "e": "AQAB"
    }
  ]
}
```

---

## Appendix C: Related Issues and Dependencies

| Issue | Title                                          | Relationship                                     |
| ----- | ---------------------------------------------- | ------------------------------------------------ |
| #191  | Scope RLS policies to authenticated/anon roles | Complements #192 (different scope)               |
| #192  | Migrate RLS identity to pg_session_jwt (THIS)  | Depends on #191 being merged first (recommended) |

### Merge Order

**Recommended:**

1. Merge #191 first
2. Start #192 work from latest `develop`
3. Merge #192

**Why:** Avoids migration conflicts and keeps changes isolated.

---

## Questions and Answers

### Q: Why not just validate JWT in the app and trust it?

**A:** Defense in depth. If the app has a SQL injection vulnerability, an attacker could still execute `SELECT set_config('request.jwt.claims', '{"sub": "victim"}', false)` and impersonate users. With database validation, the attacker would need a valid Clerk-signed JWT, which they cannot forge.

### Q: What if Clerk JWKS endpoint is down?

**A:** The extension caches JWKS for 1 hour (configurable). If the cache is fresh, validation continues. If cache expires and JWKS is unreachable, new JWT validations fail but existing sessions (< 1 hour old) continue to work.

**Monitoring:** Set up alerts for JWKS fetch failures.

### Q: Does this work with Clerk's session tokens or access tokens?

**A:** Clerk session tokens are JWTs. Use `await clerkClient.sessions.getToken(sessionId)` or `auth().getToken()` in App Router to get the JWT. Verify in Phase 0 that this JWT has the expected claims (`sub`, `iat`, `exp`, etc.).

### Q: How do we handle anonymous users?

**A:** Anonymous users don't have a JWT. They continue using `createAnonymousRlsClient()` which sets `request.jwt.claims = 'null'`. Policies scoped to `to: 'anonymous'` don't check `auth.user_id()` (which returns NULL for anonymous).

### Q: What if we later migrate away from Neon?

**A:** `pg_session_jwt` is a standard Postgres extension, not Neon-specific. It can be compiled and installed on any Postgres instance. The extension is open-source: https://github.com/neondatabase/pg_session_jwt

### Q: What's the performance impact?

**A:** Expected < 50ms per request (measured in Phase 0). JWT validation is fast (RSA signature verification). JWKS fetch happens once per hour (cached).

### Q: Can we use this with other auth providers (not Clerk)?

**A:** Yes. `pg_session_jwt` works with any JWT issuer that publishes a JWKS endpoint. Configure the extension with the issuer's JWKS URL.

---

## Next Steps After Plan Approval

1. **Read and approve this plan**
2. **Begin Phase 0 (Feasibility Spike)** in staging environment
3. **Write ADR with results** - DO NOT PROCEED until ADR says "Proceed"
4. **Create feature branch** from latest `develop` (after #191 is merged)
5. **Implement Phase 1-6 sequentially**
6. **Open PR** with thorough testing evidence
7. **Deploy to staging** for final verification
8. **Deploy to production** with monitoring

---

**END OF IMPLEMENTATION PLAN**
