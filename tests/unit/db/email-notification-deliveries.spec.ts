import type { PersistedProviderRequest } from '@/features/notifications/email/types';

import { claimEmailNotificationDelivery } from '@/lib/db/queries/email-notification-deliveries';
import { describe, expect, it, vi } from 'vitest';

function providerRequest(): PersistedProviderRequest {
  return {
    from: 'Atlaris <notifications@mail.atlaris.app>',
    to: 'u@example.com',
    subject: 'Hello',
    html: '<p>Hi</p>',
    text: 'Hi',
    idempotencyKey: 'user:daily_reminder:2026-07-09',
  };
}

describe('claimEmailNotificationDelivery', () => {
  it('returns the current sent status when an ambiguity manual-review CAS loses', async () => {
    const createdAt = new Date('2026-07-01T12:00:00.000Z');
    const claimExpiresAt = new Date('2026-07-01T12:15:00.000Z');
    const insertReturning = vi.fn().mockResolvedValue([]);
    const manualReviewReturning = vi.fn().mockResolvedValue([]);
    const manualReviewWhere = vi
      .fn()
      .mockReturnValue({ returning: manualReviewReturning });
    const existingWhere = vi.fn().mockResolvedValue([
      {
        id: 'delivery-1',
        status: 'pending',
        claimToken: 'stale-claim',
        claimExpiresAt,
        providerRequest: providerRequest(),
        updatedAt: createdAt,
        createdAt,
      },
    ]);
    const currentWhere = vi.fn().mockResolvedValue([{ status: 'sent' }]);
    const select = vi
      .fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({ where: existingWhere }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({ where: currentWhere }),
      });
    const db = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: insertReturning,
          }),
        }),
      }),
      select,
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: manualReviewWhere }),
      }),
    } as never;

    const result = await claimEmailNotificationDelivery(
      {
        userId: 'user-1',
        category: 'daily_reminder',
        deliveryKey: '2026-07-09',
        providerRequest: providerRequest(),
        now: new Date('2026-07-02T12:00:00.001Z'),
      },
      db,
    );

    expect(result).toEqual({ outcome: 'already_terminal', status: 'sent' });
    expect(manualReviewWhere).toHaveBeenCalledTimes(1);
  });
});
