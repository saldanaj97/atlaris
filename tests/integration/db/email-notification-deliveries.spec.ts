import type { PersistedProviderRequest } from '@/features/notifications/email/types';

import {
  claimEmailNotificationDelivery,
  EMAIL_DELIVERY_LEASE_MS,
  EMAIL_PROVIDER_IDEMPOTENCY_WINDOW_MS,
  EmailDeliveryLostLeaseError,
  markEmailNotificationDeliveryFailed,
  markEmailNotificationDeliverySent,
  markEmailNotificationDeliverySkipped,
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

function hasCheckConstraintViolation(
  err: unknown,
  constraintName: string,
): boolean {
  let current: unknown = err;
  for (let i = 0; i < 8 && current; i += 1) {
    if (
      current !== null &&
      typeof current === 'object' &&
      'code' in current &&
      (current as { code?: unknown }).code === '23514'
    ) {
      return true;
    }
    if (current instanceof Error) {
      if (current.message.includes(constraintName)) {
        return true;
      }
      current = current.cause;
      continue;
    }
    break;
  }
  return false;
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

  it('clears resolved delivery payloads while preserving ledger tombstones', async () => {
    const authUserId = buildTestAuthUserId('email-ledger-resolved-payload');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });

    const sent = await claimEmailNotificationDelivery(
      {
        userId,
        category: 'daily_reminder',
        deliveryKey: '2026-07-09',
        providerRequest: providerRequest(),
      },
      db,
    );
    expect(sent.outcome).toBe('claimed');
    if (sent.outcome !== 'claimed') return;

    await markEmailNotificationDeliverySent(
      {
        deliveryId: sent.deliveryId,
        claimToken: sent.claimToken,
        providerMessageId: 'msg_resolved',
      },
      db,
    );

    const skipped = await claimEmailNotificationDelivery(
      {
        userId,
        category: 'weekly_summary',
        deliveryKey: '2026-07-13',
        providerRequest: providerRequest({
          idempotencyKey: 'resolved:weekly_summary:2026-07-13',
        }),
      },
      db,
    );
    expect(skipped.outcome).toBe('claimed');
    if (skipped.outcome !== 'claimed') return;

    await markEmailNotificationDeliverySkipped(
      {
        deliveryId: skipped.deliveryId,
        claimToken: skipped.claimToken,
        failureClass: 'preference_disabled',
      },
      db,
    );

    const rows = await db
      .select()
      .from(emailNotificationDeliveries)
      .where(eq(emailNotificationDeliveries.userId, userId));
    const sentRow = rows.find((row) => row.id === sent.deliveryId);
    const skippedRow = rows.find((row) => row.id === skipped.deliveryId);

    expect(sentRow).toMatchObject({
      status: 'sent',
      providerRequest: null,
      claimToken: null,
      claimExpiresAt: null,
      attemptCount: 1,
      providerMessageId: 'msg_resolved',
    });
    expect(skippedRow).toMatchObject({
      status: 'skipped',
      providerRequest: null,
      claimToken: null,
      claimExpiresAt: null,
      attemptCount: 1,
      failureClass: 'preference_disabled',
    });
  });

  it.each(['sent', 'skipped'] as const)(
    'rejects provider payloads on %s delivery tombstones',
    async (status) => {
      const authUserId = buildTestAuthUserId(
        `email-ledger-${status}-payload-check`,
      );
      const userId = await ensureUser({
        authUserId,
        email: buildTestEmail(authUserId),
      });

      await expect(
        db.insert(emailNotificationDeliveries).values({
          userId,
          category: 'daily_reminder',
          deliveryKey: `2026-07-09-${status}`,
          status,
          providerRequest: providerRequest(),
        }),
      ).rejects.toSatisfy((error: unknown) =>
        hasCheckConstraintViolation(
          error,
          'email_notification_deliveries_resolved_provider_request_null',
        ),
      );
    },
  );

  it('validates the resolved-payload constraint after scrubbing legacy rows', async () => {
    const constraints = (await db.execute(sql`
      select convalidated
      from pg_constraint
      where conname = 'email_notification_deliveries_resolved_provider_request_null'
    `)) as Array<{ convalidated: boolean }>;

    expect(constraints).toEqual([{ convalidated: true }]);
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

  it('accepts a recomputed provider request for definitively rejected rows', async () => {
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

    const recomputedRequest = providerRequest({
      subject: 'Recomputed subject',
      idempotencyKey: 'recomputed:daily_reminder:2026-07-10',
    });
    const second = await claimEmailNotificationDelivery(
      {
        userId,
        category: 'daily_reminder',
        deliveryKey: '2026-07-10',
        providerRequest: recomputedRequest,
      },
      db,
    );

    expect(second.outcome).toBe('claimed');
    if (second.outcome !== 'claimed') return;
    expect(second.deliveryId).toBe(first.deliveryId);
    expect(second.claimToken).not.toBe(first.claimToken);
    expect(second.providerRequest).toEqual(recomputedRequest);
    expect(second.reusedProviderRequest).toBe(false);

    await markEmailNotificationDeliveryFailed(
      {
        deliveryId: second.deliveryId,
        claimToken: second.claimToken,
        failureClass: 'provider_configuration',
      },
      db,
    );

    const latestRequest = providerRequest({
      subject: 'Another recomputed subject',
      idempotencyKey: 'another:daily_reminder:2026-07-10',
    });
    const third = await claimEmailNotificationDelivery(
      {
        userId,
        category: 'daily_reminder',
        deliveryKey: '2026-07-10',
        providerRequest: latestRequest,
      },
      db,
    );

    expect(third.outcome).toBe('claimed');
    if (third.outcome !== 'claimed') return;
    expect(third.providerRequest).toEqual(latestRequest);
    expect(third.reusedProviderRequest).toBe(false);

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

  it('rebinds a definitively failed delivery when its recipient changes', async () => {
    const authUserId = buildTestAuthUserId('email-ledger-recipient-rebind');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });
    const original = providerRequest({
      to: 'old@example.com',
      idempotencyKey: 'rebind:daily:2026-07-10',
    });
    const first = await claimEmailNotificationDelivery(
      {
        userId,
        category: 'daily_reminder',
        deliveryKey: '2026-07-10',
        providerRequest: original,
      },
      db,
    );
    expect(first.outcome).toBe('claimed');
    if (first.outcome !== 'claimed') return;

    await markEmailNotificationDeliveryFailed(
      {
        deliveryId: first.deliveryId,
        claimToken: first.claimToken,
        failureClass: 'provider_rate_limited',
      },
      db,
    );

    const replacement = providerRequest({
      to: 'new@example.com',
      idempotencyKey: original.idempotencyKey,
    });
    const retried = await claimEmailNotificationDelivery(
      {
        userId,
        category: 'daily_reminder',
        deliveryKey: '2026-07-10',
        providerRequest: replacement,
      },
      db,
    );

    expect(retried).toMatchObject({
      outcome: 'claimed',
      deliveryId: first.deliveryId,
      providerRequest: replacement,
      reusedProviderRequest: false,
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
        failureClass: 'provider_rate_limited',
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
    expect(second.reclaimedExpiredPending).toBe(false);
  });

  it('recomputes failed deliveries with malformed persisted headers', async () => {
    const authUserId = buildTestAuthUserId('email-ledger-malformed-failed');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });
    const first = await claimEmailNotificationDelivery(
      {
        userId,
        category: 'daily_reminder',
        deliveryKey: '2026-07-10',
        providerRequest: providerRequest({
          idempotencyKey: 'malformed-failed:daily:2026-07-10',
        }),
      },
      db,
    );
    expect(first.outcome).toBe('claimed');
    if (first.outcome !== 'claimed') return;

    await markEmailNotificationDeliveryFailed(
      {
        deliveryId: first.deliveryId,
        claimToken: first.claimToken,
        failureClass: 'provider_rate_limited',
      },
      db,
    );
    await db
      .update(emailNotificationDeliveries)
      .set({
        providerRequest: providerRequest({
          headers: { 'List-Unsubscribe\nInjected': 'value' },
          idempotencyKey: 'malformed-failed:daily:2026-07-10',
        }),
      })
      .where(eq(emailNotificationDeliveries.id, first.deliveryId));

    const recomputed = providerRequest({
      subject: 'Recomputed subject',
      idempotencyKey: 'malformed-failed:daily:2026-07-10',
    });
    const retried = await claimEmailNotificationDelivery(
      {
        userId,
        category: 'daily_reminder',
        deliveryKey: '2026-07-10',
        providerRequest: recomputed,
      },
      db,
    );

    expect(retried).toMatchObject({
      outcome: 'claimed',
      providerRequest: recomputed,
      reusedProviderRequest: false,
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
    expect(reclaimed.reclaimedExpiredPending).toBe(true);
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

  it('moves an expired pending delivery with a changed recipient to manual review', async () => {
    const authUserId = buildTestAuthUserId('email-ledger-recipient-review');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });
    const claimedAt = new Date('2026-07-01T12:00:00.000Z');
    const original = providerRequest({
      to: 'old@example.com',
      idempotencyKey: 'review:weekly:2026-06-30',
    });
    const first = await claimEmailNotificationDelivery(
      {
        userId,
        category: 'weekly_summary',
        deliveryKey: '2026-06-30',
        providerRequest: original,
        now: claimedAt,
      },
      db,
    );
    expect(first.outcome).toBe('claimed');
    if (first.outcome !== 'claimed') return;

    const retriedAt = new Date(
      claimedAt.getTime() + EMAIL_DELIVERY_LEASE_MS + 1,
    );
    const result = await claimEmailNotificationDelivery(
      {
        userId,
        category: 'weekly_summary',
        deliveryKey: '2026-06-30',
        providerRequest: providerRequest({
          to: 'new@example.com',
          idempotencyKey: original.idempotencyKey,
        }),
        now: retriedAt,
      },
      db,
    );

    expect(result).toEqual({
      outcome: 'manual_review',
      deliveryId: first.deliveryId,
    });
    const [row] = await db
      .select()
      .from(emailNotificationDeliveries)
      .where(eq(emailNotificationDeliveries.id, first.deliveryId));
    expect(row).toMatchObject({
      status: 'manual_review',
      failureClass: 'recipient_changed_since_claim',
      providerRequest: original,
      claimToken: null,
      claimExpiresAt: null,
    });
  });

  it('moves an expired pending delivery with malformed headers to manual review', async () => {
    const authUserId = buildTestAuthUserId('email-ledger-malformed-pending');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });
    const claimedAt = new Date('2026-07-01T12:00:00.000Z');
    const first = await claimEmailNotificationDelivery(
      {
        userId,
        category: 'weekly_summary',
        deliveryKey: '2026-06-30',
        providerRequest: providerRequest({
          idempotencyKey: 'malformed-pending:weekly:2026-06-30',
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
        providerRequest: providerRequest({
          headers: { 'List-Unsubscribe': 'value\r\ninjected: true' },
          idempotencyKey: 'malformed-pending:weekly:2026-06-30',
        }),
      })
      .where(eq(emailNotificationDeliveries.id, first.deliveryId));

    const result = await claimEmailNotificationDelivery(
      {
        userId,
        category: 'weekly_summary',
        deliveryKey: '2026-06-30',
        providerRequest: providerRequest({
          idempotencyKey: 'malformed-pending:weekly:2026-06-30',
        }),
        now: new Date(claimedAt.getTime() + EMAIL_DELIVERY_LEASE_MS + 1),
      },
      db,
    );

    expect(result).toEqual({
      outcome: 'manual_review',
      deliveryId: first.deliveryId,
    });
    const [row] = await db
      .select()
      .from(emailNotificationDeliveries)
      .where(eq(emailNotificationDeliveries.id, first.deliveryId));
    expect(row).toMatchObject({
      status: 'manual_review',
      failureClass: 'persisted_provider_request_invalid',
      claimToken: null,
      claimExpiresAt: null,
    });
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
