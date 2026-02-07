import { afterEach, describe, expect, it } from 'vitest';
import { POST } from '@/app/api/v1/plans/route';
import { db } from '@/lib/db/service-role';
import { learningPlans } from '@/lib/db/schema';
import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';
import { buildTestAuthUserId, buildTestEmail } from '../../helpers/testIds';

const BASE_URL = 'http://localhost/api/v1/plans';
async function createRequest(body: unknown) {
  return new Request(BASE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/plans - caps', () => {
  const authUserId = buildTestAuthUserId('api-caps-user');
  const authEmail = buildTestEmail(authUserId);

  afterEach(async () => {
    await db.delete(learningPlans);
  });

  it('rejects free > 2 weeks before enqueue', async () => {
    setTestUser(authUserId);
    await ensureUser({ authUserId, email: authEmail });

    const threeWeeksFromNow = new Date(
      Date.now() + 21 * 24 * 3600 * 1000
    ).toISOString();

    const req = await createRequest({
      topic: 'ai engineering',
      skillLevel: 'intermediate',
      weeklyHours: 5,
      learningStyle: 'practice',
      startDate: undefined,
      deadlineDate: threeWeeksFromNow,
      visibility: 'private',
      origin: 'ai',
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/2-week/);
  });
});
