import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { users } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';

import { clearTestUser, setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';

// Mock Auth auth before importing the route
vi.mock('@/lib/auth/server', () => ({
  auth: { getSession: vi.fn() },
}));

describe('GET /api/v1/user/profile', () => {
  const authUserId = 'auth_profile_test_user';

  beforeEach(async () => {
    const { auth } = await import('@/lib/auth/server');
    vi.mocked(auth.getSession).mockResolvedValue({
      data: { user: { id: authUserId } },
    });

    setTestUser(authUserId);

    const userId = await ensureUser({
      authUserId,
      email: 'profile@example.com',
    });

    await db
      .update(users)
      .set({
        name: 'Profile Name',
        subscriptionTier: 'starter',
        subscriptionStatus: 'active',
      })
      .where(eq(users.id, userId));
  });

  afterEach(() => {
    vi.clearAllMocks();
    clearTestUser();
  });

  it('returns safe profile fields for the authenticated user', async () => {
    const { GET } = await import('@/app/api/v1/user/profile/route');
    const request = new NextRequest(
      'http://localhost:3000/api/v1/user/profile',
      {
        method: 'GET',
      }
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body).toMatchObject({
      name: 'Profile Name',
      email: 'profile@example.com',
      subscriptionTier: 'starter',
      subscriptionStatus: 'active',
    });
    expect(typeof body.id).toBe('string');
    expect(new Date(body.createdAt).toString()).not.toBe('Invalid Date');

    expect(body).not.toHaveProperty('authUserId');
    expect(body).not.toHaveProperty('stripeCustomerId');
    expect(body).not.toHaveProperty('stripeSubscriptionId');
    expect(body).not.toHaveProperty('monthlyExportCount');
  });
});

describe('PUT /api/v1/user/profile', () => {
  const authUserId = 'auth_profile_update_user';

  beforeEach(async () => {
    const { auth } = await import('@/lib/auth/server');
    vi.mocked(auth.getSession).mockResolvedValue({
      data: { user: { id: authUserId } },
    });

    setTestUser(authUserId);

    await ensureUser({
      authUserId,
      email: 'update-profile@example.com',
      name: 'Before Update',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    clearTestUser();
  });

  it('updates the profile name and returns safe fields', async () => {
    const before = await db.query.users.findFirst({
      where: (fields, operators) => operators.eq(fields.authUserId, authUserId),
    });
    expect(before).toBeDefined();

    const { PUT } = await import('@/app/api/v1/user/profile/route');
    const request = new NextRequest(
      'http://localhost:3000/api/v1/user/profile',
      {
        method: 'PUT',
        body: JSON.stringify({ name: 'New Name' }),
      }
    );

    const response = await PUT(request);

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body).toMatchObject({
      name: 'New Name',
      email: 'update-profile@example.com',
    });
    expect(body).not.toHaveProperty('authUserId');
    expect(body).not.toHaveProperty('stripeCustomerId');
    expect(body).not.toHaveProperty('stripeSubscriptionId');
    expect(body).not.toHaveProperty('monthlyExportCount');

    const updated = await db.query.users.findFirst({
      where: (fields, operators) => operators.eq(fields.authUserId, authUserId),
    });
    expect(updated?.name).toBe('New Name');
    expect(updated?.updatedAt.getTime()).toBeGreaterThan(
      before?.updatedAt.getTime() ?? 0
    );
  });

  it('allows setting name to null', async () => {
    const { PUT } = await import('@/app/api/v1/user/profile/route');
    const request = new NextRequest(
      'http://localhost:3000/api/v1/user/profile',
      {
        method: 'PUT',
        body: JSON.stringify({ name: null }),
      }
    );

    const response = await PUT(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.name).toBeNull();

    const updated = await db.query.users.findFirst({
      where: (fields, operators) => operators.eq(fields.authUserId, authUserId),
    });
    expect(updated?.name).toBeNull();
  });

  it('rejects payloads with unknown fields', async () => {
    const { PUT } = await import('@/app/api/v1/user/profile/route');
    const request = new NextRequest(
      'http://localhost:3000/api/v1/user/profile',
      {
        method: 'PUT',
        body: JSON.stringify({
          name: 'Still Valid',
          email: 'should-not-be-allowed@example.com',
        }),
      }
    );

    const response = await PUT(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects names longer than 100 characters', async () => {
    const { PUT } = await import('@/app/api/v1/user/profile/route');
    const request = new NextRequest(
      'http://localhost:3000/api/v1/user/profile',
      {
        method: 'PUT',
        body: JSON.stringify({ name: 'a'.repeat(101) }),
      }
    );

    const response = await PUT(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });
});
