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

**Step 5: Run Coderabbit CLI and implement suggestions**

Run `coderabbit --prompt-only -t uncommitted` and implement any suggestions from the review.

**Step 6: Commit**

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
