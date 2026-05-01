import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRequestContext } from '@/lib/api/context';
import { ConflictError } from '@/lib/api/errors';
import {
  createRequestBoundary,
  requestBoundary,
} from '@/lib/api/request-boundary';
import {
  clearAllUserRateLimiters,
  USER_RATE_LIMIT_CONFIGS,
} from '@/lib/api/user-rate-limit';
import { db as serviceDb } from '@/lib/db/service-role';
import { buildUserFixture } from '../../fixtures/users';
import { clearTestUser, setTestUser } from '../../helpers/auth';

const { getUserByAuthIdMock } = vi.hoisted(() => ({
  getUserByAuthIdMock: vi.fn(),
}));

vi.mock('@/lib/db/queries/users', () => ({
  getUserByAuthId: getUserByAuthIdMock,
}));

describe('requestBoundary', () => {
  afterEach(() => {
    clearTestUser();
    getUserByAuthIdMock.mockReset();
    clearAllUserRateLimiters();
  });

  it('provides a scoped actor, db, owned access, and correlation id for components', async () => {
    const user = buildUserFixture({
      id: 'user_1',
      authUserId: 'auth_1',
      email: 'component@example.test',
      name: 'Component User',
    });

    setTestUser(user.authUserId);
    getUserByAuthIdMock.mockResolvedValue(user);

    const scope = await requestBoundary.component(async (currentScope) => {
      const requestContext = getRequestContext();

      expect(currentScope.actor).toEqual(user);
      expect(currentScope.db).toBe(serviceDb);
      expect(currentScope.owned).toEqual({
        userId: user.id,
        dbClient: serviceDb,
      });
      expect(typeof currentScope.correlationId).toBe('string');
      expect(requestContext?.user).toMatchObject({
        id: user.id,
        authUserId: user.authUserId,
      });
      expect(requestContext?.db).toBe(serviceDb);

      return currentScope;
    });

    expect(scope).not.toBeNull();
  });

  it('returns null for optional component and action callers when unauthenticated', async () => {
    await expect(
      requestBoundary.component(async () => 'unreachable'),
    ).resolves.toBeNull();
    await expect(
      requestBoundary.action(async () => 'unreachable'),
    ).resolves.toBeNull();
  });

  it('exposes request params and actor scope for routes', async () => {
    const user = buildUserFixture({
      id: 'user_2',
      authUserId: 'auth_2',
      email: 'route@example.test',
      name: 'Route User',
    });

    setTestUser(user.authUserId);
    getUserByAuthIdMock.mockResolvedValue(user);

    const handler = createRequestBoundary().route(async (scope) => {
      const requestContext = getRequestContext();

      expect(scope.req.url).toContain('/plans/');
      expect(scope.params).toEqual({ planId: 'plan-1' });
      expect(scope.actor).toEqual(user);
      expect(scope.db).toBe(serviceDb);
      expect(requestContext?.db).toBe(serviceDb);
      expect(scope.owned.userId).toBe(user.id);

      return new Response('ok', { status: 200 });
    });

    const response = await handler(
      new Request('http://localhost/plans/plan-1', { method: 'GET' }),
      {
        params: Promise.resolve({ planId: 'plan-1' }),
      },
    );

    expect(response.status).toBe(200);
  });

  it('returns canonical 401 on unauthenticated route access', async () => {
    const handler = createRequestBoundary().route(async () => {
      return new Response('ok', { status: 200 });
    });

    const response = await handler(
      new Request('http://localhost/plans/plan-1'),
      {
        params: Promise.resolve({ planId: 'plan-1' }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      error: 'Unauthorized',
      code: 'UNAUTHORIZED',
    });
  });

  it('returns canonical 401 on unauthenticated access when route uses rateLimit option', async () => {
    const handler = createRequestBoundary().route(
      { rateLimit: 'read' },
      async () => {
        return new Response('ok', { status: 200 });
      },
    );

    const response = await handler(new Request('http://localhost/x'), {
      params: Promise.resolve({}),
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      error: 'Unauthorized',
      code: 'UNAUTHORIZED',
    });
  });

  it('applies user-rate-limit headers when rateLimit option is set', async () => {
    const user = buildUserFixture({
      id: 'user_rl',
      authUserId: 'auth_rl',
      email: 'rl@example.test',
      name: 'RL User',
    });

    setTestUser(user.authUserId);
    getUserByAuthIdMock.mockResolvedValue(user);

    const handler = createRequestBoundary().route(
      { rateLimit: 'read' },
      async () => {
        return new Response('ok', { status: 200 });
      },
    );

    const response = await handler(
      new Request('http://localhost/api', { method: 'GET' }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('X-RateLimit-Limit')).toBe(
      String(USER_RATE_LIMIT_CONFIGS.read.maxRequests),
    );
    expect(response.headers.get('X-RateLimit-Remaining')).not.toBeNull();
    expect(response.headers.get('X-RateLimit-Reset')).not.toBeNull();
  });

  it('treats route({}, run) like optionless route when rateLimit omitted', async () => {
    const user = buildUserFixture({
      id: 'user_empty_opt',
      authUserId: 'auth_empty_opt',
      email: 'empty@example.test',
      name: 'Empty Opt',
    });

    setTestUser(user.authUserId);
    getUserByAuthIdMock.mockResolvedValue(user);

    const handler = createRequestBoundary().route({}, async () => {
      return new Response('ok', { status: 200 });
    });

    const response = await handler(
      new Request('http://localhost/api', { method: 'GET' }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('X-RateLimit-Limit')).toBeNull();
  });

  it('maps thrown route errors to canonical error responses', async () => {
    const user = buildUserFixture({
      id: 'user_eb',
      authUserId: 'auth_eb',
      email: 'eb@example.test',
      name: 'EB User',
    });

    setTestUser(user.authUserId);
    getUserByAuthIdMock.mockResolvedValue(user);

    const handler = createRequestBoundary().route(async () => {
      throw new Error('boom');
    });

    const response = await handler(
      new Request('http://localhost/api', { method: 'GET' }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('serializes ConflictError with conflict classification', async () => {
    const user = buildUserFixture({
      id: 'user_conflict',
      authUserId: 'auth_conflict',
      email: 'conflict@example.test',
      name: 'Conflict User',
    });

    setTestUser(user.authUserId);
    getUserByAuthIdMock.mockResolvedValue(user);

    const handler = createRequestBoundary().route(async () => {
      throw new ConflictError('Already exists', { field: 'topic' });
    });

    const response = await handler(
      new Request('http://localhost/api', { method: 'POST' }),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      error: 'Already exists',
      code: 'CONFLICT',
      classification: 'conflict',
      details: { field: 'topic' },
    });
  });

  it('maps AbortError to 499 from route boundary', async () => {
    const user = buildUserFixture({
      id: 'user_abort',
      authUserId: 'auth_abort',
      email: 'abort@example.test',
      name: 'Abort User',
    });

    setTestUser(user.authUserId);
    getUserByAuthIdMock.mockResolvedValue(user);

    const abort = new Error('aborted');
    abort.name = 'AbortError';
    const handler = createRequestBoundary().route(async () => {
      throw abort;
    });

    const response = await handler(
      new Request('http://localhost/api', { method: 'POST' }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(499);
    expect(response.headers.get('Connection')).toBe('close');
  });

  it('maps rate-limit failures to canonical 429 responses with retry headers', async () => {
    const user = buildUserFixture({
      id: 'user_eb_rl',
      authUserId: 'auth_eb_rl',
      email: 'ebrl@example.test',
      name: 'EB RL User',
    });

    setTestUser(user.authUserId);
    getUserByAuthIdMock.mockResolvedValue(user);

    const handler = createRequestBoundary().route(
      { rateLimit: 'billing' },
      async () => new Response('ok', { status: 200 }),
    );

    for (let i = 0; i < USER_RATE_LIMIT_CONFIGS.billing.maxRequests; i += 1) {
      const allowed = await handler(
        new Request('http://localhost/api', { method: 'POST' }),
        { params: Promise.resolve({}) },
      );
      expect(allowed.status).toBe(200);
    }

    const response = await handler(
      new Request('http://localhost/api', { method: 'POST' }),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).not.toBeNull();
    expect(response.headers.get('X-RateLimit-Limit')).toBe(
      String(USER_RATE_LIMIT_CONFIGS.billing.maxRequests),
    );
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(response.headers.get('X-RateLimit-Reset')).not.toBeNull();
    expect(body).toMatchObject({
      code: 'RATE_LIMITED',
      classification: 'rate_limit',
      retryAfter: expect.any(Number),
    });
  });
});
