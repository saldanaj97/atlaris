import {
  GET as GET_UNSUBSCRIBE,
  POST as POST_UNSUBSCRIBE,
} from '@/app/api/v1/notifications/email/unsubscribe/route';
import { createUnsubscribeToken } from '@/features/notifications/email/unsubscribe-token';
import { userEmailNotificationSettings } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { ensureUser } from '@tests/helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const BASE_URL = 'http://localhost/api/v1/notifications/email/unsubscribe';
const SECRET = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

async function seedUser() {
  const authUserId = buildTestAuthUserId('email-unsub');
  const userId = await ensureUser({
    authUserId,
    email: buildTestEmail(authUserId),
  });
  const token = createUnsubscribeToken({ userId, secret: SECRET });
  return { userId, token };
}

async function settingsFor(userId: string) {
  const [row] = await db
    .select()
    .from(userEmailNotificationSettings)
    .where(eq(userEmailNotificationSettings.userId, userId));
  return row ?? null;
}

describe('email unsubscribe route', () => {
  beforeEach(() => {
    vi.stubEnv('EMAIL_UNSUBSCRIBE_TOKEN_SECRET', SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('GET confirmation page never mutates preferences', async () => {
    const { userId, token } = await seedUser();

    const response = await GET_UNSUBSCRIBE(
      new Request(`${BASE_URL}?token=${encodeURIComponent(token)}`),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    const html = await response.text();
    expect(html).toContain('List-Unsubscribe');
    expect(html).not.toContain(token);
    expect(await settingsFor(userId)).toBeNull();
  });

  it('accepts RFC-shaped URL-encoded and multipart POSTs using the query token', async () => {
    const first = await seedUser();
    const urlEncoded = await POST_UNSUBSCRIBE(
      new Request(`${BASE_URL}?token=${encodeURIComponent(first.token)}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: 'List-Unsubscribe=One-Click',
      }),
    );

    expect(urlEncoded.status).toBe(200);
    expect(urlEncoded.headers.get('location')).toBeNull();
    expect(
      (await settingsFor(first.userId))?.unsubscribeAllOptionalEmails,
    ).toBe(true);

    const second = await seedUser();
    const form = new FormData();
    form.set('List-Unsubscribe', 'One-Click');
    const multipart = await POST_UNSUBSCRIBE(
      new Request(`${BASE_URL}?token=${encodeURIComponent(second.token)}`, {
        method: 'POST',
        body: form,
      }),
    );

    expect(multipart.status).toBe(200);
    expect(multipart.headers.get('location')).toBeNull();
    expect(
      (await settingsFor(second.userId))?.unsubscribeAllOptionalEmails,
    ).toBe(true);
  });

  it('rejects invalid token, missing form field, and body-only token without mutating', async () => {
    const { userId, token } = await seedUser();

    const invalid = await POST_UNSUBSCRIBE(
      new Request(`${BASE_URL}?token=not-a-valid-token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
      }),
    );
    expect(invalid.status).toBe(400);

    const wrongField = await POST_UNSUBSCRIBE(
      new Request(`${BASE_URL}?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'token=ignored',
      }),
    );
    expect(wrongField.status).toBe(400);

    const bodyOnly = await POST_UNSUBSCRIBE(
      new Request(BASE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: `List-Unsubscribe=One-Click&token=${encodeURIComponent(token)}`,
      }),
    );
    expect(bodyOnly.status).toBe(400);
    expect(await settingsFor(userId)).toBeNull();
  });

  it('reports missing unsubscribe configuration as a generic server failure', async () => {
    const { token } = await seedUser();
    vi.stubEnv('EMAIL_UNSUBSCRIBE_TOKEN_SECRET', undefined);

    const response = await POST_UNSUBSCRIBE(
      new Request(`${BASE_URL}?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.not.toContain(
      'EMAIL_UNSUBSCRIBE_TOKEN_SECRET',
    );
  });

  it('keeps valid POST idempotent while unsubscribe secret remains configured', async () => {
    const { userId, token } = await seedUser();

    const first = await POST_UNSUBSCRIBE(
      new Request(`${BASE_URL}?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
      }),
    );
    const second = await POST_UNSUBSCRIBE(
      new Request(`${BASE_URL}?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
      }),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect((await settingsFor(userId))?.unsubscribeAllOptionalEmails).toBe(
      true,
    );
  });
});
