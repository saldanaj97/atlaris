import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db/service-role';
import { users, integrationTokens } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getOAuthTokens } from '@/lib/integrations/oauth';
import { clearOAuthStateTokens } from '@/lib/integrations/oauth-state';
import { setTestUser } from '../helpers/auth';

// Mock Clerk auth before importing the route
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

// Mock googleapis
vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        generateAuthUrl: vi
          .fn()
          .mockReturnValue(
            'https://accounts.google.com/o/oauth2/v2/auth?client_id=test_google_client_id&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fv1%2Fauth%2Fgoogle%2Fcallback&response_type=code&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar%20https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar.events&access_type=offline&state=test_clerk_user_id&prompt=consent'
          ),
        getToken: vi.fn(),
      })),
    },
  },
}));

// Ensure integration_tokens table exists
async function ensureIntegrationTokensTable() {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE integration_provider AS ENUM('notion', 'google_calendar');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

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
}

describe('Google OAuth Flow', () => {
  let originalGoogleClientId: string | undefined;
  let originalGoogleClientSecret: string | undefined;
  let originalGoogleRedirectUri: string | undefined;

  beforeEach(async () => {
    // Ensure table exists
    await ensureIntegrationTokensTable();

    // Clear OAuth state tokens cache before each test
    clearOAuthStateTokens();

    // Capture original env values before overriding
    originalGoogleClientId = process.env.GOOGLE_CLIENT_ID;
    originalGoogleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    originalGoogleRedirectUri = process.env.GOOGLE_REDIRECT_URI;

    // Mock Clerk auth to return test user
    const { auth } = await import('@clerk/nextjs/server');
    vi.mocked(auth).mockResolvedValue({
      userId: 'test_clerk_user_id',
    } as Awaited<ReturnType<typeof auth>>);

    // Ensure route handlers authenticate as this test user
    setTestUser('test_clerk_user_id');

    // Set required env vars
    process.env.GOOGLE_CLIENT_ID = 'test_google_client_id';
    process.env.GOOGLE_CLIENT_SECRET = 'test_google_client_secret';
    process.env.GOOGLE_REDIRECT_URI =
      'http://localhost:3000/api/v1/auth/google/callback';
    process.env.OAUTH_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    // Re-apply a fresh OAuth2 mock before each test to avoid cross-test pollution
    const { google } = await import('googleapis');
    vi.mocked(google.auth.OAuth2).mockImplementation(
      () =>
        ({
          generateAuthUrl: vi.fn().mockImplementation((opts: any) => {
            const base = 'https://accounts.google.com/o/oauth2/v2/auth';
            const clientId = process.env.GOOGLE_CLIENT_ID;
            const redirectUri = process.env.GOOGLE_REDIRECT_URI;
            const scopeParam = Array.isArray(opts?.scope)
              ? opts.scope.join(' ')
              : String(opts?.scope ?? '');
            const stateParam = String(opts?.state ?? '');
            const accessType = String(opts?.access_type ?? '');
            const prompt = String(opts?.prompt ?? '');
            return (
              `${base}?client_id=${clientId}` +
              `&redirect_uri=${redirectUri}` +
              `&response_type=code` +
              `&scope=${scopeParam}` +
              `&access_type=${accessType}` +
              `&state=${stateParam}` +
              `&prompt=${prompt}`
            );
          }),
          getToken: vi.fn(),
        }) as any
    );
  });

  afterEach(() => {
    // Clean up env vars and mocks
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REDIRECT_URI;
    delete process.env.OAUTH_ENCRYPTION_KEY;
    // Only clear mock history; keep implementations intact for module-level mocks
    vi.clearAllMocks();
  });

  describe('GET /api/v1/auth/google (Authorization Initiation)', () => {
    it('should redirect to Google authorization URL with correct parameters', async () => {
      const { GET: googleAuthGET } = await import(
        '@/app/api/v1/auth/google/route'
      );
      const request = new NextRequest(
        'http://localhost:3000/api/v1/auth/google'
      );
      const response = await googleAuthGET(request);

      expect(response.status).toBe(307);
      const location = response.headers.get('Location');
      expect(location).toContain('accounts.google.com/o/oauth2/v2/auth');
      expect(location).toContain('client_id=test_google_client_id');
      expect(location).toContain('scope=');
      expect(location).toContain('calendar');
      expect(location).toContain('access_type=offline');
      expect(location).toContain('prompt=consent');
      const url = new URL(location!);
      const stateParam = url.searchParams.get('state');
      expect(stateParam).toBeTruthy();
    });

    it('should include both calendar scopes in authorization URL', async () => {
      const { GET: googleAuthGET } = await import(
        '@/app/api/v1/auth/google/route'
      );
      const request = new NextRequest(
        'http://localhost:3000/api/v1/auth/google'
      );
      const response = await googleAuthGET(request);

      const location = response.headers.get('Location')!;
      const url = new URL(location);
      const scopeParam = url.searchParams.get('scope') ?? '';
      expect(scopeParam).toContain('www.googleapis.com/auth/calendar');
      expect(scopeParam).toContain('www.googleapis.com/auth/calendar.events');
    });

    it('should include state parameter for callback verification', async () => {
      const { GET: googleAuthGET } = await import(
        '@/app/api/v1/auth/google/route'
      );
      const request = new NextRequest(
        'http://localhost:3000/api/v1/auth/google'
      );
      const response = await googleAuthGET(request);

      const location = response.headers.get('Location')!;
      const url = new URL(location);
      const state = url.searchParams.get('state');
      expect(state).toBeTruthy();
    });

    it('should return 401 when user is not authenticated', async () => {
      const { auth } = await import('@clerk/nextjs/server');
      vi.mocked(auth).mockResolvedValue({
        userId: null,
      } as Awaited<ReturnType<typeof auth>>);

      const { GET: googleAuthGET } = await import(
        '@/app/api/v1/auth/google/route'
      );
      const request = new NextRequest(
        'http://localhost:3000/api/v1/auth/google'
      );
      const response = await googleAuthGET(request);

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body).toEqual({ error: 'Unauthorized' });
    });

    it('should handle missing GOOGLE_CLIENT_ID gracefully', async () => {
      delete process.env.GOOGLE_CLIENT_ID;

      const { GET: googleAuthGET } = await import(
        '@/app/api/v1/auth/google/route'
      );
      const request = new NextRequest(
        'http://localhost:3000/api/v1/auth/google'
      );

      // Should not throw, googleapis handles undefined gracefully
      const response = await googleAuthGET(request);
      expect(response).toBeDefined();
    });

    it('should handle missing GOOGLE_CLIENT_SECRET gracefully', async () => {
      delete process.env.GOOGLE_CLIENT_SECRET;

      const { GET: googleAuthGET } = await import(
        '@/app/api/v1/auth/google/route'
      );
      const request = new NextRequest(
        'http://localhost:3000/api/v1/auth/google'
      );

      const response = await googleAuthGET(request);
      expect(response).toBeDefined();
    });

    it('should handle missing GOOGLE_REDIRECT_URI gracefully', async () => {
      delete process.env.GOOGLE_REDIRECT_URI;

      const { GET: googleAuthGET } = await import(
        '@/app/api/v1/auth/google/route'
      );
      const request = new NextRequest(
        'http://localhost:3000/api/v1/auth/google'
      );

      const response = await googleAuthGET(request);
      expect(response).toBeDefined();
    });

    it('should use offline access type to get refresh token', async () => {
      const { GET: googleAuthGET } = await import(
        '@/app/api/v1/auth/google/route'
      );
      const request = new NextRequest(
        'http://localhost:3000/api/v1/auth/google'
      );
      const response = await googleAuthGET(request);

      const location = response.headers.get('Location');
      expect(location).toContain('access_type=offline');
    });

    it('should force consent prompt to ensure refresh token is granted', async () => {
      const { GET: googleAuthGET } = await import(
        '@/app/api/v1/auth/google/route'
      );
      const request = new NextRequest(
        'http://localhost:3000/api/v1/auth/google'
      );
      const response = await googleAuthGET(request);

      const location = response.headers.get('Location');
      expect(location).toContain('prompt=consent');
    });
  });

  describe('GET /api/v1/auth/google/callback (OAuth Callback)', () => {
    let testUserId: string;
    let testStateToken: string;

    beforeEach(async () => {
      // Clean up test data
      await db.delete(integrationTokens);
      await db.delete(users);

      // Create test user with the state ID
      const [user] = await db
        .insert(users)
        .values({
          clerkUserId: 'test_clerk_user_id',
          email: 'test@example.com',
        })
        .returning();

      testUserId = user.id;

      // Generate and store a state token for testing
      testStateToken = 'test_state_token_123';
      const { storeOAuthStateToken } = await import(
        '@/lib/integrations/oauth-state'
      );
      storeOAuthStateToken(testStateToken, 'test_clerk_user_id');
    });

    it('should exchange authorization code for tokens and store them', async () => {
      const mockTokens = {
        access_token: 'mock_access_token_12345',
        refresh_token: 'mock_refresh_token_67890',
        expiry_date: Date.now() + 3600000,
        scope: 'https://www.googleapis.com/auth/calendar',
        token_type: 'Bearer',
      };

      const { google } = await import('googleapis');
      const mockGetToken = vi.fn().mockResolvedValue({ tokens: mockTokens });
      vi.mocked(google.auth.OAuth2).mockImplementation(
        () =>
          ({
            generateAuthUrl: vi
              .fn()
              .mockReturnValue(
                'https://accounts.google.com/o/oauth2/v2/auth?mock=true'
              ),
            getToken: mockGetToken,
          }) as any
      );

      const { GET: googleCallbackGET } = await import(
        '@/app/api/v1/auth/google/callback/route'
      );
      const request = new NextRequest(
        `http://localhost:3000/api/v1/auth/google/callback?code=test_code&state=${testStateToken}`
      );
      const response = await googleCallbackGET(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('Location')).toContain(
        '/settings/integrations?google=connected'
      );
      expect(mockGetToken).toHaveBeenCalledWith('test_code');

      // Verify tokens were stored
      const storedTokens = await getOAuthTokens(testUserId, 'google_calendar');
      expect(storedTokens).toBeDefined();
      expect(storedTokens!.accessToken).toBe('mock_access_token_12345');
      expect(storedTokens!.refreshToken).toBe('mock_refresh_token_67890');
    });

    it('should handle callback with access token but no refresh token', async () => {
      const mockTokens = {
        access_token: 'mock_access_token_only',
        expiry_date: Date.now() + 3600000,
        scope: 'https://www.googleapis.com/auth/calendar',
        token_type: 'Bearer',
      };

      const { google } = await import('googleapis');
      const mockGetToken = vi.fn().mockResolvedValue({ tokens: mockTokens });
      vi.mocked(google.auth.OAuth2).mockImplementation(
        () =>
          ({
            generateAuthUrl: vi
              .fn()
              .mockReturnValue(
                'https://accounts.google.com/o/oauth2/v2/auth?mock=true'
              ),
            getToken: mockGetToken,
          }) as any
      );

      const { GET: googleCallbackGET } = await import(
        '@/app/api/v1/auth/google/callback/route'
      );
      const request = new NextRequest(
        `http://localhost:3000/api/v1/auth/google/callback?code=test_code&state=${testStateToken}`
      );
      const response = await googleCallbackGET(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('Location')).toContain(
        '/settings/integrations?google=connected'
      );

      // Verify tokens were stored without refresh token
      const storedTokens = await getOAuthTokens(testUserId, 'google_calendar');
      expect(storedTokens).toBeDefined();
      expect(storedTokens!.accessToken).toBe('mock_access_token_only');
      expect(storedTokens!.refreshToken).toBeUndefined();
    });

    it('should handle callback with access token but no expiry date', async () => {
      const mockTokens = {
        access_token: 'mock_access_token_no_expiry',
        refresh_token: 'mock_refresh_token',
        scope: 'https://www.googleapis.com/auth/calendar',
        token_type: 'Bearer',
      };

      const { google } = await import('googleapis');
      const mockGetToken = vi.fn().mockResolvedValue({ tokens: mockTokens });
      vi.mocked(google.auth.OAuth2).mockImplementation(
        () =>
          ({
            generateAuthUrl: vi
              .fn()
              .mockReturnValue(
                'https://accounts.google.com/o/oauth2/v2/auth?mock=true'
              ),
            getToken: mockGetToken,
          }) as any
      );

      const { GET: googleCallbackGET } = await import(
        '@/app/api/v1/auth/google/callback/route'
      );
      const request = new NextRequest(
        `http://localhost:3000/api/v1/auth/google/callback?code=test_code&state=${testStateToken}`
      );
      const response = await googleCallbackGET(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('Location')).toContain(
        '/settings/integrations?google=connected'
      );

      // Verify tokens were stored without expiry
      const storedTokens = await getOAuthTokens(testUserId, 'google_calendar');
      expect(storedTokens).toBeDefined();
      expect(storedTokens!.expiresAt).toBeUndefined();
    });

    it('should redirect with error when user denies authorization', async () => {
      const { GET: googleCallbackGET } = await import(
        '@/app/api/v1/auth/google/callback/route'
      );
      const request = new NextRequest(
        `http://localhost:3000/api/v1/auth/google/callback?error=access_denied&state=${testStateToken}`
      );
      const response = await googleCallbackGET(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('Location')).toContain(
        '/settings/integrations?error=access_denied'
      );
    });

    it('should redirect with error when code parameter is missing', async () => {
      const { GET: googleCallbackGET } = await import(
        '@/app/api/v1/auth/google/callback/route'
      );
      const request = new NextRequest(
        `http://localhost:3000/api/v1/auth/google/callback?state=${testStateToken}`
      );
      const response = await googleCallbackGET(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('Location')).toContain(
        '/settings/integrations?error=missing_parameters'
      );
    });

    it('should redirect with error when state parameter is missing', async () => {
      const { GET: googleCallbackGET } = await import(
        '@/app/api/v1/auth/google/callback/route'
      );
      const request = new NextRequest(
        'http://localhost:3000/api/v1/auth/google/callback?code=test_code'
      );
      const response = await googleCallbackGET(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('Location')).toContain(
        '/settings/integrations?error=missing_parameters'
      );
    });

    it('should redirect with error when both code and state are missing', async () => {
      const { GET: googleCallbackGET } = await import(
        '@/app/api/v1/auth/google/callback/route'
      );
      const request = new NextRequest(
        'http://localhost:3000/api/v1/auth/google/callback'
      );
      const response = await googleCallbackGET(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('Location')).toContain(
        '/settings/integrations?error=missing_parameters'
      );
    });

    it('should redirect with error when user does not exist', async () => {
      // Delete the test user so the database lookup fails
      await db.delete(users).where(eq(users.id, testUserId));

      // Store a state token that maps to test_clerk_user_id (matching auth mock)
      // but the user won't exist in the database
      const nonExistentStateToken = 'non_existent_state_token';
      const { storeOAuthStateToken } = await import(
        '@/lib/integrations/oauth-state'
      );
      storeOAuthStateToken(nonExistentStateToken, 'test_clerk_user_id');

      const { GET: googleCallbackGET } = await import(
        '@/app/api/v1/auth/google/callback/route'
      );
      const request = new NextRequest(
        `http://localhost:3000/api/v1/auth/google/callback?code=test_code&state=${nonExistentStateToken}`
      );
      const response = await googleCallbackGET(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('Location')).toContain(
        '/settings/integrations?error=invalid_user'
      );
    });

    it('should redirect with error when token exchange fails', async () => {
      const { google } = await import('googleapis');
      const mockGetToken = vi
        .fn()
        .mockRejectedValue(new Error('Token exchange failed'));
      vi.mocked(google.auth.OAuth2).mockImplementation(
        () =>
          ({
            generateAuthUrl: vi
              .fn()
              .mockReturnValue(
                'https://accounts.google.com/o/oauth2/v2/auth?mock=true'
              ),
            getToken: mockGetToken,
          }) as any
      );

      const { GET: googleCallbackGET } = await import(
        '@/app/api/v1/auth/google/callback/route'
      );
      const request = new NextRequest(
        `http://localhost:3000/api/v1/auth/google/callback?code=invalid_code&state=${testStateToken}`
      );
      const response = await googleCallbackGET(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('Location')).toContain(
        '/settings/integrations?error=token_exchange_failed'
      );
    });

    it('should redirect with error when no access token is received', async () => {
      const mockTokens = {
        access_token: null,
        scope: 'https://www.googleapis.com/auth/calendar',
        token_type: 'Bearer',
      };

      const { google } = await import('googleapis');
      const mockGetToken = vi.fn().mockResolvedValue({ tokens: mockTokens });
      vi.mocked(google.auth.OAuth2).mockImplementation(
        () =>
          ({
            generateAuthUrl: vi
              .fn()
              .mockReturnValue(
                'https://accounts.google.com/o/oauth2/v2/auth?mock=true'
              ),
            getToken: mockGetToken,
          }) as any
      );

      const { GET: googleCallbackGET } = await import(
        '@/app/api/v1/auth/google/callback/route'
      );
      const request = new NextRequest(
        `http://localhost:3000/api/v1/auth/google/callback?code=test_code&state=${testStateToken}`
      );
      const response = await googleCallbackGET(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('Location')).toContain(
        '/settings/integrations?error=token_exchange_failed'
      );
    });

    it('should redirect with error when access token is undefined', async () => {
      const mockTokens = {
        scope: 'https://www.googleapis.com/auth/calendar',
        token_type: 'Bearer',
      };

      const { google } = await import('googleapis');
      const mockGetToken = vi.fn().mockResolvedValue({ tokens: mockTokens });
      vi.mocked(google.auth.OAuth2).mockImplementation(
        () =>
          ({
            generateAuthUrl: vi
              .fn()
              .mockReturnValue(
                'https://accounts.google.com/o/oauth2/v2/auth?mock=true'
              ),
            getToken: mockGetToken,
          }) as any
      );

      const { GET: googleCallbackGET } = await import(
        '@/app/api/v1/auth/google/callback/route'
      );
      const request = new NextRequest(
        `http://localhost:3000/api/v1/auth/google/callback?code=test_code&state=${testStateToken}`
      );
      const response = await googleCallbackGET(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('Location')).toContain(
        '/settings/integrations?error=token_exchange_failed'
      );
    });

    it('should use default scope when token scope is missing', async () => {
      const mockTokens = {
        access_token: 'mock_access_token',
        refresh_token: 'mock_refresh_token',
        expiry_date: Date.now() + 3600000,
        token_type: 'Bearer',
      };

      const { google } = await import('googleapis');
      const mockGetToken = vi.fn().mockResolvedValue({ tokens: mockTokens });
      vi.mocked(google.auth.OAuth2).mockImplementation(
        () =>
          ({
            generateAuthUrl: vi
              .fn()
              .mockReturnValue(
                'https://accounts.google.com/o/oauth2/v2/auth?mock=true'
              ),
            getToken: mockGetToken,
          }) as any
      );

      const { GET: googleCallbackGET } = await import(
        '@/app/api/v1/auth/google/callback/route'
      );
      const request = new NextRequest(
        `http://localhost:3000/api/v1/auth/google/callback?code=test_code&state=${testStateToken}`
      );
      const response = await googleCallbackGET(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('Location')).toContain(
        '/settings/integrations?google=connected'
      );

      // Verify default scope was used
      const storedTokens = await getOAuthTokens(testUserId, 'google_calendar');
      expect(storedTokens).toBeDefined();
      expect(storedTokens!.scope).toBe('calendar');
    });

    it('should store full scope when provided by Google', async () => {
      const mockTokens = {
        access_token: 'mock_access_token',
        refresh_token: 'mock_refresh_token',
        expiry_date: Date.now() + 3600000,
        scope:
          'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events',
        token_type: 'Bearer',
      };

      const { google } = await import('googleapis');
      const mockGetToken = vi.fn().mockResolvedValue({ tokens: mockTokens });
      vi.mocked(google.auth.OAuth2).mockImplementation(
        () =>
          ({
            generateAuthUrl: vi
              .fn()
              .mockReturnValue(
                'https://accounts.google.com/o/oauth2/v2/auth?mock=true'
              ),
            getToken: mockGetToken,
          }) as any
      );

      const { GET: googleCallbackGET } = await import(
        '@/app/api/v1/auth/google/callback/route'
      );
      const request = new NextRequest(
        `http://localhost:3000/api/v1/auth/google/callback?code=test_code&state=${testStateToken}`
      );
      const response = await googleCallbackGET(request);

      expect(response.status).toBe(307);

      // Verify full scope was stored
      const storedTokens = await getOAuthTokens(testUserId, 'google_calendar');
      expect(storedTokens).toBeDefined();
      expect(storedTokens!.scope).toBe(
        'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events'
      );
    });

    it('should update existing tokens on re-authorization', async () => {
      // First authorization
      const mockTokens1 = {
        access_token: 'old_access_token',
        refresh_token: 'old_refresh_token',
        expiry_date: Date.now() + 3600000,
        scope: 'https://www.googleapis.com/auth/calendar',
        token_type: 'Bearer',
      };

      const { google } = await import('googleapis');
      let mockGetToken = vi.fn().mockResolvedValue({ tokens: mockTokens1 });
      vi.mocked(google.auth.OAuth2).mockImplementation(
        () =>
          ({
            generateAuthUrl: vi
              .fn()
              .mockReturnValue(
                'https://accounts.google.com/o/oauth2/v2/auth?mock=true'
              ),
            getToken: mockGetToken,
          }) as any
      );

      const { GET: googleCallbackGET } = await import(
        '@/app/api/v1/auth/google/callback/route'
      );
      let request = new NextRequest(
        `http://localhost:3000/api/v1/auth/google/callback?code=test_code_1&state=${testStateToken}`
      );
      await googleCallbackGET(request);

      // Second authorization with new tokens
      const mockTokens2 = {
        access_token: 'new_access_token',
        refresh_token: 'new_refresh_token',
        expiry_date: Date.now() + 7200000,
        scope: 'https://www.googleapis.com/auth/calendar',
        token_type: 'Bearer',
      };

      mockGetToken = vi.fn().mockResolvedValue({ tokens: mockTokens2 });
      vi.mocked(google.auth.OAuth2).mockImplementation(
        () =>
          ({
            generateAuthUrl: vi
              .fn()
              .mockReturnValue(
                'https://accounts.google.com/o/oauth2/v2/auth?mock=true'
              ),
            getToken: mockGetToken,
          }) as any
      );

      // Store a new state token for the second request (tokens are one-time use)
      const secondStateToken = 'test_state_token_456';
      const { storeOAuthStateToken: storeToken } = await import(
        '@/lib/integrations/oauth-state'
      );
      storeToken(secondStateToken, 'test_clerk_user_id');

      request = new NextRequest(
        `http://localhost:3000/api/v1/auth/google/callback?code=test_code_2&state=${secondStateToken}`
      );
      const response = await googleCallbackGET(request);

      expect(response.status).toBe(307);

      // Verify new tokens replaced old ones
      const storedTokens = await getOAuthTokens(testUserId, 'google_calendar');
      expect(storedTokens).toBeDefined();
      expect(storedTokens!.accessToken).toBe('new_access_token');
      expect(storedTokens!.refreshToken).toBe('new_refresh_token');

      // Verify only one record exists
      const count = await db
        .select()
        .from(integrationTokens)
        .where(eq(integrationTokens.userId, testUserId));
      expect(count).toHaveLength(1);
    });

    it('should correctly convert expiry_date timestamp to Date object', async () => {
      const expiryTimestamp = Date.now() + 3600000;
      const mockTokens = {
        access_token: 'mock_access_token',
        refresh_token: 'mock_refresh_token',
        expiry_date: expiryTimestamp,
        scope: 'https://www.googleapis.com/auth/calendar',
        token_type: 'Bearer',
      };

      const { google } = await import('googleapis');
      const mockGetToken = vi.fn().mockResolvedValue({ tokens: mockTokens });
      vi.mocked(google.auth.OAuth2).mockImplementation(
        () =>
          ({
            generateAuthUrl: vi
              .fn()
              .mockReturnValue(
                'https://accounts.google.com/o/oauth2/v2/auth?mock=true'
              ),
            getToken: mockGetToken,
          }) as any
      );

      const { GET: googleCallbackGET } = await import(
        '@/app/api/v1/auth/google/callback/route'
      );
      const request = new NextRequest(
        `http://localhost:3000/api/v1/auth/google/callback?code=test_code&state=${testStateToken}`
      );
      await googleCallbackGET(request);

      // Verify expiry date was stored correctly
      const storedTokens = await getOAuthTokens(testUserId, 'google_calendar');
      expect(storedTokens).toBeDefined();
      expect(storedTokens!.expiresAt).toBeInstanceOf(Date);
      expect(storedTokens!.expiresAt!.getTime()).toBe(expiryTimestamp);
    });

    it('should handle Google API network errors gracefully', async () => {
      const { google } = await import('googleapis');
      const mockGetToken = vi
        .fn()
        .mockRejectedValue(new Error('Network error'));
      vi.mocked(google.auth.OAuth2).mockImplementation(
        () =>
          ({
            generateAuthUrl: vi
              .fn()
              .mockReturnValue(
                'https://accounts.google.com/o/oauth2/v2/auth?mock=true'
              ),
            getToken: mockGetToken,
          }) as any
      );

      const { GET: googleCallbackGET } = await import(
        '@/app/api/v1/auth/google/callback/route'
      );
      const request = new NextRequest(
        `http://localhost:3000/api/v1/auth/google/callback?code=test_code&state=${testStateToken}`
      );
      const response = await googleCallbackGET(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('Location')).toContain(
        '/settings/integrations?error=token_exchange_failed'
      );
    });

    it('should handle invalid authorization codes', async () => {
      const { google } = await import('googleapis');
      const mockGetToken = vi
        .fn()
        .mockRejectedValue(new Error('invalid_grant'));
      vi.mocked(google.auth.OAuth2).mockImplementation(
        () =>
          ({
            generateAuthUrl: vi
              .fn()
              .mockReturnValue(
                'https://accounts.google.com/o/oauth2/v2/auth?mock=true'
              ),
            getToken: mockGetToken,
          }) as any
      );

      const { GET: googleCallbackGET } = await import(
        '@/app/api/v1/auth/google/callback/route'
      );
      const request = new NextRequest(
        `http://localhost:3000/api/v1/auth/google/callback?code=invalid_code&state=${testStateToken}`
      );
      const response = await googleCallbackGET(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('Location')).toContain(
        '/settings/integrations?error=token_exchange_failed'
      );
    });

    it('should preserve original request URL in redirect after success', async () => {
      const mockTokens = {
        access_token: 'mock_access_token',
        refresh_token: 'mock_refresh_token',
        expiry_date: Date.now() + 3600000,
        scope: 'https://www.googleapis.com/auth/calendar',
        token_type: 'Bearer',
      };

      const { google } = await import('googleapis');
      const mockGetToken = vi.fn().mockResolvedValue({ tokens: mockTokens });
      vi.mocked(google.auth.OAuth2).mockImplementation(
        () =>
          ({
            generateAuthUrl: vi
              .fn()
              .mockReturnValue(
                'https://accounts.google.com/o/oauth2/v2/auth?mock=true'
              ),
            getToken: mockGetToken,
          }) as any
      );

      const { GET: googleCallbackGET } = await import(
        '@/app/api/v1/auth/google/callback/route'
      );
      const request = new NextRequest(
        `https://example.com/api/v1/auth/google/callback?code=test_code&state=${testStateToken}`
      );
      const response = await googleCallbackGET(request);

      expect(response.status).toBe(307);
      const location = response.headers.get('Location');
      expect(location).toContain('https://example.com');
      expect(location).toContain('/settings/integrations?google=connected');
    });

    it('should preserve original request URL in redirect after error', async () => {
      const { GET: googleCallbackGET } = await import(
        '@/app/api/v1/auth/google/callback/route'
      );
      const request = new NextRequest(
        `https://example.com/api/v1/auth/google/callback?error=access_denied&state=${testStateToken}`
      );
      const response = await googleCallbackGET(request);

      expect(response.status).toBe(307);
      const location = response.headers.get('Location');
      expect(location).toContain('https://example.com');
      expect(location).toContain('/settings/integrations?error=access_denied');
    });

    it('should handle malformed state parameter (not a valid UUID)', async () => {
      const { GET: googleCallbackGET } = await import(
        '@/app/api/v1/auth/google/callback/route'
      );
      const request = new NextRequest(
        'http://localhost:3000/api/v1/auth/google/callback?code=test_code&state=invalid-uuid'
      );
      const response = await googleCallbackGET(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('Location')).toContain(
        '/settings/integrations?error=invalid_state'
      );
    });

    it('should handle empty string parameters', async () => {
      const { GET: googleCallbackGET } = await import(
        '@/app/api/v1/auth/google/callback/route'
      );
      const request = new NextRequest(
        'http://localhost:3000/api/v1/auth/google/callback?code=&state='
      );
      const response = await googleCallbackGET(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('Location')).toContain(
        '/settings/integrations?error=missing_parameters'
      );
    });
    // Restore original env values or delete if previously undefined
    if (originalGoogleClientId === undefined) {
      delete process.env.GOOGLE_CLIENT_ID;
    } else {
      process.env.GOOGLE_CLIENT_ID = originalGoogleClientId;
    }

    if (originalGoogleClientSecret === undefined) {
      delete process.env.GOOGLE_CLIENT_SECRET;
    } else {
      process.env.GOOGLE_CLIENT_SECRET = originalGoogleClientSecret;
    }

    if (originalGoogleRedirectUri === undefined) {
      delete process.env.GOOGLE_REDIRECT_URI;
    } else {
      process.env.GOOGLE_REDIRECT_URI = originalGoogleRedirectUri;
    }

    // Clear mock history but keep mock implementations in place
    vi.clearAllMocks();
  });

  it('should redirect to Google authorization URL with secure state token', async () => {
    const { GET: googleAuthGET } = await import(
      '@/app/api/v1/auth/google/route'
    );
    const request = new NextRequest('http://localhost:3000/api/v1/auth/google');
    const response = await googleAuthGET(request);

    expect(response.status).toBe(307);
    const location = response.headers.get('Location');
    expect(location).toContain('accounts.google.com/o/oauth2/v2/auth');
    expect(location).toContain('scope=');
    expect(location).toContain('calendar');

    // Verify that state parameter is present and is not the user ID
    const url = new URL(location!);
    const stateParam = url.searchParams.get('state');
    expect(stateParam).toBeTruthy();
    expect(stateParam).not.toBe('test_clerk_user_id');
    // Verify state token is a valid base64url string (contains only base64url characters)
    expect(stateParam).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
