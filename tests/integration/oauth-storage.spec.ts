import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db/service-role';
import { users, integrationTokens } from '@/lib/db/schema';
import {
  storeOAuthTokens,
  getOAuthTokens,
  deleteOAuthTokens,
} from '@/lib/integrations/oauth';
import { eq, and, sql } from 'drizzle-orm';

// Set encryption key for tests (64 hex characters = 32 bytes for AES-256)
if (!process.env.OAUTH_ENCRYPTION_KEY) {
  process.env.OAUTH_ENCRYPTION_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
}

async function ensureIntegrationTokensTable() {
  // Create enum if it doesn't exist
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE integration_provider AS ENUM('notion', 'google_calendar');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create table if it doesn't exist
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS integration_tokens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      user_id uuid NOT NULL,
      provider integration_provider NOT NULL,
      encrypted_access_token text NOT NULL,
      encrypted_refresh_token text,
      scope text NOT NULL,
      expires_at timestamp with time zone,
      workspace_id text,
      workspace_name text,
      bot_id text,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT user_provider_unique UNIQUE(user_id, provider),
      CONSTRAINT integration_tokens_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE cascade
    )
  `);

  // Create indexes if they don't exist
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS integration_tokens_user_id_idx ON integration_tokens (user_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS integration_tokens_provider_idx ON integration_tokens (provider)
  `);
}

describe('OAuth Token Storage', () => {
  let testUserId: string;

  beforeEach(async () => {
    // Ensure table exists (migrations might not be applied to test DB)
    await ensureIntegrationTokensTable();

    // Clean up test data
    await db.delete(integrationTokens);

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
