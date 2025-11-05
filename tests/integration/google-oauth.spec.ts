import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock Clerk auth before importing the route
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

describe('Google OAuth Flow', () => {
  beforeEach(async () => {
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
    // Clean up env vars and mocks
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REDIRECT_URI;
    vi.restoreAllMocks();
  });

  it('should redirect to Google authorization URL', async () => {
    const { GET: googleAuthGET } = await import(
      '@/app/api/v1/auth/google/route'
    );
    const request = new NextRequest('http://localhost:3000/api/v1/auth/google');
    const response = await googleAuthGET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('Location')).toContain(
      'accounts.google.com/o/oauth2/v2/auth'
    );
    expect(response.headers.get('Location')).toContain('scope=');
    expect(response.headers.get('Location')).toContain('calendar');
  });
});
