import { assertLocalIntegrationDatabaseUrl } from '../../helpers/assert-local-database-url';
import { clearTestUser, setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db/users';
import { PATCH } from '@/app/api/v1/user/preferences/notifications/route';
import { USER_RATE_LIMIT_CONFIGS } from '@/lib/api/user-rate-limit';
import { getEmailNotificationPreferences } from '@/lib/db/queries/user-preferences';
import { db } from '@supabase/service-role';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

assertLocalIntegrationDatabaseUrl();

function expectJsonObject(value: unknown): Record<string, unknown> {
  expect(value).toBeTypeOf('object');
  expect(value).not.toBeNull();
  return value as Record<string, unknown>;
}

function patchRequest(body: unknown): Request {
  return new Request('http://localhost/api/v1/user/preferences/notifications', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('PATCH /api/v1/user/preferences/notifications', () => {
  const testAuthUserId = `notification-preferences-user-${Date.now()}`;
  let userId: string;

  beforeAll(async () => {
    userId = await ensureUser({
      authUserId: testAuthUserId,
      email: `${testAuthUserId}@example.com`,
    });
  });

  afterAll(() => {
    clearTestUser();
  });

  it('saves authenticated user notification preferences', async () => {
    setTestUser(testAuthUserId);

    const response = await PATCH(
      patchRequest({
        unsubscribeAllOptionalEmails: false,
        weeklySummary: true,
        dailyReminder: false,
        streakReminder: true,
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('X-RateLimit-Limit')).toBe(
      String(USER_RATE_LIMIT_CONFIGS.mutation.maxRequests),
    );
    const data = expectJsonObject(await response.json());
    expect(data.message).toBe('Notification preferences updated');
    expect(data.preferences).toEqual({
      unsubscribeAllOptionalEmails: false,
      weeklySummary: true,
      dailyReminder: false,
      streakReminder: true,
    });
    await expect(getEmailNotificationPreferences(userId, db)).resolves.toEqual({
      unsubscribeAllOptionalEmails: false,
      categories: {
        weekly_summary: true,
        daily_reminder: false,
        streak_reminder: true,
      },
    });
  });

  it('keeps category preferences while unsubscribe-all masks effective delivery', async () => {
    setTestUser(testAuthUserId);

    const response = await PATCH(
      patchRequest({
        unsubscribeAllOptionalEmails: true,
        weeklySummary: true,
        dailyReminder: true,
        streakReminder: true,
      }),
    );

    expect(response.status).toBe(200);
    const data = expectJsonObject(await response.json());
    expect(data.preferences).toEqual({
      unsubscribeAllOptionalEmails: true,
      weeklySummary: true,
      dailyReminder: true,
      streakReminder: true,
    });
    await expect(getEmailNotificationPreferences(userId, db)).resolves.toEqual({
      unsubscribeAllOptionalEmails: true,
      categories: {
        weekly_summary: true,
        daily_reminder: true,
        streak_reminder: true,
      },
    });
  });

  it('rejects invalid payloads with canonical 400 errors', async () => {
    setTestUser(testAuthUserId);

    for (const body of [
      {},
      {
        unsubscribeAllOptionalEmails: false,
        weeklySummary: true,
        dailyReminder: false,
        streakReminder: false,
        extraField: true,
      },
      {
        unsubscribeAllOptionalEmails: false,
        weeklySummary: 'yes',
        dailyReminder: false,
        streakReminder: false,
      },
    ]) {
      const response = await PATCH(patchRequest(body));
      expect(response.status).toBe(400);
      const data = expectJsonObject(await response.json());
      expect(data.error).toBe('Invalid notification preferences');
    }
  });

  it('rejects malformed JSON', async () => {
    setTestUser(testAuthUserId);

    const response = await PATCH(patchRequest('{ not json'));

    expect(response.status).toBe(400);
    const data = expectJsonObject(await response.json());
    expect(data.error).toBe('Invalid JSON in request body');
  });

  it('returns 401 for unauthenticated requests', async () => {
    clearTestUser();

    const response = await PATCH(
      patchRequest({
        unsubscribeAllOptionalEmails: false,
        weeklySummary: true,
        dailyReminder: false,
        streakReminder: false,
      }),
    );

    expect(response.status).toBe(401);
  });
});
