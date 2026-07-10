import type { PersistedProviderRequest } from '@/features/notifications/email/types';

import {
  claimEmailNotificationDelivery,
  EMAIL_DELIVERY_LEASE_MS,
  EMAIL_PROVIDER_IDEMPOTENCY_WINDOW_MS,
  EmailDeliveryLostLeaseError,
  markEmailNotificationDeliveryFailed,
  markEmailNotificationDeliverySent,
} from '@/lib/db/queries/email-notification-deliveries';
import { emailNotificationDeliveries } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { ensureUser } from '@tests/helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq } from 'drizzle-orm';
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

  it('reclaims failed rows with a rotated claim token and preserves sent terminal state', async () => {
    const authUserId = buildTestAuthUserId('email-ledger-failed');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });

    const first = await claimEmailNotificationDelivery(
      {
        userId,
        category: 'daily_reminder',
        deliveryKey: '2026-07-10',
        providerRequest: providerRequest(),
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
          subject: 'Corrected subject',
        }),
      },
      db,
    );

    expect(second.outcome).toBe('claimed');
    if (second.outcome !== 'claimed') return;
    expect(second.deliveryId).toBe(first.deliveryId);
    expect(second.claimToken).not.toBe(first.claimToken);
    expect(second.providerRequest.subject).toBe('Corrected subject');
    expect(second.providerRequest.idempotencyKey).not.toBe(
      providerRequest().idempotencyKey,
    );

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
        deliveryId: second.deliveryId,
        claimToken: second.claimToken,
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
