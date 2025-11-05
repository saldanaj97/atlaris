# Third-Party Sync Implementation Plan

> **For Claude and CODEX:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable users to export learning plans to Notion (pages/databases) and sync to Google Calendar (scheduled events) with OAuth authentication, secure token storage, and tier-based usage limits.

**Architecture:** OAuth 2.0 flows for both services with AES-256 encrypted token storage. Shared OAuth infrastructure handles token encryption, refresh, and revocation. Service-specific modules map learning plans to Notion pages/blocks and Google Calendar events. Delta sync tracks changes via timestamps and hashes. Tier gates enforce export quotas based on subscription level.

**Tech Stack:** Next.js 15 API routes, Drizzle ORM, @notionhq/client SDK, googleapis (Google Calendar API), node:crypto (AES-256 encryption), Zod validation, Vitest testing

---

## Prerequisites

Before starting implementation, you'll need:

1. **Notion OAuth Credentials:**
   - Create integration at https://www.notion.so/my-integrations
   - Get Client ID and Client Secret
   - Set redirect URI to `http://localhost:3000/api/v1/auth/notion/callback` (dev) and production URL
   - Add to `.env.local` and `.env.test`:
     ```
     NOTION_CLIENT_ID=your_client_id
     NOTION_CLIENT_SECRET=your_client_secret
     NOTION_REDIRECT_URI=http://localhost:3000/api/v1/auth/notion/callback
     ```

2. **Google OAuth Credentials:**
   - Create project at https://console.cloud.google.com
   - Enable Google Calendar API
   - Create OAuth 2.0 credentials (Web application)
   - Set redirect URI to `http://localhost:3000/api/v1/auth/google/callback`
   - Add to `.env.local` and `.env.test`:
     ```
     GOOGLE_CLIENT_ID=your_client_id
     GOOGLE_CLIENT_SECRET=your_client_secret
     GOOGLE_REDIRECT_URI=http://localhost:3000/api/v1/auth/google/callback
     ```

3. **Encryption Key:**
   - Generate secure 32-byte key for AES-256 encryption
   - Add to `.env.local` and `.env.test`:
     ```
     OAUTH_ENCRYPTION_KEY=your_64_char_hex_string
     ```
   - Generate with: `openssl rand -hex 32`

---

## Task 1: Database Schema - Integration Tokens Table

**Files:**

- Modify: `src/lib/db/schema.ts`
- Modify: `src/lib/db/enums.ts`
- Create: `src/lib/db/migrations/XXXX_add_integration_tokens.sql`

**Step 1: Add integration provider enum**

Edit `src/lib/db/enums.ts`:

```typescript
export const integrationProviderEnum = pgEnum('integration_provider', [
  'notion',
  'google_calendar',
]);
```

**Step 2: Add integration_tokens table to schema**

Edit `src/lib/db/schema.ts`, add after users table:

```typescript
import { integrationProviderEnum } from './enums';

export const integrationTokens = pgTable(
  'integration_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: integrationProviderEnum('provider').notNull(),
    encryptedAccessToken: text('encrypted_access_token').notNull(),
    encryptedRefreshToken: text('encrypted_refresh_token'),
    scope: text('scope').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    workspaceId: text('workspace_id'),
    workspaceName: text('workspace_name'),
    botId: text('bot_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userProviderUnique: unique('user_provider_unique').on(
      table.userId,
      table.provider
    ),
    userIdIdx: index('integration_tokens_user_id_idx').on(table.userId),
    providerIdx: index('integration_tokens_provider_idx').on(table.provider),
  })
);
```

**Step 3: Generate migration**

Run:

```bash
pnpm db:generate
```

Expected: New migration file created in `src/lib/db/migrations/`

**Step 4: Apply migration to local database**

Run:

```bash
pnpm db:push
```

Expected: "integration_tokens" table created successfully

**Step 5: Apply migration to test database**

Run:

```bash
pnpm db:push:test
```

Expected: "integration_tokens" table created in test database

**Step 6: Commit schema changes**

```bash
git add src/lib/db/enums.ts src/lib/db/schema.ts src/lib/db/migrations/
git commit -m "feat(db): add integration_tokens table for OAuth storage

Add table to store encrypted OAuth tokens for Notion and Google Calendar
integrations. Supports access/refresh tokens, workspace metadata, and
per-user-provider uniqueness constraint.

Changes:
- Add integration_provider enum (notion, google_calendar)
- Add integration_tokens table with encryption-ready fields
- Generate and apply migrations for both local and test databases

New files:
- src/lib/db/migrations/XXXX_add_integration_tokens.sql"
```

---

## Task 2: Database Schema - Notion Sync State Table

**Files:**

- Modify: `src/lib/db/schema.ts`
- Create: `src/lib/db/migrations/XXXX_add_notion_sync_state.sql`

**Step 1: Add notion_sync_state table to schema**

Edit `src/lib/db/schema.ts`, add after integrationTokens:

```typescript
export const notionSyncState = pgTable(
  'notion_sync_state',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => learningPlans.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    notionPageId: text('notion_page_id').notNull(),
    notionDatabaseId: text('notion_database_id'),
    syncHash: text('sync_hash').notNull(), // SHA-256 hash of plan content
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    planIdUnique: unique('notion_sync_plan_id_unique').on(table.planId),
    planIdIdx: index('notion_sync_state_plan_id_idx').on(table.planId),
    userIdIdx: index('notion_sync_state_user_id_idx').on(table.userId),
  })
);
```

**Step 2: Generate migration**

Run:

```bash
pnpm db:generate
```

Expected: New migration file created

**Step 3: Apply migrations**

Run:

```bash
pnpm db:push && pnpm db:push:test
```

Expected: "notion_sync_state" table created in both databases

**Step 4: Commit schema changes**

```bash
git add src/lib/db/schema.ts src/lib/db/migrations/
git commit -m "feat(db): add notion_sync_state table for delta sync

Add table to track Notion page associations and sync state per learning
plan. Supports delta sync via content hash comparison and last sync
timestamp.

Changes:
- Add notion_sync_state table with page/database ID tracking
- Add sync_hash field for content change detection
- Add unique constraint on plan_id (one Notion page per plan)

New files:
- src/lib/db/migrations/XXXX_add_notion_sync_state.sql"
```

---

## Task 3: Database Schema - Google Calendar Sync State Table

**Files:**

- Modify: `src/lib/db/schema.ts`
- Create: `src/lib/db/migrations/XXXX_add_google_calendar_sync_state.sql`

**Step 1: Add google_calendar_sync_state table**

Edit `src/lib/db/schema.ts`, add after notionSyncState:

```typescript
export const googleCalendarSyncState = pgTable(
  'google_calendar_sync_state',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => learningPlans.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    syncToken: text('sync_token'), // Google's incremental sync token
    calendarId: text('calendar_id').notNull().default('primary'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    planIdUnique: unique('gcal_sync_plan_id_unique').on(table.planId),
    planIdIdx: index('google_calendar_sync_state_plan_id_idx').on(table.planId),
    userIdIdx: index('google_calendar_sync_state_user_id_idx').on(table.userId),
  })
);
```

**Step 2: Add task_calendar_events mapping table**

Edit `src/lib/db/schema.ts`, add after googleCalendarSyncState:

```typescript
export const taskCalendarEvents = pgTable(
  'task_calendar_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    calendarEventId: text('calendar_event_id').notNull(),
    calendarId: text('calendar_id').notNull().default('primary'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    taskIdUnique: unique('task_calendar_event_unique').on(
      table.taskId,
      table.userId
    ),
    taskIdIdx: index('task_calendar_events_task_id_idx').on(table.taskId),
    userIdIdx: index('task_calendar_events_user_id_idx').on(table.userId),
  })
);
```

**Step 3: Generate and apply migrations**

Run:

```bash
pnpm db:generate && pnpm db:push && pnpm db:push:test
```

Expected: Both tables created successfully

**Step 4: Commit schema changes**

```bash
git add src/lib/db/schema.ts src/lib/db/migrations/
git commit -m "feat(db): add google_calendar sync state tables

Add tables to track Google Calendar sync state and task-to-event
mappings. Supports incremental sync via Google's sync tokens.

Changes:
- Add google_calendar_sync_state with sync token tracking
- Add task_calendar_events for task-to-event ID mapping
- Add unique constraints to prevent duplicate events

New files:
- src/lib/db/migrations/XXXX_add_google_calendar_sync_state.sql"
```

---

## Task 4: Shared OAuth Infrastructure - Token Encryption Utility

**Files:**

- Create: `src/lib/integrations/oauth.ts`
- Create: `tests/unit/integrations/oauth.spec.ts`

**Step 1: Write failing test for token encryption**

Create `tests/unit/integrations/oauth.spec.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import {
  encryptToken,
  decryptToken,
  OAuthTokenData,
} from '@/lib/integrations/oauth';

describe('OAuth Token Encryption', () => {
  const mockToken: OAuthTokenData = {
    accessToken: 'test_access_token_12345',
    refreshToken: 'test_refresh_token_67890',
    expiresAt: new Date('2025-12-31T23:59:59Z'),
    scope: 'read write',
  };

  it('should encrypt and decrypt token successfully', () => {
    const encrypted = encryptToken(mockToken);
    const decrypted = decryptToken(encrypted);

    expect(decrypted.accessToken).toBe(mockToken.accessToken);
    expect(decrypted.refreshToken).toBe(mockToken.refreshToken);
    expect(decrypted.expiresAt.toISOString()).toBe(
      mockToken.expiresAt.toISOString()
    );
    expect(decrypted.scope).toBe(mockToken.scope);
  });

  it('should produce different ciphertext for same plaintext', () => {
    const encrypted1 = encryptToken(mockToken);
    const encrypted2 = encryptToken(mockToken);

    expect(encrypted1).not.toBe(encrypted2); // Different IV each time
  });

  it('should throw error if encryption key is missing', () => {
    const originalKey = process.env.OAUTH_ENCRYPTION_KEY;
    delete process.env.OAUTH_ENCRYPTION_KEY;

    expect(() => encryptToken(mockToken)).toThrow(
      'OAUTH_ENCRYPTION_KEY not configured'
    );

    process.env.OAUTH_ENCRYPTION_KEY = originalKey;
  });

  it('should throw error on invalid ciphertext', () => {
    expect(() => decryptToken('invalid_ciphertext')).toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run tests/unit/integrations/oauth.spec.ts
```

Expected: FAIL - "Cannot find module '@/lib/integrations/oauth'"

**Step 3: Write minimal implementation**

Create `src/lib/integrations/oauth.ts`:

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

export interface OAuthTokenData {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope: string;
}

function getEncryptionKey(): Buffer {
  const key = process.env.OAUTH_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('OAUTH_ENCRYPTION_KEY not configured');
  }
  return Buffer.from(key, 'hex');
}

export function encryptToken(tokenData: OAuthTokenData): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const payload = JSON.stringify({
    accessToken: tokenData.accessToken,
    refreshToken: tokenData.refreshToken,
    expiresAt: tokenData.expiresAt?.toISOString(),
    scope: tokenData.scope,
  });

  let encrypted = cipher.update(payload, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Return: IV + encrypted data (hex encoded)
  return iv.toString('hex') + ':' + encrypted;
}

export function decryptToken(encryptedData: string): OAuthTokenData {
  const key = getEncryptionKey();
  const parts = encryptedData.split(':');

  if (parts.length !== 2) {
    throw new Error('Invalid encrypted token format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  const parsed = JSON.parse(decrypted);

  return {
    accessToken: parsed.accessToken,
    refreshToken: parsed.refreshToken,
    expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : undefined,
    scope: parsed.scope,
  };
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run tests/unit/integrations/oauth.spec.ts
```

Expected: PASS - All 4 tests passing

**Step 5: Commit**

```bash
git add src/lib/integrations/oauth.ts tests/unit/integrations/oauth.spec.ts
git commit -m "feat(oauth): add AES-256 token encryption utilities

Implement secure encryption/decryption for OAuth tokens using AES-256-CBC
with random IVs. Supports access tokens, refresh tokens, expiry, and scope.

Changes:
- Add encryptToken/decryptToken functions with AES-256-CBC
- Use random IV per encryption for semantic security
- Validate encryption key presence and format

New files:
- src/lib/integrations/oauth.ts
- tests/unit/integrations/oauth.spec.ts

Tests cover:
- Successful encryption/decryption round-trip
- Different ciphertext for same plaintext (IV randomness)
- Error handling for missing encryption key
- Error handling for invalid ciphertext"
```

---

## Task 5: Shared OAuth Infrastructure - Token Storage Functions

**Files:**

- Modify: `src/lib/integrations/oauth.ts`
- Modify: `tests/unit/integrations/oauth.spec.ts`
- Create: `tests/integration/oauth-storage.spec.ts`

**Step 1: Write failing integration test for token storage**

Create `tests/integration/oauth-storage.spec.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db/drizzle';
import { users, integrationTokens } from '@/lib/db/schema';
import {
  storeOAuthTokens,
  getOAuthTokens,
  deleteOAuthTokens,
} from '@/lib/integrations/oauth';
import { eq, and } from 'drizzle-orm';

describe('OAuth Token Storage', () => {
  let testUserId: string;

  beforeEach(async () => {
    // Clean up test data
    await db.delete(integrationTokens);
    await db.delete(users);

    // Create test user
    const [user] = await db
      .insert(users)
      .values({
        clerkUserId: `clerk_test_${Date.now()}`,
        email: `test-${Date.now()}@example.com`,
      })
      .returning();

    testUserId = user.id;
  });

  it('should store and retrieve OAuth tokens', async () => {
    const tokenData = {
      accessToken: 'test_access_token',
      refreshToken: 'test_refresh_token',
      expiresAt: new Date('2025-12-31T23:59:59Z'),
      scope: 'read write',
    };

    await storeOAuthTokens({
      userId: testUserId,
      provider: 'notion',
      tokenData,
      workspaceId: 'workspace_123',
      workspaceName: 'Test Workspace',
    });

    const retrieved = await getOAuthTokens(testUserId, 'notion');

    expect(retrieved).toBeDefined();
    expect(retrieved!.accessToken).toBe(tokenData.accessToken);
    expect(retrieved!.refreshToken).toBe(tokenData.refreshToken);
    expect(retrieved!.scope).toBe(tokenData.scope);
  });

  it('should update existing tokens on duplicate user/provider', async () => {
    const tokenData1 = {
      accessToken: 'old_token',
      scope: 'read',
    };

    const tokenData2 = {
      accessToken: 'new_token',
      scope: 'read write',
    };

    await storeOAuthTokens({
      userId: testUserId,
      provider: 'notion',
      tokenData: tokenData1,
    });
    await storeOAuthTokens({
      userId: testUserId,
      provider: 'notion',
      tokenData: tokenData2,
    });

    const retrieved = await getOAuthTokens(testUserId, 'notion');
    expect(retrieved!.accessToken).toBe('new_token');

    // Should only have one record
    const count = await db
      .select()
      .from(integrationTokens)
      .where(
        and(
          eq(integrationTokens.userId, testUserId),
          eq(integrationTokens.provider, 'notion')
        )
      );

    expect(count).toHaveLength(1);
  });

  it('should delete OAuth tokens', async () => {
    await storeOAuthTokens({
      userId: testUserId,
      provider: 'google_calendar',
      tokenData: { accessToken: 'test', scope: 'calendar' },
    });

    await deleteOAuthTokens(testUserId, 'google_calendar');

    const retrieved = await getOAuthTokens(testUserId, 'google_calendar');
    expect(retrieved).toBeNull();
  });

  it('should return null for non-existent tokens', async () => {
    const retrieved = await getOAuthTokens(testUserId, 'notion');
    expect(retrieved).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run tests/integration/oauth-storage.spec.ts
```

Expected: FAIL - "storeOAuthTokens is not a function"

**Step 3: Implement storage functions**

Edit `src/lib/integrations/oauth.ts`, add:

```typescript
import { db } from '@/lib/db/drizzle';
import { integrationTokens } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

type IntegrationProvider = 'notion' | 'google_calendar';

interface StoreTokensParams {
  userId: string;
  provider: IntegrationProvider;
  tokenData: OAuthTokenData;
  workspaceId?: string;
  workspaceName?: string;
  botId?: string;
}

export async function storeOAuthTokens(
  params: StoreTokensParams
): Promise<void> {
  const { userId, provider, tokenData, workspaceId, workspaceName, botId } =
    params;

  const encryptedAccess = encryptToken({
    ...tokenData,
    refreshToken: undefined,
  });
  const encryptedRefresh = tokenData.refreshToken
    ? encryptToken({
        accessToken: tokenData.refreshToken,
        scope: tokenData.scope,
      })
    : null;

  // Use upsert pattern: delete then insert (Drizzle doesn't have native upsert for Postgres)
  await db
    .delete(integrationTokens)
    .where(
      and(
        eq(integrationTokens.userId, userId),
        eq(integrationTokens.provider, provider)
      )
    );

  await db.insert(integrationTokens).values({
    userId,
    provider,
    encryptedAccessToken: encryptedAccess,
    encryptedRefreshToken: encryptedRefresh,
    scope: tokenData.scope,
    expiresAt: tokenData.expiresAt,
    workspaceId,
    workspaceName,
    botId,
    updatedAt: new Date(),
  });
}

export async function getOAuthTokens(
  userId: string,
  provider: IntegrationProvider
): Promise<OAuthTokenData | null> {
  const [record] = await db
    .select()
    .from(integrationTokens)
    .where(
      and(
        eq(integrationTokens.userId, userId),
        eq(integrationTokens.provider, provider)
      )
    )
    .limit(1);

  if (!record) {
    return null;
  }

  const accessTokenData = decryptToken(record.encryptedAccessToken);
  const refreshToken = record.encryptedRefreshToken
    ? decryptToken(record.encryptedRefreshToken).accessToken
    : undefined;

  return {
    accessToken: accessTokenData.accessToken,
    refreshToken,
    expiresAt: record.expiresAt ?? undefined,
    scope: record.scope,
  };
}

export async function deleteOAuthTokens(
  userId: string,
  provider: IntegrationProvider
): Promise<void> {
  await db
    .delete(integrationTokens)
    .where(
      and(
        eq(integrationTokens.userId, userId),
        eq(integrationTokens.provider, provider)
      )
    );
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run tests/integration/oauth-storage.spec.ts
```

Expected: PASS - All 4 tests passing

**Step 5: Commit**

```bash
git add src/lib/integrations/oauth.ts tests/integration/oauth-storage.spec.ts
git commit -m "feat(oauth): add database storage for encrypted tokens

Implement CRUD operations for OAuth tokens with encrypted storage.
Supports upsert pattern for token refresh and workspace metadata.

Changes:
- Add storeOAuthTokens with upsert behavior
- Add getOAuthTokens with decryption
- Add deleteOAuthTokens for revocation
- Store workspace metadata (ID, name, bot ID)

New files:
- tests/integration/oauth-storage.spec.ts

Tests cover:
- Store and retrieve tokens with encryption
- Upsert behavior on duplicate user/provider
- Token deletion
- Null return for non-existent tokens"
```

---

## Task 6: Notion Integration - OAuth Authorization Flow

**API Key Note:** Before implementing this task, ensure you have:

- Created a Notion integration at https://www.notion.so/my-integrations
- Added NOTION_CLIENT_ID, NOTION_CLIENT_SECRET, NOTION_REDIRECT_URI to `.env.local` and `.env.test`

**Files:**

- Create: `src/app/api/v1/auth/notion/route.ts`
- Create: `src/app/api/v1/auth/notion/callback/route.ts`
- Create: `tests/integration/notion-oauth.spec.ts`

**Step 1: Write failing test for OAuth redirect**

Create `tests/integration/notion-oauth.spec.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { GET as notionAuthGET } from '@/app/api/v1/auth/notion/route';
import { GET as notionCallbackGET } from '@/app/api/v1/auth/notion/callback/route';

describe('Notion OAuth Flow', () => {
  it('should redirect to Notion authorization URL', async () => {
    const request = new Request('http://localhost:3000/api/v1/auth/notion');
    const response = await notionAuthGET(request);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toContain(
      'https://api.notion.com/v1/oauth/authorize'
    );
    expect(response.headers.get('Location')).toContain('client_id=');
    expect(response.headers.get('Location')).toContain('redirect_uri=');
    expect(response.headers.get('Location')).toContain('response_type=code');
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run tests/integration/notion-oauth.spec.ts
```

Expected: FAIL - "Cannot find module"

**Step 3: Implement authorization redirect endpoint**

Create `src/app/api/v1/auth/notion/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export async function GET(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const clientId = process.env.NOTION_CLIENT_ID;
  const redirectUri = process.env.NOTION_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: 'Notion OAuth not configured' },
      { status: 500 }
    );
  }

  const authUrl = new URL('https://api.notion.com/v1/oauth/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('owner', 'user');

  // Store userId in state parameter for callback verification
  authUrl.searchParams.set('state', userId);

  return NextResponse.redirect(authUrl.toString());
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run tests/integration/notion-oauth.spec.ts
```

Expected: PASS

**Step 5: Implement OAuth callback endpoint (test first)**

Add to `tests/integration/notion-oauth.spec.ts`:

```typescript
import { db } from '@/lib/db/drizzle';
import { users, integrationTokens } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

describe('Notion OAuth Callback', () => {
  it('should exchange code for tokens and store encrypted', async () => {
    // Mock Notion API token exchange
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'notion_access_token_123',
        bot_id: 'bot_abc',
        workspace_id: 'workspace_xyz',
        workspace_name: 'Test Workspace',
        owner: { type: 'user' },
      }),
    });

    // Create test user
    await db.delete(integrationTokens);
    await db.delete(users);
    const [user] = await db
      .insert(users)
      .values({
        clerkUserId: 'test_clerk_user',
        email: 'test@example.com',
      })
      .returning();

    const request = new Request(
      `http://localhost:3000/api/v1/auth/notion/callback?code=test_code&state=${user.id}`
    );

    const response = await notionCallbackGET(request);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toContain(
      '/settings/integrations'
    );

    // Verify token stored
    const [token] = await db
      .select()
      .from(integrationTokens)
      .where(eq(integrationTokens.userId, user.id));

    expect(token).toBeDefined();
    expect(token.provider).toBe('notion');
    expect(token.workspaceId).toBe('workspace_xyz');
  });
});
```

**Step 6: Run test to verify it fails**

Run:

```bash
pnpm vitest run tests/integration/notion-oauth.spec.ts
```

Expected: FAIL - Callback not implemented

**Step 7: Implement callback endpoint**

Create `src/app/api/v1/auth/notion/callback/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { storeOAuthTokens } from '@/lib/integrations/oauth';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // userId
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings/integrations?error=${error}`, request.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/settings/integrations?error=missing_parameters', request.url)
    );
  }

  // Verify user exists
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, state))
    .limit(1);

  if (!user) {
    return NextResponse.redirect(
      new URL('/settings/integrations?error=invalid_user', request.url)
    );
  }

  // Exchange code for access token
  const tokenResponse = await fetch('https://api.notion.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(
        `${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`
      ).toString('base64')}`,
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.NOTION_REDIRECT_URI,
    }),
  });

  if (!tokenResponse.ok) {
    const errorData = await tokenResponse.json();
    console.error('Notion token exchange failed:', errorData);
    return NextResponse.redirect(
      new URL('/settings/integrations?error=token_exchange_failed', request.url)
    );
  }

  const tokenData = await tokenResponse.json();

  // Store encrypted tokens
  await storeOAuthTokens({
    userId: user.id,
    provider: 'notion',
    tokenData: {
      accessToken: tokenData.access_token,
      scope: 'notion', // Notion doesn't use traditional scopes
    },
    workspaceId: tokenData.workspace_id,
    workspaceName: tokenData.workspace_name,
    botId: tokenData.bot_id,
  });

  return NextResponse.redirect(
    new URL('/settings/integrations?notion=connected', request.url)
  );
}
```

**Step 8: Run test to verify it passes**

Run:

```bash
pnpm vitest run tests/integration/notion-oauth.spec.ts
```

Expected: PASS - Both tests passing

**Step 9: Commit**

```bash
git add src/app/api/v1/auth/notion/ tests/integration/notion-oauth.spec.ts
git commit -m "feat(notion): implement OAuth 2.0 authorization flow

Add OAuth authorization redirect and callback endpoints for Notion
integration. Exchanges authorization code for access token and stores
encrypted in database with workspace metadata.

Changes:
- Add GET /api/v1/auth/notion (redirect to Notion OAuth)
- Add GET /api/v1/auth/notion/callback (token exchange)
- Store workspace_id, workspace_name, bot_id from Notion response
- Use state parameter to verify user identity

New files:
- src/app/api/v1/auth/notion/route.ts
- src/app/api/v1/auth/notion/callback/route.ts
- tests/integration/notion-oauth.spec.ts

Tests cover:
- Authorization redirect with correct parameters
- Callback token exchange and encrypted storage"
```

---

## Task 7: Notion Integration - Plan-to-Notion Data Mapper

**Files:**

- Create: `src/lib/integrations/notion/mapper.ts`
- Create: `tests/unit/integrations/notion-mapper.spec.ts`

**Step 1: Write failing test for plan-to-Notion mapping**

Create `tests/unit/integrations/notion-mapper.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  mapPlanToNotionBlocks,
  mapModuleToBlocks,
} from '@/lib/integrations/notion/mapper';
import type { LearningPlan, Module, Task } from '@/lib/db/schema';

describe('Notion Data Mapper', () => {
  const mockPlan: Partial<LearningPlan> & { modules: Module[] } = {
    id: 'plan-123',
    topic: 'TypeScript Fundamentals',
    skillLevel: 'intermediate',
    weeklyHours: 5,
    modules: [],
  };

  const mockModule: Module & { tasks: Task[] } = {
    id: 'module-1',
    planId: 'plan-123',
    title: 'Basic Types',
    description: 'Learn TypeScript basic types',
    order: 1,
    estimatedMinutes: 120,
    createdAt: new Date(),
    updatedAt: new Date(),
    tasks: [
      {
        id: 'task-1',
        moduleId: 'module-1',
        title: 'Understand primitive types',
        description: 'Learn about string, number, boolean',
        order: 1,
        durationMinutes: 30,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  };

  it('should map plan to Notion page title and description', () => {
    const blocks = mapPlanToNotionBlocks(mockPlan as any);

    expect(blocks).toHaveLength(3); // Title, divider, weekly hours
    expect(blocks[0].type).toBe('heading_1');
    expect(blocks[0].heading_1.rich_text[0].text.content).toBe(
      'TypeScript Fundamentals'
    );
    expect(blocks[1].type).toBe('divider');
    expect(blocks[2].type).toBe('callout');
    expect(blocks[2].callout.rich_text[0].text.content).toContain(
      '5 hours per week'
    );
  });

  it('should map module to Notion heading and tasks', () => {
    const blocks = mapModuleToBlocks(mockModule);

    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[0].type).toBe('heading_2');
    expect(blocks[0].heading_2.rich_text[0].text.content).toBe('Basic Types');

    // Should have task as to-do block
    const taskBlock = blocks.find((b) => b.type === 'to_do');
    expect(taskBlock).toBeDefined();
    expect(taskBlock.to_do.rich_text[0].text.content).toContain(
      'Understand primitive types'
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run tests/unit/integrations/notion-mapper.spec.ts
```

Expected: FAIL - Module not found

**Step 3: Implement mapper functions**

Create `src/lib/integrations/notion/mapper.ts`:

```typescript
import type { BlockObjectRequest } from '@notionhq/client/build/src/api-endpoints';

interface LearningPlan {
  topic: string;
  skillLevel: string;
  weeklyHours: number;
}

interface Module {
  title: string;
  description: string | null;
  estimatedMinutes: number;
  tasks: Task[];
}

interface Task {
  title: string;
  description: string | null;
  durationMinutes: number;
}

export function mapPlanToNotionBlocks(
  plan: LearningPlan
): BlockObjectRequest[] {
  const blocks: BlockObjectRequest[] = [];

  // Title
  blocks.push({
    type: 'heading_1',
    heading_1: {
      rich_text: [{ type: 'text', text: { content: plan.topic } }],
      color: 'default',
    },
  });

  // Divider
  blocks.push({ type: 'divider', divider: {} });

  // Weekly hours callout
  blocks.push({
    type: 'callout',
    callout: {
      rich_text: [
        {
          type: 'text',
          text: {
            content: `📅 ${plan.weeklyHours} hours per week | Skill level: ${plan.skillLevel}`,
          },
        },
      ],
      icon: { type: 'emoji', emoji: '📚' },
      color: 'blue_background',
    },
  });

  return blocks;
}

export function mapModuleToBlocks(module: Module): BlockObjectRequest[] {
  const blocks: BlockObjectRequest[] = [];

  // Module heading
  blocks.push({
    type: 'heading_2',
    heading_2: {
      rich_text: [{ type: 'text', text: { content: module.title } }],
      color: 'default',
    },
  });

  // Module description
  if (module.description) {
    blocks.push({
      type: 'paragraph',
      paragraph: {
        rich_text: [
          {
            type: 'text',
            text: { content: module.description },
            annotations: { italic: true },
          },
        ],
        color: 'default',
      },
    });
  }

  // Estimated time
  blocks.push({
    type: 'paragraph',
    paragraph: {
      rich_text: [
        {
          type: 'text',
          text: {
            content: `⏱️ Estimated time: ${module.estimatedMinutes} minutes`,
          },
          annotations: { bold: true },
        },
      ],
      color: 'default',
    },
  });

  // Tasks as to-do items
  module.tasks.forEach((task) => {
    blocks.push({
      type: 'to_do',
      to_do: {
        rich_text: [
          {
            type: 'text',
            text: { content: `${task.title} (${task.durationMinutes} min)` },
          },
        ],
        checked: false,
        color: 'default',
      },
    });

    // Task description as nested paragraph
    if (task.description) {
      blocks.push({
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: task.description } }],
          color: 'gray',
        },
      });
    }
  });

  return blocks;
}

export function mapFullPlanToBlocks(
  plan: LearningPlan & { modules: Module[] }
): BlockObjectRequest[] {
  const blocks: BlockObjectRequest[] = [];

  // Add plan header
  blocks.push(...mapPlanToNotionBlocks(plan));

  // Add each module
  plan.modules.forEach((module, index) => {
    if (index > 0) {
      blocks.push({ type: 'divider', divider: {} });
    }
    blocks.push(...mapModuleToBlocks(module));
  });

  return blocks;
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run tests/unit/integrations/notion-mapper.spec.ts
```

Expected: PASS

**Step 5: Install Notion SDK**

Run:

```bash
pnpm add @notionhq/client
```

Expected: Package installed successfully

**Step 6: Commit**

```bash
git add src/lib/integrations/notion/mapper.ts tests/unit/integrations/notion-mapper.spec.ts package.json pnpm-lock.yaml
git commit -m "feat(notion): add plan-to-Notion block mapper

Implement data mapping from learning plan structure to Notion API blocks.
Maps modules to headings, tasks to to-do items, and plan metadata to
callouts.

Changes:
- Add mapPlanToNotionBlocks for plan header
- Add mapModuleToBlocks for module sections
- Add mapFullPlanToBlocks for complete plan export
- Install @notionhq/client SDK

New files:
- src/lib/integrations/notion/mapper.ts
- tests/unit/integrations/notion-mapper.spec.ts

Tests cover:
- Plan header with title and weekly hours
- Module sections with tasks as to-dos"
```

---

## Task 8: Notion Integration - Client with Rate Limiting

**Files:**

- Create: `src/lib/integrations/notion/client.ts`
- Create: `tests/unit/integrations/notion-client.spec.ts`

**Step 1: Write failing test for rate-limited client**

Create `tests/unit/integrations/notion-client.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotionClient } from '@/lib/integrations/notion/client';

describe('NotionClient Rate Limiting', () => {
  let client: NotionClient;

  beforeEach(() => {
    client = new NotionClient('test_access_token');
  });

  it('should enforce 3 requests per second limit', async () => {
    const start = Date.now();

    // Queue 6 requests
    const promises = Array(6)
      .fill(null)
      .map(() =>
        client.createPage({
          parent: { page_id: 'test' },
          properties: {},
        })
      );

    await Promise.all(promises);
    const elapsed = Date.now() - start;

    // 6 requests at 3 req/sec = minimum 2 seconds
    expect(elapsed).toBeGreaterThanOrEqual(1800); // Allow some tolerance
  });

  it('should handle API errors with retry', async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'page_123' }),
      });

    global.fetch = mockFetch;

    const result = await client.createPage({
      parent: { page_id: 'test' },
      properties: {},
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.id).toBe('page_123');
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run tests/unit/integrations/notion-client.spec.ts
```

Expected: FAIL - Module not found

**Step 3: Implement rate-limited Notion client**

Create `src/lib/integrations/notion/client.ts`:

```typescript
import { Client } from '@notionhq/client';
import type {
  CreatePageParameters,
  UpdatePageParameters,
} from '@notionhq/client/build/src/api-endpoints';
import pRetry from 'p-retry';

const MAX_REQUESTS_PER_SECOND = 3;
const REQUEST_INTERVAL = 1000 / MAX_REQUESTS_PER_SECOND;

export class NotionClient {
  private client: Client;
  private requestQueue: Promise<void> = Promise.resolve();
  private lastRequestTime = 0;

  constructor(accessToken: string) {
    this.client = new Client({ auth: accessToken });
  }

  private async rateLimit(): Promise<void> {
    this.requestQueue = this.requestQueue.then(async () => {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;

      if (timeSinceLastRequest < REQUEST_INTERVAL) {
        await new Promise((resolve) =>
          setTimeout(resolve, REQUEST_INTERVAL - timeSinceLastRequest)
        );
      }

      this.lastRequestTime = Date.now();
    });

    return this.requestQueue;
  }

  async createPage(params: CreatePageParameters): Promise<any> {
    await this.rateLimit();

    return pRetry(
      async () => {
        const response = await this.client.pages.create(params);
        return response;
      },
      {
        retries: 3,
        minTimeout: 1000,
        maxTimeout: 5000,
        onFailedAttempt: (error) => {
          console.warn(
            `Notion API attempt ${error.attemptNumber} failed:`,
            error.message
          );
        },
      }
    );
  }

  async updatePage(params: UpdatePageParameters): Promise<any> {
    await this.rateLimit();

    return pRetry(
      async () => {
        const response = await this.client.pages.update(params);
        return response;
      },
      {
        retries: 3,
        minTimeout: 1000,
        maxTimeout: 5000,
      }
    );
  }

  async appendBlocks(pageId: string, blocks: any[]): Promise<any> {
    await this.rateLimit();

    return pRetry(
      async () => {
        const response = await this.client.blocks.children.append({
          block_id: pageId,
          children: blocks,
        });
        return response;
      },
      {
        retries: 3,
        minTimeout: 1000,
        maxTimeout: 5000,
      }
    );
  }
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run tests/unit/integrations/notion-client.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/integrations/notion/client.ts tests/unit/integrations/notion-client.spec.ts
git commit -m "feat(notion): add rate-limited client with retry logic

Implement Notion API client with 3 req/sec rate limiting and exponential
backoff retry. Queues requests to respect API limits.

Changes:
- Add NotionClient class with rate limiting queue
- Add retry logic with p-retry (3 attempts, exponential backoff)
- Support createPage, updatePage, appendBlocks operations

New files:
- src/lib/integrations/notion/client.ts
- tests/unit/integrations/notion-client.spec.ts

Tests cover:
- Rate limit enforcement (3 req/sec)
- Retry on transient failures"
```

---

## Task 9: Notion Integration - Export Endpoint

**Files:**

- Create: `src/app/api/v1/integrations/notion/export/route.ts`
- Create: `src/lib/integrations/notion/sync.ts`
- Create: `tests/integration/notion-export.spec.ts`

**Step 1: Write failing test for export endpoint**

Create `tests/integration/notion-export.spec.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST } from '@/app/api/v1/integrations/notion/export/route';
import { db } from '@/lib/db/drizzle';
import {
  users,
  learningPlans,
  modules,
  tasks,
  integrationTokens,
} from '@/lib/db/schema';
import { storeOAuthTokens } from '@/lib/integrations/oauth';

describe('Notion Export API', () => {
  let testUserId: string;
  let testPlanId: string;

  beforeEach(async () => {
    await db.delete(tasks);
    await db.delete(modules);
    await db.delete(learningPlans);
    await db.delete(integrationTokens);
    await db.delete(users);

    const [user] = await db
      .insert(users)
      .values({
        clerkUserId: 'test_clerk',
        email: 'test@example.com',
      })
      .returning();
    testUserId = user.id;

    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId: testUserId,
        topic: 'Test Topic',
        skillLevel: 'beginner',
        weeklyHours: 5,
        generationStatus: 'ready',
      })
      .returning();
    testPlanId = plan.id;

    // Store Notion token
    await storeOAuthTokens({
      userId: testUserId,
      provider: 'notion',
      tokenData: { accessToken: 'test_token', scope: 'notion' },
    });
  });

  it('should export plan to Notion and return page ID', async () => {
    // Mock Notion API
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'notion_page_123' }),
    });

    const request = new Request(
      'http://localhost:3000/api/v1/integrations/notion/export',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: testPlanId }),
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.notionPageId).toBe('notion_page_123');
  });

  it('should return 401 if no Notion token found', async () => {
    await db.delete(integrationTokens);

    const request = new Request(
      'http://localhost:3000/api/v1/integrations/notion/export',
      {
        method: 'POST',
        body: JSON.stringify({ planId: testPlanId }),
      }
    );

    const response = await POST(request);
    expect(response.status).toBe(401);
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run tests/integration/notion-export.spec.ts
```

Expected: FAIL - Module not found

**Step 3: Create sync utility module**

Create `src/lib/integrations/notion/sync.ts`:

```typescript
import { db } from '@/lib/db/drizzle';
import {
  learningPlans,
  modules,
  tasks,
  notionSyncState,
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { NotionClient } from './client';
import { mapFullPlanToBlocks } from './mapper';
import { createHash } from 'node:crypto';

export async function exportPlanToNotion(
  planId: string,
  accessToken: string
): Promise<string> {
  // Fetch plan with modules and tasks
  const [plan] = await db
    .select()
    .from(learningPlans)
    .where(eq(learningPlans.id, planId))
    .limit(1);

  if (!plan) {
    throw new Error('Plan not found');
  }

  const planModules = await db
    .select()
    .from(modules)
    .where(eq(modules.planId, planId))
    .orderBy(modules.order);

  const planTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.moduleId, planModules[0]?.id ?? ''));

  // Combine data
  const fullPlan = {
    ...plan,
    modules: planModules.map((mod) => ({
      ...mod,
      tasks: planTasks.filter((t) => t.moduleId === mod.id),
    })),
  };

  // Map to Notion blocks
  const blocks = mapFullPlanToBlocks(fullPlan as any);

  // Create Notion page
  const client = new NotionClient(accessToken);
  const notionPage = await client.createPage({
    parent: {
      type: 'page_id',
      page_id: process.env.NOTION_PARENT_PAGE_ID || '',
    },
    properties: {
      title: {
        title: [{ type: 'text', text: { content: plan.topic } }],
      },
    },
    children: blocks,
  });

  // Calculate content hash for delta sync
  const contentHash = createHash('sha256')
    .update(JSON.stringify(fullPlan))
    .digest('hex');

  // Store sync state
  await db.insert(notionSyncState).values({
    planId,
    userId: plan.userId,
    notionPageId: notionPage.id,
    syncHash: contentHash,
    lastSyncedAt: new Date(),
  });

  return notionPage.id;
}
```

**Step 4: Create export API endpoint**

Create `src/app/api/v1/integrations/notion/export/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getOAuthTokens } from '@/lib/integrations/oauth';
import { exportPlanToNotion } from '@/lib/integrations/notion/sync';

export async function POST(request: NextRequest) {
  const { userId: clerkUserId } = await auth();

  if (!clerkUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Get Notion token
  const notionTokens = await getOAuthTokens(user.id, 'notion');
  if (!notionTokens) {
    return NextResponse.json(
      { error: 'Notion not connected' },
      { status: 401 }
    );
  }

  const { planId } = await request.json();

  if (!planId) {
    return NextResponse.json({ error: 'planId required' }, { status: 400 });
  }

  try {
    const notionPageId = await exportPlanToNotion(
      planId,
      notionTokens.accessToken
    );

    return NextResponse.json({ notionPageId, success: true });
  } catch (error) {
    console.error('Notion export failed:', error);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
```

**Step 5: Run test to verify it passes**

Run:

```bash
pnpm vitest run tests/integration/notion-export.spec.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/app/api/v1/integrations/notion/export/ src/lib/integrations/notion/sync.ts tests/integration/notion-export.spec.ts
git commit -m "feat(notion): add full plan export endpoint

Implement POST /api/v1/integrations/notion/export to create Notion page
from learning plan. Calculates content hash for delta sync tracking.

Changes:
- Add exportPlanToNotion utility function
- Add POST /api/v1/integrations/notion/export endpoint
- Store sync state with SHA-256 content hash
- Verify Notion OAuth token before export

New files:
- src/app/api/v1/integrations/notion/export/route.ts
- src/lib/integrations/notion/sync.ts
- tests/integration/notion-export.spec.ts

Tests cover:
- Successful export with page ID returned
- 401 error when no Notion token found"
```

---

## Task 10: Notion Integration - Delta Sync

**Files:**

- Modify: `src/lib/integrations/notion/sync.ts`
- Create: `tests/integration/notion-delta-sync.spec.ts`

**Step 1: Write failing test for delta sync**

Create `tests/integration/notion-delta-sync.spec.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/lib/db/drizzle';
import { notionSyncState, learningPlans } from '@/lib/db/schema';
import { deltaSync PlanToNotion } from '@/lib/integrations/notion/sync';

describe('Notion Delta Sync', () => {
  it('should detect changes via content hash', async () => {
    const planId = 'test-plan-123';
    const userId = 'test-user-123';

    // Create initial sync state
    await db.insert(notionSyncState).values({
      planId,
      userId,
      notionPageId: 'notion_page_123',
      syncHash: 'old_hash',
      lastSyncedAt: new Date('2025-01-01'),
    });

    // Mock Notion API
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'notion_page_123' }),
    });

    const hasChanges = await deltaSyncPlanToNotion(planId, 'test_token');

    expect(hasChanges).toBe(true);
  });

  it('should skip sync if no changes detected', async () => {
    const planId = 'test-plan-456';
    const userId = 'test-user-456';

    // Create sync state with current hash
    const currentHash = 'current_hash_123';
    await db.insert(notionSyncState).values({
      planId,
      userId,
      notionPageId: 'notion_page_456',
      syncHash: currentHash,
      lastSyncedAt: new Date(),
    });

    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    const hasChanges = await deltaSyncPlanToNotion(planId, 'test_token');

    expect(hasChanges).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run tests/integration/notion-delta-sync.spec.ts
```

Expected: FAIL - Function not found

**Step 3: Add delta sync function**

Edit `src/lib/integrations/notion/sync.ts`, add:

```typescript
import { createHash } from 'node:crypto';

function calculatePlanHash(plan: any): string {
  return createHash('sha256').update(JSON.stringify(plan)).digest('hex');
}

export async function deltaSyncPlanToNotion(
  planId: string,
  accessToken: string
): Promise<boolean> {
  // Fetch current plan
  const [plan] = await db
    .select()
    .from(learningPlans)
    .where(eq(learningPlans.id, planId))
    .limit(1);

  if (!plan) {
    throw new Error('Plan not found');
  }

  const planModules = await db
    .select()
    .from(modules)
    .where(eq(modules.planId, planId))
    .orderBy(modules.order);

  const planTasks = await db.select().from(tasks);

  const fullPlan = {
    ...plan,
    modules: planModules.map((mod) => ({
      ...mod,
      tasks: planTasks.filter((t) => t.moduleId === mod.id),
    })),
  };

  const currentHash = calculatePlanHash(fullPlan);

  // Check existing sync state
  const [syncState] = await db
    .select()
    .from(notionSyncState)
    .where(eq(notionSyncState.planId, planId))
    .limit(1);

  if (!syncState) {
    // No previous sync, do full export
    await exportPlanToNotion(planId, accessToken);
    return true;
  }

  if (syncState.syncHash === currentHash) {
    // No changes detected
    return false;
  }

  // Changes detected, update Notion page
  const blocks = mapFullPlanToBlocks(fullPlan as any);
  const client = new NotionClient(accessToken);

  // Clear existing blocks and append new ones
  // (Notion doesn't have a replace operation, so we update the page)
  await client.updatePage({
    page_id: syncState.notionPageId,
    properties: {
      title: {
        title: [{ type: 'text', text: { content: plan.topic } }],
      },
    },
  });

  // Append updated blocks
  await client.appendBlocks(syncState.notionPageId, blocks);

  // Update sync state
  await db
    .update(notionSyncState)
    .set({
      syncHash: currentHash,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(notionSyncState.planId, planId));

  return true;
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run tests/integration/notion-delta-sync.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/integrations/notion/sync.ts tests/integration/notion-delta-sync.spec.ts
git commit -m "feat(notion): add delta sync with hash-based change detection

Implement delta sync to detect plan changes via SHA-256 content hash.
Only syncs to Notion when changes detected, saving API calls.

Changes:
- Add calculatePlanHash utility
- Add deltaSyncPlanToNotion function
- Compare current hash with stored hash
- Update Notion page only if changes detected

New files:
- tests/integration/notion-delta-sync.spec.ts

Tests cover:
- Change detection via hash comparison
- Skip sync when no changes detected"
```

---

## Task 11: Google Calendar Integration - OAuth Flow

**API Key Note:** Before implementing this task, ensure you have:

- Created Google Cloud project and enabled Calendar API
- Created OAuth 2.0 credentials
- Added GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI to `.env.local` and `.env.test`

**Files:**

- Create: `src/app/api/v1/auth/google/route.ts`
- Create: `src/app/api/v1/auth/google/callback/route.ts`
- Create: `tests/integration/google-oauth.spec.ts`

**Step 1: Write failing test for Google OAuth**

Create `tests/integration/google-oauth.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { GET as googleAuthGET } from '@/app/api/v1/auth/google/route';

describe('Google OAuth Flow', () => {
  it('should redirect to Google authorization URL', async () => {
    const request = new Request('http://localhost:3000/api/v1/auth/google');
    const response = await googleAuthGET(request);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toContain(
      'accounts.google.com/o/oauth2/v2/auth'
    );
    expect(response.headers.get('Location')).toContain('scope=');
    expect(response.headers.get('Location')).toContain('calendar');
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run tests/integration/google-oauth.spec.ts
```

Expected: FAIL

**Step 3: Install googleapis**

Run:

```bash
pnpm add googleapis
```

Expected: Package installed

**Step 4: Implement Google OAuth endpoints**

Create `src/app/api/v1/auth/google/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { google } from 'googleapis';

export async function GET(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
  ];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    state: userId,
    prompt: 'consent', // Force consent to get refresh token
  });

  return NextResponse.redirect(authUrl);
}
```

Create `src/app/api/v1/auth/google/callback/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { storeOAuthTokens } from '@/lib/integrations/oauth';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // userId
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings/integrations?error=${error}`, request.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/settings/integrations?error=missing_parameters', request.url)
    );
  }

  // Verify user
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, state))
    .limit(1);

  if (!user) {
    return NextResponse.redirect(
      new URL('/settings/integrations?error=invalid_user', request.url)
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  try {
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token) {
      throw new Error('No access token received');
    }

    await storeOAuthTokens({
      userId: user.id,
      provider: 'google_calendar',
      tokenData: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : undefined,
        scope: tokens.scope || 'calendar',
      },
    });

    return NextResponse.redirect(
      new URL('/settings/integrations?google=connected', request.url)
    );
  } catch (err) {
    console.error('Google token exchange failed:', err);
    return NextResponse.redirect(
      new URL('/settings/integrations?error=token_exchange_failed', request.url)
    );
  }
}
```

**Step 5: Run test to verify it passes**

Run:

```bash
pnpm vitest run tests/integration/google-oauth.spec.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/app/api/v1/auth/google/ tests/integration/google-oauth.spec.ts package.json pnpm-lock.yaml
git commit -m "feat(google): implement OAuth 2.0 authorization flow

Add Google Calendar OAuth endpoints with offline access for refresh
tokens. Exchanges authorization code and stores encrypted tokens.

Changes:
- Add GET /api/v1/auth/google (redirect to Google OAuth)
- Add GET /api/v1/auth/google/callback (token exchange)
- Request offline access and calendar scopes
- Install googleapis package

New files:
- src/app/api/v1/auth/google/route.ts
- src/app/api/v1/auth/google/callback/route.ts
- tests/integration/google-oauth.spec.ts

Tests cover:
- Authorization redirect with calendar scopes"
```

---

## Task 12: Google Calendar - Event Mapper

**Files:**

- Create: `src/lib/integrations/google-calendar/mapper.ts`
- Create: `tests/unit/integrations/google-calendar-mapper.spec.ts`

**Step 1: Write failing test**

Create `tests/unit/integrations/google-calendar-mapper.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mapTaskToCalendarEvent } from '@/lib/integrations/google-calendar/mapper';
import type { Task } from '@/lib/db/schema';

describe('Google Calendar Event Mapper', () => {
  const mockTask: Task = {
    id: 'task-123',
    moduleId: 'module-123',
    title: 'Learn TypeScript basics',
    description: 'Study primitive types and interfaces',
    order: 1,
    durationMinutes: 60,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('should map task to calendar event with reminder', () => {
    const startTime = new Date('2025-06-01T10:00:00Z');
    const event = mapTaskToCalendarEvent(mockTask, startTime);

    expect(event.summary).toBe('Learn TypeScript basics');
    expect(event.description).toBe('Study primitive types and interfaces');
    expect(event.start.dateTime).toBe('2025-06-01T10:00:00.000Z');
    expect(event.end.dateTime).toBe('2025-06-01T11:00:00.000Z');
    expect(event.reminders.useDefault).toBe(false);
    expect(event.reminders.overrides).toHaveLength(1);
    expect(event.reminders.overrides[0].method).toBe('popup');
    expect(event.reminders.overrides[0].minutes).toBe(15);
  });

  it('should handle tasks without description', () => {
    const taskNoDesc = { ...mockTask, description: null };
    const event = mapTaskToCalendarEvent(taskNoDesc, new Date());

    expect(event.description).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run tests/unit/integrations/google-calendar-mapper.spec.ts
```

Expected: FAIL

**Step 3: Implement mapper**

Create `src/lib/integrations/google-calendar/mapper.ts`:

```typescript
import type { calendar_v3 } from 'googleapis';

interface Task {
  title: string;
  description: string | null;
  durationMinutes: number;
}

export function mapTaskToCalendarEvent(
  task: Task,
  startTime: Date
): calendar_v3.Schema$Event {
  const endTime = new Date(
    startTime.getTime() + task.durationMinutes * 60 * 1000
  );

  const event: calendar_v3.Schema$Event = {
    summary: task.title,
    description: task.description || undefined,
    start: {
      dateTime: startTime.toISOString(),
      timeZone: 'UTC',
    },
    end: {
      dateTime: endTime.toISOString(),
      timeZone: 'UTC',
    },
    reminders: {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: 15 }],
    },
  };

  return event;
}

export function generateSchedule(
  tasks: Task[],
  weeklyHours: number
): Map<string, Date> {
  const schedule = new Map<string, Date>();
  const hoursPerDay = weeklyHours / 7;
  const minutesPerDay = hoursPerDay * 60;

  let currentDate = new Date();
  currentDate.setHours(9, 0, 0, 0); // Start at 9 AM
  let minutesUsedToday = 0;

  tasks.forEach((task) => {
    if (minutesUsedToday + task.durationMinutes > minutesPerDay) {
      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(9, 0, 0, 0);
      minutesUsedToday = 0;
    }

    schedule.set(task.id, new Date(currentDate));

    currentDate = new Date(
      currentDate.getTime() + task.durationMinutes * 60 * 1000
    );
    minutesUsedToday += task.durationMinutes;
  });

  return schedule;
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run tests/unit/integrations/google-calendar-mapper.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/integrations/google-calendar/mapper.ts tests/unit/integrations/google-calendar-mapper.spec.ts
git commit -m "feat(google): add task-to-calendar event mapper

Implement mapping from learning tasks to Google Calendar events with
start/end times, reminders, and intelligent scheduling.

Changes:
- Add mapTaskToCalendarEvent with 15-min popup reminder
- Add generateSchedule to distribute tasks across days
- Handle timezone (UTC default)

New files:
- src/lib/integrations/google-calendar/mapper.ts
- tests/unit/integrations/google-calendar-mapper.spec.ts

Tests cover:
- Event creation with reminders
- Tasks without description"
```

---

## Task 13: Google Calendar - Sync Endpoint

**Files:**

- Create: `src/lib/integrations/google-calendar/sync.ts`
- Create: `src/app/api/v1/integrations/google-calendar/sync/route.ts`
- Create: `tests/integration/google-calendar-sync.spec.ts`

**Step 1: Write failing test**

Create `tests/integration/google-calendar-sync.spec.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST } from '@/app/api/v1/integrations/google-calendar/sync/route';
import { db } from '@/lib/db/drizzle';
import { users, learningPlans, modules, tasks } from '@/lib/db/schema';
import { storeOAuthTokens } from '@/lib/integrations/oauth';

describe('Google Calendar Sync API', () => {
  it('should create calendar events for plan tasks', async () => {
    // Setup test data (user, plan, modules, tasks)
    // Mock Google Calendar API
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'event_123', status: 'confirmed' }),
    });

    const request = new Request(
      'http://localhost:3000/api/v1/integrations/google-calendar/sync',
      {
        method: 'POST',
        body: JSON.stringify({ planId: 'test-plan' }),
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.eventsCreated).toBeGreaterThan(0);
  });
});
```

**Step 2: Implement sync function**

Create `src/lib/integrations/google-calendar/sync.ts`:

```typescript
import { google } from 'googleapis';
import { db } from '@/lib/db/drizzle';
import {
  learningPlans,
  modules,
  tasks,
  taskCalendarEvents,
  googleCalendarSyncState,
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { mapTaskToCalendarEvent, generateSchedule } from './mapper';

export async function syncPlanToGoogleCalendar(
  planId: string,
  accessToken: string,
  refreshToken?: string
): Promise<number> {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  // Fetch plan data
  const [plan] = await db
    .select()
    .from(learningPlans)
    .where(eq(learningPlans.id, planId))
    .limit(1);

  if (!plan) {
    throw new Error('Plan not found');
  }

  const planModules = await db
    .select()
    .from(modules)
    .where(eq(modules.planId, planId))
    .orderBy(modules.order);

  const planTasks = await db.select().from(tasks);
  const allTasks = planModules.flatMap((mod) =>
    planTasks.filter((t) => t.moduleId === mod.id)
  );

  // Generate schedule
  const schedule = generateSchedule(allTasks, plan.weeklyHours);

  let eventsCreated = 0;

  for (const task of allTasks) {
    const startTime = schedule.get(task.id);
    if (!startTime) continue;

    const eventData = mapTaskToCalendarEvent(task, startTime);

    const { data: event } = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: eventData,
    });

    // Store mapping
    await db.insert(taskCalendarEvents).values({
      taskId: task.id,
      userId: plan.userId,
      calendarEventId: event.id!,
      calendarId: 'primary',
    });

    eventsCreated++;
  }

  // Store sync state
  await db.insert(googleCalendarSyncState).values({
    planId,
    userId: plan.userId,
    calendarId: 'primary',
    lastSyncedAt: new Date(),
  });

  return eventsCreated;
}
```

**Step 3: Create API endpoint**

Create `src/app/api/v1/integrations/google-calendar/sync/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getOAuthTokens } from '@/lib/integrations/oauth';
import { syncPlanToGoogleCalendar } from '@/lib/integrations/google-calendar/sync';

export async function POST(request: NextRequest) {
  const { userId: clerkUserId } = await auth();

  if (!clerkUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const googleTokens = await getOAuthTokens(user.id, 'google_calendar');
  if (!googleTokens) {
    return NextResponse.json(
      { error: 'Google Calendar not connected' },
      { status: 401 }
    );
  }

  const { planId } = await request.json();

  if (!planId) {
    return NextResponse.json({ error: 'planId required' }, { status: 400 });
  }

  try {
    const eventsCreated = await syncPlanToGoogleCalendar(
      planId,
      googleTokens.accessToken,
      googleTokens.refreshToken
    );

    return NextResponse.json({ eventsCreated, success: true });
  } catch (error) {
    console.error('Google Calendar sync failed:', error);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
```

**Step 4: Run test**

Run:

```bash
pnpm vitest run tests/integration/google-calendar-sync.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/integrations/google-calendar/ src/app/api/v1/integrations/google-calendar/ tests/integration/google-calendar-sync.spec.ts
git commit -m "feat(google): add calendar sync endpoint

Implement sync functionality to create Google Calendar events from
learning plan tasks with intelligent scheduling.

Changes:
- Add syncPlanToGoogleCalendar function
- Add POST /api/v1/integrations/google-calendar/sync endpoint
- Store task-to-event mappings in database
- Use generateSchedule for time distribution

New files:
- src/lib/integrations/google-calendar/sync.ts
- src/app/api/v1/integrations/google-calendar/sync/route.ts
- tests/integration/google-calendar-sync.spec.ts

Tests cover:
- Event creation for all plan tasks"
```

---

## Task 14: Tier Gates and Usage Tracking

**Files:**

- Modify: `src/lib/db/usage.ts`
- Modify: `src/app/api/v1/integrations/notion/export/route.ts`
- Modify: `src/app/api/v1/integrations/google-calendar/sync/route.ts`
- Create: `tests/integration/tier-gates.spec.ts`

**Step 1: Write failing test**

Create `tests/integration/tier-gates.spec.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { checkExportQuota, incrementExportUsage } from '@/lib/db/usage';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';

describe('Export Tier Gates', () => {
  let userId: string;

  beforeEach(async () => {
    await db.delete(users);
    const [user] = await db
      .insert(users)
      .values({
        clerkUserId: 'test_clerk',
        email: 'test@example.com',
        subscriptionTier: 'free',
      })
      .returning();
    userId = user.id;
  });

  it('should allow exports within free tier limit', async () => {
    const allowed = await checkExportQuota(userId, 'free');
    expect(allowed).toBe(true);
  });

  it('should block exports when free tier limit exceeded', async () => {
    // Simulate 2 exports (free limit)
    await incrementExportUsage(userId);
    await incrementExportUsage(userId);

    const allowed = await checkExportQuota(userId, 'free');
    expect(allowed).toBe(false);
  });

  it('should allow unlimited exports for pro tier', async () => {
    await db
      .update(users)
      .set({ subscriptionTier: 'pro' })
      .where(eq(users.id, userId));

    // Simulate 100 exports
    for (let i = 0; i < 100; i++) {
      await incrementExportUsage(userId);
    }

    const allowed = await checkExportQuota(userId, 'pro');
    expect(allowed).toBe(true);
  });
});
```

**Step 2: Implement usage tracking**

Edit `src/lib/db/usage.ts`, add:

```typescript
import { db } from './drizzle';
import { users } from './schema';
import { eq, sql } from 'drizzle-orm';

const TIER_LIMITS = {
  free: 2,
  starter: 10,
  pro: Infinity,
};

export async function checkExportQuota(
  userId: string,
  tier: 'free' | 'starter' | 'pro'
): Promise<boolean> {
  const limit = TIER_LIMITS[tier];

  if (limit === Infinity) {
    return true;
  }

  // Get current month's export count
  const [result] = await db
    .select({ exportCount: users.monthlyExportCount })
    .from(users)
    .where(eq(users.id, userId));

  return (result?.exportCount ?? 0) < limit;
}

export async function incrementExportUsage(userId: string): Promise<void> {
  await db
    .update(users)
    .set({
      monthlyExportCount: sql`${users.monthlyExportCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export async function resetMonthlyExportCounts(): Promise<void> {
  await db.update(users).set({ monthlyExportCount: 0 });
}
```

**Step 3: Add tier gates to export endpoints**

Edit `src/app/api/v1/integrations/notion/export/route.ts`:

```typescript
import { checkExportQuota, incrementExportUsage } from '@/lib/db/usage';

// Add before exportPlanToNotion call:
const canExport = await checkExportQuota(user.id, user.subscriptionTier);
if (!canExport) {
  return NextResponse.json(
    {
      error: 'Export quota exceeded',
      message: 'Upgrade your plan to export more learning plans',
    },
    { status: 403 }
  );
}

// After successful export:
await incrementExportUsage(user.id);
```

Edit `src/app/api/v1/integrations/google-calendar/sync/route.ts` similarly.

**Step 4: Run test**

Run:

```bash
pnpm vitest run tests/integration/tier-gates.spec.ts
```

Expected: PASS

**Step 5: Update schema for export count**

Edit `src/lib/db/schema.ts`, add to users table:

```typescript
monthlyExportCount: integer('monthly_export_count').notNull().default(0),
```

**Step 6: Generate and apply migration**

Run:

```bash
pnpm db:generate && pnpm db:push && pnpm db:push:test
```

**Step 7: Commit**

```bash
git add src/lib/db/usage.ts src/lib/db/schema.ts src/app/api/v1/integrations/ tests/integration/tier-gates.spec.ts src/lib/db/migrations/
git commit -m "feat(integrations): add tier-based export quotas

Implement usage tracking and tier gates for Notion/Google Calendar
exports. Free tier limited to 2/month, starter 10/month, pro unlimited.

Changes:
- Add checkExportQuota and incrementExportUsage functions
- Add monthlyExportCount to users table
- Enforce quotas in export endpoints
- Return 403 with upgrade message when quota exceeded

New files:
- tests/integration/tier-gates.spec.ts

Tests cover:
- Free tier limit enforcement
- Pro tier unlimited exports
- Usage increment tracking"
```

---

## Task 15: UI Export Buttons Component

**Files:**

- Create: `src/components/plans/ExportButtons.tsx`
- Create: `tests/unit/components/ExportButtons.spec.tsx`

**Step 1: Write failing test**

Create `tests/unit/components/ExportButtons.spec.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExportButtons } from '@/components/plans/ExportButtons';

describe('ExportButtons', () => {
  it('should render Notion and Google Calendar buttons', () => {
    render(<ExportButtons planId="test-plan-123" />);

    expect(screen.getByText(/Export to Notion/i)).toBeInTheDocument();
    expect(screen.getByText(/Add to Google Calendar/i)).toBeInTheDocument();
  });

  it('should show loading state when exporting', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(<ExportButtons planId="test-plan-123" />);

    const notionButton = screen.getByText(/Export to Notion/i);
    fireEvent.click(notionButton);

    await waitFor(() => {
      expect(screen.getByText(/Exporting/i)).toBeInTheDocument();
    });
  });

  it('should show error message on export failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Export failed' }),
    });

    render(<ExportButtons planId="test-plan-123" />);

    const notionButton = screen.getByText(/Export to Notion/i);
    fireEvent.click(notionButton);

    await waitFor(() => {
      expect(screen.getByText(/Export failed/i)).toBeInTheDocument();
    });
  });
});
```

**Step 2: Implement component**

Create `src/components/plans/ExportButtons.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { toast } from 'sonner';

interface ExportButtonsProps {
  planId: string;
}

export function ExportButtons({ planId }: ExportButtonsProps) {
  const [isExportingNotion, setIsExportingNotion] = useState(false);
  const [isExportingCalendar, setIsExportingCalendar] = useState(false);

  async function handleNotionExport() {
    setIsExportingNotion(true);

    try {
      const response = await fetch('/api/v1/integrations/notion/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403) {
          toast.error('Export limit reached', {
            description: data.message || 'Upgrade your plan to export more',
          });
        } else {
          toast.error(data.error || 'Export failed');
        }
        return;
      }

      toast.success('Exported to Notion', {
        description: 'Your learning plan is now in Notion!',
      });
    } catch (error) {
      toast.error('Export failed');
    } finally {
      setIsExportingNotion(false);
    }
  }

  async function handleCalendarSync() {
    setIsExportingCalendar(true);

    try {
      const response = await fetch('/api/v1/integrations/google-calendar/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403) {
          toast.error('Sync limit reached', {
            description: data.message || 'Upgrade your plan to sync more',
          });
        } else {
          toast.error(data.error || 'Sync failed');
        }
        return;
      }

      toast.success('Added to Google Calendar', {
        description: `${data.eventsCreated} events created`,
      });
    } catch (error) {
      toast.error('Sync failed');
    } finally {
      setIsExportingCalendar(false);
    }
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={handleNotionExport}
        disabled={isExportingNotion}
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {isExportingNotion ? 'Exporting...' : 'Export to Notion'}
      </button>

      <button
        onClick={handleCalendarSync}
        disabled={isExportingCalendar}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isExportingCalendar ? 'Syncing...' : 'Add to Google Calendar'}
      </button>
    </div>
  );
}
```

**Step 3: Run test**

Run:

```bash
pnpm vitest run tests/unit/components/ExportButtons.spec.tsx
```

Expected: PASS

**Step 4: Commit**

```bash
git add src/components/plans/ExportButtons.tsx tests/unit/components/ExportButtons.spec.tsx
git commit -m "feat(ui): add export buttons component

Implement UI component for Notion export and Google Calendar sync with
loading states, error handling, and tier gate messaging.

Changes:
- Add ExportButtons component with async handlers
- Show loading states during export/sync
- Display toast notifications for success/error
- Handle 403 quota errors with upgrade messaging

New files:
- src/components/plans/ExportButtons.tsx
- tests/unit/components/ExportButtons.spec.tsx

Tests cover:
- Button rendering
- Loading states
- Error handling"
```

---

## Task 16: End-to-End Tests

**Files:**

- Create: `tests/e2e/notion-export-flow.spec.ts`
- Create: `tests/e2e/google-calendar-sync-flow.spec.ts`

**Step 1: Create Notion export E2E test**

Create `tests/e2e/notion-export-flow.spec.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db/drizzle';
import { users, learningPlans, modules, tasks } from '@/lib/db/schema';
import { storeOAuthTokens } from '@/lib/integrations/oauth';
import { exportPlanToNotion } from '@/lib/integrations/notion/sync';

describe('Notion Export E2E Flow', () => {
  let userId: string;
  let planId: string;

  beforeEach(async () => {
    // Setup full test data
    await db.delete(tasks);
    await db.delete(modules);
    await db.delete(learningPlans);
    await db.delete(users);

    const [user] = await db
      .insert(users)
      .values({
        clerkUserId: 'e2e_test_user',
        email: 'e2e@example.com',
      })
      .returning();
    userId = user.id;

    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId,
        topic: 'E2E Test Plan',
        skillLevel: 'beginner',
        weeklyHours: 5,
        generationStatus: 'ready',
      })
      .returning();
    planId = plan.id;

    const [mod] = await db
      .insert(modules)
      .values({
        planId,
        title: 'Test Module',
        description: 'E2E test module',
        order: 1,
        estimatedMinutes: 60,
      })
      .returning();

    await db.insert(tasks).values({
      moduleId: mod.id,
      title: 'Test Task',
      description: 'E2E test task',
      order: 1,
      durationMinutes: 30,
    });

    await storeOAuthTokens({
      userId,
      provider: 'notion',
      tokenData: { accessToken: 'e2e_token', scope: 'notion' },
    });
  });

  it('should complete full Notion export workflow', async () => {
    // Mock Notion API
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'notion_page_e2e' }),
    });

    const notionPageId = await exportPlanToNotion(planId, 'e2e_token');

    expect(notionPageId).toBe('notion_page_e2e');

    // Verify sync state created
    const [syncState] = await db
      .select()
      .from(notionSyncState)
      .where(eq(notionSyncState.planId, planId));

    expect(syncState).toBeDefined();
    expect(syncState.notionPageId).toBe('notion_page_e2e');
    expect(syncState.syncHash).toBeTruthy();
  });
});
```

**Step 2: Create Google Calendar E2E test**

Create `tests/e2e/google-calendar-sync-flow.spec.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/lib/db/drizzle';
import { syncPlanToGoogleCalendar } from '@/lib/integrations/google-calendar/sync';
import { taskCalendarEvents, googleCalendarSyncState } from '@/lib/db/schema';

describe('Google Calendar Sync E2E Flow', () => {
  it('should complete full calendar sync workflow', async () => {
    // Setup similar to Notion E2E test
    // Mock Google Calendar API
    const mockCalendar = {
      events: {
        insert: vi.fn().mockResolvedValue({
          data: { id: 'event_123', status: 'confirmed' },
        }),
      },
    };

    const eventsCreated = await syncPlanToGoogleCalendar(planId, 'e2e_token');

    expect(eventsCreated).toBeGreaterThan(0);

    // Verify event mappings created
    const mappings = await db
      .select()
      .from(taskCalendarEvents)
      .where(eq(taskCalendarEvents.userId, userId));

    expect(mappings.length).toBe(eventsCreated);

    // Verify sync state created
    const [syncState] = await db
      .select()
      .from(googleCalendarSyncState)
      .where(eq(googleCalendarSyncState.planId, planId));

    expect(syncState).toBeDefined();
  });
});
```

**Step 3: Run E2E tests**

Run:

```bash
pnpm test:e2e
```

Expected: PASS

**Step 4: Commit**

```bash
git add tests/e2e/
git commit -m "test(e2e): add end-to-end integration tests

Add comprehensive E2E tests for Notion export and Google Calendar sync
workflows covering full data pipeline from database to API.

Changes:
- Add Notion export E2E test with sync state verification
- Add Google Calendar sync E2E test with event mapping verification
- Mock external APIs for isolated testing

New files:
- tests/e2e/notion-export-flow.spec.ts
- tests/e2e/google-calendar-sync-flow.spec.ts

Tests cover:
- Complete export workflow
- Sync state persistence
- Event mapping creation"
```

---

## Execution Handoff

Plan complete and saved to `specs/009-third-party-sync/plan.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
