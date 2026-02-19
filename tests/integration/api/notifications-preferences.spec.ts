import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { clearTestUser, setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';

vi.mock('@/lib/auth/server', () => {
  const { auth } = require('../../mocks/shared/auth-server');
  return { auth };
});

describe('GET /api/v1/notifications/preferences', () => {
  const authUserId = 'auth_notif_prefs_test_user';

  beforeEach(async () => {
    const { auth } = await import('@/lib/auth/server');
    vi.mocked(auth.getSession).mockResolvedValue({
      data: { user: { id: authUserId } },
    });

    setTestUser(authUserId);

    await ensureUser({
      authUserId,
      email: 'notif-prefs@example.com',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    clearTestUser();
  });

  it('should return 501 Not Implemented', async () => {
    const { GET } = await import(
      '@/app/api/v1/notifications/preferences/route'
    );
    const request = new NextRequest(
      'http://localhost:3000/api/v1/notifications/preferences',
      { method: 'GET' }
    );

    const response = await GET(request);

    expect(response.status).toBe(501);
    const body = await response.json();
    expect(body.code).toBe('NOT_IMPLEMENTED');
  });
});

describe('PUT /api/v1/notifications/preferences', () => {
  const authUserId = 'auth_notif_update_test_user';

  beforeEach(async () => {
    const { auth } = await import('@/lib/auth/server');
    vi.mocked(auth.getSession).mockResolvedValue({
      data: { user: { id: authUserId } },
    });

    setTestUser(authUserId);

    await ensureUser({
      authUserId,
      email: 'notif-update@example.com',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    clearTestUser();
  });

  it('should return 501 Not Implemented', async () => {
    const { PUT } = await import(
      '@/app/api/v1/notifications/preferences/route'
    );
    const request = new NextRequest(
      'http://localhost:3000/api/v1/notifications/preferences',
      {
        method: 'PUT',
        body: JSON.stringify({ emailEnabled: true }),
      }
    );

    const response = await PUT(request);

    expect(response.status).toBe(501);
    const body = await response.json();
    expect(body.code).toBe('NOT_IMPLEMENTED');
  });
});
