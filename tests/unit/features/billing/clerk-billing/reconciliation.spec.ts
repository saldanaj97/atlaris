import type { WebhookEvent } from '@clerk/nextjs/webhooks';
import type { db as serviceRoleDb } from '@supabase/service-role';

import { applyVerifiedClerkBillingEvent } from '@/features/billing/clerk-billing/reconciliation';
import { createLogger } from '@/lib/logging/logger';
import { describe, expect, it, vi } from 'vitest';

type ServiceRoleDb = typeof serviceRoleDb;

function makeBillingEvent(): WebhookEvent {
  return {
    type: 'subscription.updated',
    data: {
      id: 'sub_fixture',
      status: 'active',
      payer: { user_id: 'user_missing' },
      payer_id: 'user_missing',
      items: [],
    },
  } as unknown as WebhookEvent;
}

function makeLogger() {
  return Object.assign(createLogger({ test: 'clerk-reconciliation.spec' }), {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  });
}

function makeDb(opts: {
  insertReturns?: unknown[];
  selectReturns?: unknown[];
}) {
  const insertReturns = opts.insertReturns ?? [{ eventId: 'evt_fixture' }];
  const selectReturns = opts.selectReturns ?? [];

  return {
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
    insert: vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue(insertReturns),
      values: vi.fn().mockReturnThis(),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(selectReturns),
        }),
      }),
    }),
  } as unknown as ServiceRoleDb;
}

describe('applyVerifiedClerkBillingEvent', () => {
  it('short-circuits duplicate webhook ids without dispatching', async () => {
    const db = makeDb({ insertReturns: [] });

    await expect(
      applyVerifiedClerkBillingEvent(makeBillingEvent(), 'evt_duplicate', {
        db,
        logger: makeLogger(),
      }),
    ).resolves.toEqual({ status: 'duplicate' });

    expect(db.select).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('removes the idempotency row when the local user is not ready yet', async () => {
    const db = makeDb({});

    await expect(
      applyVerifiedClerkBillingEvent(makeBillingEvent(), 'evt_retryable', {
        db,
        logger: makeLogger(),
      }),
    ).rejects.toThrow('No local user found for Clerk Billing payer');

    expect(db.delete).toHaveBeenCalledTimes(1);
  });
});
