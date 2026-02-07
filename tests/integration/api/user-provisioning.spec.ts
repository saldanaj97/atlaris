import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { users } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';
import { setTestUser } from '../../helpers/auth';
import { truncateAll } from '../../helpers/db';

vi.mock('@/lib/auth/server', () => ({
  auth: { getSession: vi.fn() },
}));

describe('POST /api/v1/plans user provisioning', () => {
  const authUserId = 'auth_provisioning_flow';
  const authEmail = 'provisioning@example.com';

  beforeEach(async () => {
    await truncateAll();

    const { auth } = await import('@/lib/auth/server');

    vi.mocked(auth.getSession).mockResolvedValue({
      data: {
        user: {
          id: authUserId,
          email: authEmail,
          name: 'Auto Provisioned',
        },
      },
    });

    setTestUser(authUserId);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates a database user when the Auth user is new', async () => {
    const planPayload = {
      topic: 'Integration testing guardrails',
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'reading',
      deadlineDate: new Date(Date.now() + 86400000).toISOString(),
    };

    const { POST } = await import('@/app/api/v1/plans/route');
    const response = await POST(
      new NextRequest('http://localhost/api/v1/plans', {
        method: 'POST',
        body: JSON.stringify(planPayload),
        headers: {
          'Content-Type': 'application/json',
        },
      })
    );

    expect(response.status).toBe(201);

    const [provisionedUser] = await db
      .select()
      .from(users)
      .where(eq(users.authUserId, authUserId));

    expect(provisionedUser).toBeDefined();
    expect(provisionedUser?.email).toBe(authEmail);
    expect(provisionedUser?.name).toBe('Auto Provisioned');
  });
});
