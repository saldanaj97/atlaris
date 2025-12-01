import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { users } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';
import { setTestUser } from '../../helpers/auth';
import { truncateAll } from '../../helpers/db';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
}));

describe('POST /api/v1/plans user provisioning', () => {
  const clerkUserId = 'clerk_provisioning_flow';
  const clerkEmail = 'provisioning@example.com';

  beforeEach(async () => {
    await truncateAll();

    const { auth, currentUser } = await import('@clerk/nextjs/server');

    vi.mocked(auth).mockResolvedValue({
      userId: clerkUserId,
    } as Awaited<ReturnType<typeof auth>>);

    vi.mocked(currentUser).mockResolvedValue({
      id: clerkUserId,
      emailAddresses: [{ id: 'primary', emailAddress: clerkEmail }],
      primaryEmailAddressId: 'primary',
      firstName: 'Auto',
      lastName: 'Provisioned',
      fullName: 'Auto Provisioned',
    } as Awaited<ReturnType<typeof currentUser>>);

    setTestUser(clerkUserId);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates a database user when the Clerk user is new', async () => {
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
      .where(eq(users.clerkUserId, clerkUserId));

    expect(provisionedUser).toBeDefined();
    expect(provisionedUser?.email).toBe(clerkEmail);
    expect(provisionedUser?.name).toBe('Auto Provisioned');
  });
});
