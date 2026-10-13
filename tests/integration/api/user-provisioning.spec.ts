import { setTestUser } from '../../helpers/auth';
import { POST } from '@/app/api/v1/plans/route';
import { users } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { mockServerSession } from '@tests/helpers/mock-server-auth';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const serverAuth = vi.hoisted(() => {
  const getSession = vi.fn();
  return {
    getSession,
    module: () => ({ auth: { getSession } }),
  };
});
vi.mock('@/lib/auth/server', () => serverAuth.module());

describe('POST /api/v1/plans user provisioning', () => {
  const authUserId = 'auth_provisioning_flow';
  const authEmail = 'provisioning@example.com';

  beforeEach(async () => {
    mockServerSession(serverAuth.getSession, {
      id: authUserId,
      email: authEmail,
      name: 'Auto Provisioned',
    });

    setTestUser(authUserId);

    // The create route sends the start command to the jobs Worker; no generation runs here.
    vi.stubEnv('JOBS_WORKER_URL', 'https://workers-test.atlaris.app');
    vi.stubEnv('JOBS_SIGNING_SECRET', 'integration-secret');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { accepted: true, instanceId: 'plan-provisioning' },
          { status: 202 },
        ),
      ),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
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

    const response = await POST(
      new Request('http://localhost/api/v1/plans', {
        method: 'POST',
        body: JSON.stringify(planPayload),
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );

    expect(response.status).toBe(202);

    const [provisionedUser] = await db
      .select()
      .from(users)
      .where(eq(users.authUserId, authUserId));

    expect(provisionedUser).toBeDefined();
    expect(provisionedUser?.email).toBe(authEmail);
    expect(provisionedUser?.name).toBe('Auto Provisioned');
  });
});
