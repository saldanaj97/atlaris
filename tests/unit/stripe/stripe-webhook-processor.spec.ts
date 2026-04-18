/**
 * Unit tests for handleStripeWebhookDedupeAndApply.
 *
 * Focus: verifies that the function uses deps.db (injected) for both the
 * idempotency insert and the rollback delete — not a module-level global.
 */
import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleStripeWebhookDedupeAndApply,
  type StripeWebhookSideEffectDeps,
} from '@/features/billing/stripe-webhook-processor';
import { makeStripeSubscription } from '../../fixtures/stripe-mocks';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSubscription(fields: {
  id: string;
  customer: string;
}): Stripe.Subscription {
  return makeStripeSubscription(fields);
}

function makeEvent(overrides: Partial<Stripe.Event> = {}): Stripe.Event {
  return {
    id: 'evt_test_001',
    object: 'event',
    type: 'checkout.session.completed',
    livemode: false,
    data: { object: {} as Stripe.Event.Data['object'] },
    ...overrides,
  } as Stripe.Event;
}

/**
 * Builds a minimal chainable Drizzle mock. All query builders return `this`
 * so chains like `.insert().values().onConflictDoNothing().returning()` work.
 */
function buildMockDb(
  opts: {
    insertReturns?: unknown[];
    updateReturns?: unknown[];
    updateThrows?: Error;
    deleteThrows?: Error;
  } = {}
) {
  const insertReturns = opts.insertReturns ?? [{ eventId: 'evt_test_001' }];
  const updateReturns = opts.updateReturns ?? [{ userId: 'user_1' }];

  const whereDeleteMock = vi.fn().mockResolvedValue(undefined);
  if (opts.deleteThrows) {
    const err = opts.deleteThrows;
    whereDeleteMock.mockRejectedValue(err);
  }

  const deleteMock = vi.fn().mockReturnValue({ where: whereDeleteMock });

  const returningUpdateMock = vi.fn().mockResolvedValue(updateReturns);
  if (opts.updateThrows) {
    const err = opts.updateThrows;
    returningUpdateMock.mockRejectedValue(err);
  }

  const updateMock = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnValue({ returning: returningUpdateMock }),
  });

  const insertMock = vi.fn().mockReturnValue({
    values: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(insertReturns),
  });

  return { insert: insertMock, update: updateMock, delete: deleteMock };
}

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as StripeWebhookSideEffectDeps['logger'];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleStripeWebhookDedupeAndApply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Deduplication
  // -------------------------------------------------------------------------
  describe('deduplication', () => {
    it('returns "duplicate" when insert returns no rows (conflict)', async () => {
      const db = buildMockDb({ insertReturns: [] });
      const logger = makeLogger();
      const deps = {
        db,
        logger,
        users: {},
      } as unknown as StripeWebhookSideEffectDeps;

      const result = await handleStripeWebhookDedupeAndApply(makeEvent(), deps);

      expect(result).toBe('duplicate');
    });

    it('logs the event id and type on duplicate', async () => {
      const db = buildMockDb({ insertReturns: [] });
      const logger = makeLogger();
      const deps = {
        db,
        logger,
        users: {},
      } as unknown as StripeWebhookSideEffectDeps;
      const event = makeEvent({
        id: 'evt_dup_xyz',
        type: 'invoice.payment_failed',
      });

      await handleStripeWebhookDedupeAndApply(event, deps);

      expect(logger.info).toHaveBeenCalledWith(
        { type: 'invoice.payment_failed', eventId: 'evt_dup_xyz' },
        'Duplicate Stripe webhook event skipped'
      );
    });

    it('does NOT call delete when a duplicate is detected', async () => {
      const db = buildMockDb({ insertReturns: [] });
      const deps = {
        db,
        logger: makeLogger(),
        users: {},
      } as unknown as StripeWebhookSideEffectDeps;

      await handleStripeWebhookDedupeAndApply(makeEvent(), deps);

      expect(db.delete).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Successful insertion — uses injected deps.db
  // -------------------------------------------------------------------------
  describe('successful insertion', () => {
    it('returns "inserted" when no duplicate', async () => {
      const db = buildMockDb();
      const deps = {
        db,
        logger: makeLogger(),
        users: {},
      } as unknown as StripeWebhookSideEffectDeps;

      const result = await handleStripeWebhookDedupeAndApply(makeEvent(), deps);

      expect(result).toBe('inserted');
    });

    it('calls deps.db.insert with correct event fields', async () => {
      const db = buildMockDb();
      const deps = {
        db,
        logger: makeLogger(),
        users: {},
      } as unknown as StripeWebhookSideEffectDeps;
      const event = makeEvent({
        id: 'evt_abc',
        type: 'invoice.payment_failed',
        livemode: true,
      });

      await handleStripeWebhookDedupeAndApply(event, deps);

      expect(db.insert).toHaveBeenCalledTimes(1);
      // Verify the values() call received the correct shape
      const chain = db.insert.mock.results[0]?.value as ReturnType<
        typeof db.insert
      >;
      expect(chain.values).toHaveBeenCalledWith({
        eventId: 'evt_abc',
        livemode: true,
        type: 'invoice.payment_failed',
      });
    });
  });

  // -------------------------------------------------------------------------
  // Rollback on apply failure — verifies deps.db.delete is called
  // -------------------------------------------------------------------------
  describe('rollback on apply failure', () => {
    it('calls deps.db.delete when applyStripeWebhookEvent throws', async () => {
      // customer.subscription.deleted calls deps.db.update; we make it throw
      // to exercise the rollback path inside handleStripeWebhookDedupeAndApply.
      const applyError = new Error('db update failed');
      const db = buildMockDb({
        insertReturns: [{ eventId: 'evt_rollback' }],
        updateThrows: applyError,
      });
      const logger = makeLogger();
      const deps = {
        db,
        logger,
        users: { stripeCustomerId: 'col' },
      } as unknown as StripeWebhookSideEffectDeps;

      const event = makeEvent({
        id: 'evt_rollback',
        type: 'customer.subscription.deleted',
        data: {
          object: makeSubscription({ id: 'sub_123', customer: 'cus_abc' }),
        },
      });

      await expect(
        handleStripeWebhookDedupeAndApply(event, deps)
      ).rejects.toThrow('db update failed');

      // Rollback delete must use deps.db, not a module-global
      expect(db.delete).toHaveBeenCalledTimes(1);
    });

    it('logs the rollback error and re-throws the original apply error', async () => {
      const applyError = new Error('apply failed');
      const db = buildMockDb({
        insertReturns: [{ eventId: 'evt_rollback2' }],
        updateThrows: applyError,
      });
      const logger = makeLogger();
      const deps = {
        db,
        logger,
        users: { stripeCustomerId: 'col' },
      } as unknown as StripeWebhookSideEffectDeps;

      const event = makeEvent({
        id: 'evt_rollback2',
        type: 'customer.subscription.deleted',
        data: {
          object: makeSubscription({ id: 'sub_x', customer: 'cus_x' }),
        },
      });

      await expect(
        handleStripeWebhookDedupeAndApply(event, deps)
      ).rejects.toThrow('apply failed');

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 'evt_rollback2',
          error: applyError,
        }),
        'Stripe webhook processing failed; event record rolled back'
      );
    });

    it('logs cleanup failure when delete also throws', async () => {
      const applyError = new Error('apply failed');
      const cleanupError = new Error('delete failed');
      const db = buildMockDb({
        insertReturns: [{ eventId: 'evt_double_fail' }],
        updateThrows: applyError,
        deleteThrows: cleanupError,
      });
      const logger = makeLogger();
      const deps = {
        db,
        logger,
        users: { stripeCustomerId: 'col' },
      } as unknown as StripeWebhookSideEffectDeps;

      const event = makeEvent({
        id: 'evt_double_fail',
        type: 'customer.subscription.deleted',
        data: {
          object: makeSubscription({ id: 'sub_y', customer: 'cus_y' }),
        },
      });

      await expect(
        handleStripeWebhookDedupeAndApply(event, deps)
      ).rejects.toThrow('apply failed');

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ cleanupError }),
        'Failed to rollback Stripe webhook event record after processing error'
      );
    });
  });
});
