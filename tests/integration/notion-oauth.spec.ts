import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { users, integrationTokens } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// Mock Clerk auth before importing the route
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

describe('Notion OAuth Flow', () => {
  beforeEach(async () => {
    // Mock Clerk auth to return test user
    const { auth } = await import('@clerk/nextjs/server');
    vi.mocked(auth).mockResolvedValue({
      userId: 'test_clerk_user_id',
    } as Awaited<ReturnType<typeof auth>>);

    // Set required env vars
    process.env.NOTION_CLIENT_ID = 'test_client_id';
    process.env.NOTION_CLIENT_SECRET = 'test_client_secret';
    process.env.NOTION_REDIRECT_URI =
      'http://localhost:3000/api/v1/auth/notion/callback';
    process.env.OAUTH_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  });

  afterEach(() => {
    // Clean up env vars and mocks
    delete process.env.NOTION_CLIENT_ID;
    delete process.env.NOTION_CLIENT_SECRET;
    delete process.env.NOTION_REDIRECT_URI;
    delete process.env.OAUTH_ENCRYPTION_KEY;
    vi.restoreAllMocks();
  });

  it('should redirect to Notion authorization URL', async () => {
    const { GET: notionAuthGET } = await import(
      '@/app/api/v1/auth/notion/route'
    );
    const request = new NextRequest('http://localhost:3000/api/v1/auth/notion');
    const response = await notionAuthGET(request);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toContain(
      'https://api.notion.com/v1/oauth/authorize'
    );
    expect(response.headers.get('Location')).toContain('client_id=');
    expect(response.headers.get('Location')).toContain('redirect_uri=');
    expect(response.headers.get('Location')).toContain('response_type=code');
  });

  describe('Notion OAuth Callback', () => {
    it('should reject unauthenticated requests', async () => {
      // Mock Clerk auth to return no userId
      const { auth } = await import('@clerk/nextjs/server');
      vi.mocked(auth).mockResolvedValue({
        userId: null,
      } as Awaited<ReturnType<typeof auth>>);

      // Create test user
      await db.delete(integrationTokens);
      await db.delete(users);
      const [user] = await db
        .insert(users)
        .values({
          clerkUserId: 'test_clerk_user_id',
          email: 'test@example.com',
        })
        .returning();

      const request = new NextRequest(
        `http://localhost:3000/api/v1/auth/notion/callback?code=test_code&state=${user.id}`
      );

      const { GET: notionCallbackGET } = await import(
        '@/app/api/v1/auth/notion/callback/route'
      );
      const response = await notionCallbackGET(request);

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('error=unauthorized');

      // Verify no token was stored
      const tokens = await db
        .select()
        .from(integrationTokens)
        .where(eq(integrationTokens.userId, user.id));
      expect(tokens.length).toBe(0);

      // Restore auth mock for other tests
      vi.mocked(auth).mockResolvedValue({
        userId: 'test_clerk_user_id',
      } as Awaited<ReturnType<typeof auth>>);
    });

    it('should reject authenticated user with mismatched userId', async () => {
      // Mock Clerk auth to return different userId
      const { auth } = await import('@clerk/nextjs/server');
      vi.mocked(auth).mockResolvedValue({
        userId: 'attacker_clerk_user_id',
      } as Awaited<ReturnType<typeof auth>>);

      // Create test user with different clerkUserId
      await db.delete(integrationTokens);
      await db.delete(users);
      const [user] = await db
        .insert(users)
        .values({
          clerkUserId: 'victim_clerk_user_id',
          email: 'victim@example.com',
        })
        .returning();

      const request = new NextRequest(
        `http://localhost:3000/api/v1/auth/notion/callback?code=test_code&state=${user.id}`
      );

      const { GET: notionCallbackGET } = await import(
        '@/app/api/v1/auth/notion/callback/route'
      );
      const response = await notionCallbackGET(request);

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('error=user_mismatch');

      // Verify no token was stored
      const tokens = await db
        .select()
        .from(integrationTokens)
        .where(eq(integrationTokens.userId, user.id));
      expect(tokens.length).toBe(0);

      // Restore auth mock for other tests
      vi.mocked(auth).mockResolvedValue({
        userId: 'test_clerk_user_id',
      } as Awaited<ReturnType<typeof auth>>);
    });

    it('should exchange code for tokens and store encrypted', async () => {
      // Mock Notion API token exchange
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'notion_access_token_123',
          bot_id: 'bot_abc',
          workspace_id: 'workspace_xyz',
          workspace_name: 'Test Workspace',
          owner: { type: 'user' },
        }),
      } as Response);

      // Create test user with matching clerkUserId
      await db.delete(integrationTokens);
      await db.delete(users);
      const [user] = await db
        .insert(users)
        .values({
          clerkUserId: 'test_clerk_user_id',
          email: 'test@example.com',
        })
        .returning();

      const request = new NextRequest(
        `http://localhost:3000/api/v1/auth/notion/callback?code=test_code&state=${user.id}`
      );

      const { GET: notionCallbackGET } = await import(
        '@/app/api/v1/auth/notion/callback/route'
      );
      const response = await notionCallbackGET(request);

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain(
        '/settings/integrations'
      );

      // Verify token stored and encrypted
      const [token] = await db
        .select()
        .from(integrationTokens)
        .where(eq(integrationTokens.userId, user.id))
        .limit(1);

      expect(token).toBeDefined();
      expect(token?.provider).toBe('notion');
      expect(token?.workspaceId).toBe('workspace_xyz');
      // Verify token is encrypted (not plaintext)
      expect(token?.encryptedAccessToken).toBeTruthy();
      expect(token?.encryptedAccessToken).not.toBe('notion_access_token_123');
      expect(token?.encryptedAccessToken).toContain(':');

      // Clean up spy
      fetchSpy.mockRestore();
    });
  });
});
