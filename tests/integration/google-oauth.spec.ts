import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { clearOAuthStateTokens } from '@/lib/integrations/oauth-state';

// Mock Clerk auth before importing the route
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

describe('Google OAuth Flow', () => {
  let originalGoogleClientId: string | undefined;
  let originalGoogleClientSecret: string | undefined;
  let originalGoogleRedirectUri: string | undefined;

  beforeEach(async () => {
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

    // Set required env vars
    process.env.GOOGLE_CLIENT_ID = 'test_google_client_id';
    process.env.GOOGLE_CLIENT_SECRET = 'test_google_client_secret';
    process.env.GOOGLE_REDIRECT_URI =
      'http://localhost:3000/api/v1/auth/google/callback';
  });

  afterEach(() => {
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

    vi.restoreAllMocks();
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
