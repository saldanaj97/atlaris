import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestUser } from '../../fixtures/users';
import { clearTestUser, setTestUser } from '../../helpers/auth';

// Mock auth before importing the route
vi.mock('@/lib/auth/server', () => ({
  auth: { getSession: vi.fn() },
}));

describe('POST /api/v1/integrations/disconnect', () => {
  let testUser: Awaited<ReturnType<typeof createTestUser>>;

  beforeEach(async () => {
    testUser = await createTestUser({ email: 'disconnect@example.test' });

    const { auth } = await import('@/lib/auth/server');
    vi.mocked(auth.getSession).mockResolvedValue({
      data: { user: { id: testUser.authUserId } },
    });

    setTestUser(testUser.authUserId);
  });

  afterEach(() => {
    vi.clearAllMocks();
    clearTestUser();
  });

  it('should return 501 Not Implemented', async () => {
    const { POST } = await import('@/app/api/v1/integrations/disconnect/route');
    const request = new NextRequest(
      'http://localhost:3000/api/v1/integrations/disconnect',
      {
        method: 'POST',
        body: JSON.stringify({ integration: 'google_calendar' }),
      }
    );

    const response = await POST(request);

    expect(response.status).toBe(501);
    const body = await response.json();
    expect(body.code).toBe('NOT_IMPLEMENTED');
  });

  it('should require authentication', async () => {
    clearTestUser();

    const { auth } = await import('@/lib/auth/server');
    vi.mocked(auth.getSession).mockResolvedValue({
      data: { user: null },
    });

    const { POST } = await import('@/app/api/v1/integrations/disconnect/route');
    const request = new NextRequest(
      'http://localhost:3000/api/v1/integrations/disconnect',
      { method: 'POST' }
    );

    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  // TODO: Implement disconnect flow tests
  //
  // When the POST handler is implemented (currently returns 501), replace or
  // extend the "should return 501 Not Implemented" test above with the
  // following scenarios:
  //
  // 1. Provider token revocation
  //    - Seed an integration row with a stored access/refresh token.
  //    - Mock the provider's revoke endpoint (e.g. Google's
  //      https://oauth2.googleapis.com/revoke) and assert it is called with
  //      the correct token value.
  //    - Assert the mock revocation call returns a success response and that
  //      no subsequent use of the token would succeed (i.e. the mock is not
  //      called again or returns 401 on re-use).
  //
  // 2. DB record removal
  //    - After a successful disconnect call, query the integrations table
  //      directly and assert the row no longer exists for the test user.
  //
  // 3. Unsupported provider
  //    - Pass an unknown `integration` value and assert a 400 / validation
  //      error is returned (NOT a provider revocation attempt).
  //
  // 4. Revocation failure handling
  //    - Mock the provider revocation endpoint to return an error and assert
  //      the API either surfaces the error correctly or cleans up the DB row
  //      depending on the chosen strategy (best-effort vs. strict).
  //
  // Reference: https://github.com/saldanaj97/atlaris/pull/218
});
