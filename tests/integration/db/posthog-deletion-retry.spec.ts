import { retryPostHogPersonDeletions } from '@/features/auth/posthog-person-deletion';
import { users } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { ensureUser } from '@tests/helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';

const NOW = new Date('2026-10-17T03:00:00.000Z');

async function seedUser(
  name: string,
  state: { clerkDeletedAt?: Date; posthogDeletedAt?: Date } = {},
) {
  const authUserId = buildTestAuthUserId(name);
  await ensureUser({ authUserId, email: buildTestEmail(authUserId) });
  if (state.clerkDeletedAt) {
    await db.update(users).set(state).where(eq(users.authUserId, authUserId));
  }
  return authUserId;
}

async function posthogDeletedAt(authUserId: string) {
  const [row] = await db
    .select({ posthogDeletedAt: users.posthogDeletedAt })
    .from(users)
    .where(eq(users.authUserId, authUserId));
  return row?.posthogDeletedAt ?? null;
}

function stubPostHog(status: number) {
  const fetchMock = vi.fn(() =>
    Promise.resolve(new Response(null, { status })),
  );
  vi.stubGlobal('fetch', fetchMock);
  return () =>
    fetchMock.mock.calls.flatMap(
      (call) =>
        JSON.parse((call as unknown as [string, { body: string }])[1].body)
          .distinct_ids as string[],
    );
}

const run = () =>
  retryPostHogPersonDeletions({
    apiKey: 'phx_test',
    db,
    logger: { error: vi.fn(), info: vi.fn() },
    now: NOW,
  });

describe('retryPostHogPersonDeletions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('deletes and marks only tombstoned users PostHog has not accepted yet', async () => {
    const pending = await seedUser('posthog-pending', {
      clerkDeletedAt: new Date('2026-10-16T00:00:00.000Z'),
    });
    const done = await seedUser('posthog-done', {
      clerkDeletedAt: new Date('2026-10-16T00:00:00.000Z'),
      posthogDeletedAt: new Date('2026-10-16T00:00:01.000Z'),
    });
    const active = await seedUser('posthog-active');
    const sentIds = stubPostHog(202);

    await run();

    expect(sentIds()).toContain(pending);
    expect(sentIds()).not.toContain(done);
    expect(sentIds()).not.toContain(active);
    expect(await posthogDeletedAt(pending)).toEqual(NOW);
    expect(await posthogDeletedAt(active)).toBeNull();

    // Nothing is left, so the next run sends no request.
    const nextSentIds = stubPostHog(202);
    await expect(run()).resolves.toEqual({ deleted: 0 });
    expect(nextSentIds()).toEqual([]);
  });

  it('keeps the rows pending and throws when PostHog rejects the request', async () => {
    const pending = await seedUser('posthog-rejected', {
      clerkDeletedAt: new Date('2026-10-16T00:00:00.000Z'),
    });
    stubPostHog(500);

    await expect(run()).rejects.toThrow('PostHog person deletion failed');
    expect(await posthogDeletedAt(pending)).toBeNull();
  });
});
