import type { PersistedProviderRequest } from '@/features/notifications/email/types';

import {
  claimEmailNotificationDelivery,
  EMAIL_DELIVERY_LEASE_MS,
  EMAIL_PROVIDER_IDEMPOTENCY_WINDOW_MS,
  EmailDeliveryLostLeaseError,
  markEmailNotificationDeliveryFailed,
  markEmailNotificationDeliverySent,
  summarizeEmailNotificationDeliveriesForRun,
} from '@/lib/db/queries/email-notification-deliveries';
import { emailNotificationDeliveries } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { ensureUser } from '@tests/helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

function providerRequest(
  overrides: Partial<PersistedProviderRequest> = {},
): PersistedProviderRequest {
  return {
    from: 'Atlaris <notifications@mail.atlaris.app>',
    to: 'u@example.com',
    subject: 'Hello',
    html: '<p>Hi</p>',
    text: 'Hi',
    headers: { 'List-Unsubscribe': '<https://example.com/unsub>' },
    idempotencyKey: 'user:daily_reminder:2026-07-09',
    ...overrides,
  };
}

describe('email notification deliveries ledger', () => {
  it('indexes logical run summaries by category, delivery key, and status', async () => {
    const indexes = (await db.execute(sql`
      select indexdef
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'email_notification_deliveries'
        and indexname = 'idx_email_notification_deliveries_run_summary'
    `)) as Array<{ indexdef: string }>;

    expect(indexes).toHaveLength(1);
    expect(indexes[0]?.indexdef).toContain('(category, delivery_key, status)');
  });

  it('reconciles terminal counts for a logical run from the ledger', async () => {
    const firstAuthUserId = buildTestAuthUserId('email-ledger-summary-first');
    const secondAuthUserId = buildTestAuthUserId('email-ledger-summary-second');
    const [firstUserId, secondUserId] = await Promise.all([
      ensureUser({
        authUserId: firstAuthUserId,
        email: buildTestEmail(firstAuthUserId),
      }),
      ensureUser({
        authUserId: secondAuthUserId,
        email: buildTestEmail(secondAuthUserId),
      }),
    ]);

    await db.insert(emailNotificationDeliveries).values([
      {
        userId: firstUserId,
        category: 'daily_reminder',
        deliveryKey: '2026-07-10',
        status: 'sent',
      },
      {
        userId: firstUserId,
        category: 'streak_reminder',
        deliveryKey: '2026-07-10',
        status: 'skipped',
      },
      {
        userId: secondUserId,
        category: 'daily_reminder',
        deliveryKey: '2026-07-10',
        status: 'manual_review',
      },
      {
        userId: secondUserId,
        category: 'streak_reminder',
        deliveryKey: '2026-07-10',
        status: 'failed',
      },
    ]);

    await expect(
      summarizeEmailNotificationDeliveriesForRun(
        {
          categories: ['daily_reminder', 'streak_reminder'],
          deliveryKeys: ['2026-07-10'],
        },
        db,
      ),
    ).resolves.toEqual({ sent: 1, skipped: 1, failed: 1, manualReview: 1 });
  });

  it('claims a new key and persists the provider request', async () => {
    const authUserId = buildTestAuthUserId('email-ledger-new');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });

    const claim = await claimEmailNotificationDelivery(
      {
        userId,
        category: 'daily_reminder',
        deliveryKey: '2026-07-09',
        providerRequest: providerRequest(),
      },
      db,
    );

    expect(claim.outcome).toBe('claimed');
    if (claim.outcome !== 'claimed') return;

    const [row] = await db
      .select()
      .from(emailNotificationDeliveries)
      .where(eq(emailNotificationDeliveries.id, claim.deliveryId));

    expect(row?.status).toBe('pending');
    expect(row?.claimToken).toBe(claim.claimToken);
    expect(row?.providerRequest).toMatchObject(providerRequest());
    expect(row?.attemptCount).toBe(1);
  });

  it('allows only one concurrent owner for the same delivery key', async () => {
    const authUserId = buildTestAuthUserId('email-ledger-race');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });

    const [first, second] = await Promise.all([
      claimEmailNotificationDelivery(
        {
          userId,
          category: 'streak_reminder',
          deliveryKey: '2026-07-09',
          providerRequest: providerRequest({
            idempotencyKey: 'race:streak:2026-07-09',
          }),
        },
        db,
      ),
      claimEmailNotificationDelivery(
        {
          userId,
          category: 'streak_reminder',
          deliveryKey: '2026-07-09',
          providerRequest: providerRequest({
            idempotencyKey: 'race:streak:2026-07-09',
          }),
        },
        db,
      ),
    ]);

    const outcomes = [first.outcome, second.outcome].toSorted();
    expect(outcomes).toEqual(['claimed', 'in_flight']);

    const rows = await db
      .select()
      .from(emailNotificationDeliveries)
      .where(eq(emailNotificationDeliveries.userId, userId));
    expect(rows).toHaveLength(1);
  });

  it('reclaims an expired lease using the retry wall clock', async () => {
    const authUserId = buildTestAuthUserId('email-ledger-expired-lease');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });
    const referenceNow = new Date('2026-07-10T14:00:00.000Z');
    const retryNow = new Date(
      referenceNow.getTime() + EMAIL_DELIVERY_LEASE_MS + 1,
    );

    const first = await claimEmailNotificationDelivery(
      {
        userId,
        category: 'daily_reminder',
        deliveryKey: '2026-07-10',
        providerRequest: providerRequest(),
        now: referenceNow,
      },
      db,
    );
    expect(first.outcome).toBe('claimed');

    const retried = await claimEmailNotificationDelivery(
      {
        userId,
        category: 'daily_reminder',
        deliveryKey: '2026-07-10',
        providerRequest: providerRequest(),
        now: retryNow,
      },
      db,
    );

    expect(retried).toMatchObject({ outcome: 'claimed' });
  });

  it('reuses the original provider request and domain idempotency key for failed rows', async () => {
    const authUserId = buildTestAuthUserId('email-ledger-failed');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });

    const originalRequest = providerRequest({
      subject: 'Original subject',
      idempotencyKey: 'failed:daily_reminder:2026-07-10',
    });
    const first = await claimEmailNotificationDelivery(
      {
        userId,
        category: 'daily_reminder',
        deliveryKey: '2026-07-10',
        providerRequest: originalRequest,
      },
      db,
    );
    expect(first.outcome).toBe('claimed');
    if (first.outcome !== 'claimed') return;

    await markEmailNotificationDeliveryFailed(
      {
        deliveryId: first.deliveryId,
        claimToken: first.claimToken,
        failureClass: 'provider_configuration',
      },
      db,
    );

    const second = await claimEmailNotificationDelivery(
      {
        userId,
        category: 'daily_reminder',
        deliveryKey: '2026-07-10',
        providerRequest: providerRequest({
          subject: 'Recomputed subject',
          idempotencyKey: 'recomputed:daily_reminder:2026-07-10',
        }),
      },
      db,
    );

    expect(second.outcome).toBe('claimed');
    if (second.outcome !== 'claimed') return;
    expect(second.deliveryId).toBe(first.deliveryId);
    expect(second.claimToken).not.toBe(first.claimToken);
    expect(second.providerRequest).toEqual(originalRequest);
    expect(second.reusedProviderRequest).toBe(true);

    await markEmailNotificationDeliveryFailed(
      {
        deliveryId: second.deliveryId,
        claimToken: second.claimToken,
        failureClass: 'provider_configuration',
      },
      db,
    );

    const third = await claimEmailNotificationDelivery(
      {
        userId,
        category: 'daily_reminder',
        deliveryKey: '2026-07-10',
        providerRequest: providerRequest({
          subject: 'Another recomputed subject',
          idempotencyKey: 'another:daily_reminder:2026-07-10',
        }),
      },
      db,
    );

    expect(third.outcome).toBe('claimed');
    if (third.outcome !== 'claimed') return;
    expect(third.providerRequest).toEqual(originalRequest);
    expect(third.reusedProviderRequest).toBe(true);

    await expect(
      markEmailNotificationDeliverySent(
        {
          deliveryId: first.deliveryId,
          claimToken: first.claimToken,
          providerMessageId: 'stale',
        },
        db,
      ),
    ).rejects.toBeInstanceOf(EmailDeliveryLostLeaseError);

    await markEmailNotificationDeliverySent(
      {
        deliveryId: third.deliveryId,
        claimToken: third.claimToken,
        providerMessageId: 're_ok',
      },
      db,
    );

    const terminal = await claimEmailNotificationDelivery(
      {
        userId,
        category: 'daily_reminder',
        deliveryKey: '2026-07-10',
        providerRequest: providerRequest(),
      },
      db,
    );
    expect(terminal).toEqual({
      outcome: 'already_terminal',
      status: 'sent',
    });
  });

  it('reuses failed requests when optional fields and headers reorder', async () => {
    const authUserId = buildTestAuthUserId('email-ledger-request-order');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });
    const firstRequest = providerRequest({
      idempotencyKey: 'order:daily:2026-07-10',
      replyTo: 'support@atlaris.app',
      headers: {
        'List-Unsubscribe': '<https://example.com/unsub>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
    const first = await claimEmailNotificationDelivery(
      {
        userId,
        category: 'daily_reminder',
        deliveryKey: '2026-07-10',
        providerRequest: firstRequest,
      },
      db,
    );
    expect(first.outcome).toBe('claimed');
    if (first.outcome !== 'claimed') return;

    await markEmailNotificationDeliveryFailed(
      {
        deliveryId: first.deliveryId,
        claimToken: first.claimToken,
        failureClass: 'provider_configuration',
      },
      db,
    );

    const second = await claimEmailNotificationDelivery(
      {
        userId,
        category: 'daily_reminder',
        deliveryKey: '2026-07-10',
        providerRequest: providerRequest({
          idempotencyKey: firstRequest.idempotencyKey,
          replyTo: 'support@atlaris.app',
          headers: {
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            'List-Unsubscribe': '<https://example.com/unsub>',
          },
        }),
      },
      db,
    );

    expect(second.outcome).toBe('claimed');
    if (second.outcome !== 'claimed') return;
    expect(second.providerRequest.idempotencyKey).toBe(
      firstRequest.idempotencyKey,
    );
    expect(second.reusedProviderRequest).toBe(true);
  });

  it('does not steal a fresh pending lease and reclaims an expired one with the original request', async () => {
    const authUserId = buildTestAuthUserId('email-ledger-lease');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });
    const original = providerRequest({
      idempotencyKey: 'lease:daily:2026-07-11',
      subject: 'Original subject',
    });

    const first = await claimEmailNotificationDelivery(
      {
        userId,
        category: 'daily_reminder',
        deliveryKey: '2026-07-11',
        providerRequest: original,
        now: new Date('2026-07-11T12:00:00.000Z'),
      },
      db,
    );
    expect(first.outcome).toBe('claimed');
    if (first.outcome !== 'claimed') return;

    const fresh = await claimEmailNotificationDelivery(
      {
        userId,
        category: 'daily_reminder',
        deliveryKey: '2026-07-11',
        providerRequest: providerRequest({
          idempotencyKey: 'lease:daily:2026-07-11',
          subject: 'Should not replace',
        }),
        now: new Date('2026-07-11T12:05:00.000Z'),
      },
      db,
    );
    expect(fresh).toEqual({ outcome: 'in_flight', status: 'pending' });

    const expiredAt = new Date(
      new Date('2026-07-11T12:00:00.000Z').getTime() +
        EMAIL_DELIVERY_LEASE_MS +
        1,
    );
    const reclaimed = await claimEmailNotificationDelivery(
      {
        userId,
        category: 'daily_reminder',
        deliveryKey: '2026-07-11',
        providerRequest: providerRequest({
          idempotencyKey: 'lease:daily:2026-07-11',
          subject: 'Should not replace',
        }),
        now: expiredAt,
      },
      db,
    );

    expect(reclaimed.outcome).toBe('claimed');
    if (reclaimed.outcome !== 'claimed') return;
    expect(reclaimed.providerRequest).toMatchObject(original);
    expect(reclaimed.reusedProviderRequest).toBe(true);
  });

  it('moves ambiguous pending older than the provider window to manual_review', async () => {
    const authUserId = buildTestAuthUserId('email-ledger-manual');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });

    const claimedAt = new Date('2026-07-01T12:00:00.000Z');
    const first = await claimEmailNotificationDelivery(
      {
        userId,
        category: 'weekly_summary',
        deliveryKey: '2026-06-23',
        providerRequest: providerRequest({
          idempotencyKey: 'manual:weekly:2026-06-23',
        }),
        now: claimedAt,
      },
      db,
    );
    expect(first.outcome).toBe('claimed');
    if (first.outcome !== 'claimed') return;

    await db
      .update(emailNotificationDeliveries)
      .set({
        claimExpiresAt: claimedAt,
        updatedAt: claimedAt,
      })
      .where(eq(emailNotificationDeliveries.id, first.deliveryId));

    const later = new Date(
      claimedAt.getTime() + EMAIL_PROVIDER_IDEMPOTENCY_WINDOW_MS + 1,
    );
    const result = await claimEmailNotificationDelivery(
      {
        userId,
        category: 'weekly_summary',
        deliveryKey: '2026-06-23',
        providerRequest: providerRequest({
          idempotencyKey: 'manual:weekly:2026-06-23',
        }),
        now: later,
      },
      db,
    );

    expect(result.outcome).toBe('manual_review');

    const [row] = await db
      .select()
      .from(emailNotificationDeliveries)
      .where(eq(emailNotificationDeliveries.id, first.deliveryId));
    expect(row?.status).toBe('manual_review');
  });

  it('does not reset the ambiguity window when an expired pending lease is reclaimed', async () => {
    const authUserId = buildTestAuthUserId('email-ledger-reclaim-window');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });
    const claimedAt = new Date('2026-07-01T12:00:00.000Z');
    const first = await claimEmailNotificationDelivery(
      {
        userId,
        category: 'daily_reminder',
        deliveryKey: '2026-07-02',
        providerRequest: providerRequest({
          idempotencyKey: 'reclaim:daily:2026-07-02',
        }),
        now: claimedAt,
      },
      db,
    );
    expect(first.outcome).toBe('claimed');
    if (first.outcome !== 'claimed') return;

    const expiredAt = new Date(
      claimedAt.getTime() + EMAIL_DELIVERY_LEASE_MS + 1,
    );
    const reclaimed = await claimEmailNotificationDelivery(
      {
        userId,
        category: 'daily_reminder',
        deliveryKey: '2026-07-02',
        providerRequest: providerRequest({
          idempotencyKey: 'reclaim:daily:2026-07-02',
        }),
        now: expiredAt,
      },
      db,
    );
    expect(reclaimed.outcome).toBe('claimed');
    if (reclaimed.outcome !== 'claimed') return;

    const pastWindow = new Date(
      claimedAt.getTime() + EMAIL_PROVIDER_IDEMPOTENCY_WINDOW_MS + 1,
    );
    const result = await claimEmailNotificationDelivery(
      {
        userId,
        category: 'daily_reminder',
        deliveryKey: '2026-07-02',
        providerRequest: providerRequest({
          idempotencyKey: 'reclaim:daily:2026-07-02',
        }),
        now: pastWindow,
      },
      db,
    );

    expect(result.outcome).toBe('manual_review');
  });
});
