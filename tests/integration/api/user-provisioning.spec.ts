import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createStreamHandler } from '@/app/api/v1/plans/stream/route';
import { users } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';
import { setTestUser } from '../../helpers/auth';

const streamPost = createStreamHandler({
  overrides: {
    processGenerationAttempt: async () => ({
      status: 'generation_success',
      data: {
        modules: [],
        metadata: {
          provider: 'mock',
          model: 'mock-model',
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        },
        durationMs: 1,
      },
    }),
  },
});

vi.mock('@/lib/auth/server', () => ({
  auth: { getSession: vi.fn() },
}));

describe('POST /api/v1/plans/stream user provisioning', () => {
  const authUserId = 'auth_provisioning_flow';
  const authEmail = 'provisioning@example.com';

  beforeEach(async () => {
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
      visibility: 'private',
      origin: 'ai',
    };

    const response = await streamPost(
      new Request('http://localhost/api/v1/plans/stream', {
        method: 'POST',
        body: JSON.stringify(planPayload),
        headers: {
          'Content-Type': 'application/json',
        },
      })
    );

    expect(response.status).toBe(200);

    const [provisionedUser] = await db
      .select()
      .from(users)
      .where(eq(users.authUserId, authUserId));

    expect(provisionedUser).toBeDefined();
    expect(provisionedUser?.email).toBe(authEmail);
    expect(provisionedUser?.name).toBe('Auto Provisioned');
  });
});
