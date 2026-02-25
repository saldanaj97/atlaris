import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { setTestUser, clearTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';
import {
  createAuthenticatedSession,
  createUnauthenticatedSession,
} from '../../mocks/shared/auth-session';

// Mock auth before importing the route
vi.mock('@/lib/auth/server', () => ({
  auth: { getSession: vi.fn() },
}));

describe('POST /api/v1/ai/enhance-content', () => {
  const authUserId = 'auth_enhance_content_test_user';

  beforeEach(async () => {
    const { auth } = await import('@/lib/auth/server');
    vi.mocked(auth.getSession).mockResolvedValue(
      createAuthenticatedSession(authUserId)
    );

    setTestUser(authUserId);

    await ensureUser({
      authUserId,
      email: 'enhance-content@example.com',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    clearTestUser();
  });

  it('should return 501 Not Implemented', async () => {
    const { POST } = await import('@/app/api/v1/ai/enhance-content/route');
    const request = new NextRequest(
      'http://localhost:3000/api/v1/ai/enhance-content',
      {
        method: 'POST',
        body: JSON.stringify({
          planId: 'test-plan',
          enhancementType: 'improve_descriptions',
        }),
      }
    );

    const response = await POST(request);

    expect(response.status).toBe(501);
    const body = (await response.json()) as Record<string, unknown>;

    // Required error contract fields (docs/rules/api/error-contract.md)
    expect(body).toHaveProperty('code');
    expect(body).toHaveProperty('error');
    expect(body.code).toBe('NOT_IMPLEMENTED');
    expect(typeof body.code).toBe('string');
    expect(typeof body.error).toBe('string');

    // Optional contract fields: if present, must have correct types
    if ('classification' in body && body.classification !== undefined) {
      expect(typeof body.classification).toBe('string');
    }
    if ('retryAfter' in body && body.retryAfter !== undefined) {
      expect(typeof body.retryAfter).toBe('number');
    }
    if ('retryable' in body && body.retryable !== undefined) {
      expect(typeof body.retryable).toBe('boolean');
    }
    if ('requestId' in body && body.requestId !== undefined) {
      expect(typeof body.requestId).toBe('string');
    }
  });

  it('should require authentication', async () => {
    clearTestUser();

    const { auth } = await import('@/lib/auth/server');
    vi.mocked(auth.getSession).mockResolvedValue(
      createUnauthenticatedSession()
    );

    const { POST } = await import('@/app/api/v1/ai/enhance-content/route');
    const request = new NextRequest(
      'http://localhost:3000/api/v1/ai/enhance-content',
      { method: 'POST' }
    );

    const response = await POST(request);

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: string; code: string };
    expect(body.error).toBe('Unauthorized');
    expect(body.code).toBe('UNAUTHORIZED');
  });
});
