/**
 * Private metered reservation core for billing usage counters.
 *
 * Owns the lock/check/increment transaction and the symmetric month-bound
 * compensation. Reserve and compensate exchange a `MeteredReservationToken`
 * so rollback is always tied to the exact bucket that was reserved (no
 * drift across midnight or month boundaries between the two phases).
 *
 * Public callers should not import this module directly. Use
 * `regeneration-quota-boundary.ts` for the regeneration HTTP path; PDF and
 * other meters continue to flow through the wrappers in `quota.ts` and
 * `usage-metrics.ts` until they are migrated in a later phase.
 */

import { and, eq, sql } from 'drizzle-orm';
import { usageMetrics, users } from '@/lib/db/schema';
import { logger } from '@/lib/logging/logger';
import type { SubscriptionTier } from '@/shared/types/billing.types';
import { UsageMetricsLockError, UserNotFoundError } from './errors';
import type { DbClient } from './tier';
import { TIER_LIMITS } from './tier-limits';
import {
  ensureUsageMetricsExist,
  getCurrentMonth,
  incrementPdfUsageInTx,
  incrementUsageInTx,
} from './usage-metrics';

export type MeterKind = 'regeneration' | 'export' | 'pdf';

/**
 * Drizzle's `db.transaction` callback receives a transaction-scoped client.
 * `BillingTx` extracts that callback parameter type so helpers like
 * `selectUserSubscriptionTierForUpdate` and `lockUsageMetricsForMonth` can
 * accept it without leaking Drizzle internals into every signature.
 */
type BillingTx = Parameters<Parameters<DbClient['transaction']>[0]>[0];

type MeterColumn = 'regenerationsUsed' | 'exportsUsed' | 'pdfPlansGenerated';

type MeterConfig = {
  column: MeterColumn;
  resolveLimit: (tier: SubscriptionTier) => number;
  incrementInTx: (
    tx: BillingTx,
    userId: string,
    month: string
  ) => Promise<void>;
  readColumn: (metrics: UsageMetricsRow) => number;
  decrementSql: () => ReturnType<typeof sql>;
};

const METER_CONFIG: Record<MeterKind, MeterConfig> = {
  regeneration: {
    column: 'regenerationsUsed',
    resolveLimit: (tier) => TIER_LIMITS[tier].monthlyRegenerations,
    incrementInTx: (tx, userId, month) =>
      incrementUsageInTx(tx, userId, month, 'regeneration'),
    readColumn: (metrics) => metrics.regenerationsUsed,
    decrementSql: () => sql`GREATEST(0, ${usageMetrics.regenerationsUsed} - 1)`,
  },
  export: {
    column: 'exportsUsed',
    resolveLimit: (tier) => TIER_LIMITS[tier].monthlyExports,
    incrementInTx: (tx, userId, month) =>
      incrementUsageInTx(tx, userId, month, 'export'),
    readColumn: (metrics) => metrics.exportsUsed,
    decrementSql: () => sql`GREATEST(0, ${usageMetrics.exportsUsed} - 1)`,
  },
  pdf: {
    column: 'pdfPlansGenerated',
    resolveLimit: (tier) => TIER_LIMITS[tier].monthlyPdfPlans,
    incrementInTx: (tx, userId, month) =>
      incrementPdfUsageInTx(tx, userId, month),
    readColumn: (metrics) => metrics.pdfPlansGenerated,
    decrementSql: () => sql`GREATEST(0, ${usageMetrics.pdfPlansGenerated} - 1)`,
  },
};

type UsageMetricsRow = Awaited<ReturnType<typeof lockUsageMetricsForMonth>>;

/**
 * Snapshot of a successful reservation. Pass back to
 * `compensateMeteredReservation` to release the slot in the same month
 * bucket without any clock drift.
 *
 * Single-use contract: each token represents exactly one reserved slot.
 * Callers must compensate with a token at most once; reusing a token
 * would silently double-decrement the same row. Tokens are also
 * process-internal and must not be persisted or JSON-serialized.
 *
 * Note: `limit` may be `Infinity` for unlimited tiers. If a future
 * caller does need to cross a JSON boundary, swap to `number | null` or
 * add an `unlimited` flag here.
 */
export type MeteredReservationToken = {
  userId: string;
  month: string;
  meter: MeterKind;
  limit: number;
  newCount: number;
};

export type ReserveMeteredResult =
  | { ok: true; token: MeteredReservationToken }
  | { ok: false; currentCount: number; limit: number };

export async function selectUserSubscriptionTierForUpdate(
  tx: BillingTx,
  userId: string
): Promise<{ subscriptionTier: SubscriptionTier }> {
  const [user] = await tx
    .select({ subscriptionTier: users.subscriptionTier })
    .from(users)
    .where(eq(users.id, userId))
    .for('update');

  if (!user) {
    throw new UserNotFoundError(userId);
  }
  return user;
}

async function lockUsageMetricsForMonth(
  tx: BillingTx,
  userId: string,
  month: string
) {
  await ensureUsageMetricsExist(tx, userId, month);
  const [metrics] = await tx
    .select()
    .from(usageMetrics)
    .where(and(eq(usageMetrics.userId, userId), eq(usageMetrics.month, month)))
    .for('update');

  if (!metrics) {
    throw new UsageMetricsLockError(userId, month);
  }
  return metrics;
}

export type ReserveMeteredUsageOptions = {
  /** Override the current-month resolver (testing or cross-midnight scenarios). */
  now?: () => Date;
  /** Optional log hook fired inside the reservation transaction (used by PDF path to preserve historical telemetry). */
  onResult?: (event: ReserveLogEvent) => void;
};

export type ReserveLogEvent =
  | {
      kind: 'allowed';
      userId: string;
      month: string;
      meter: MeterKind;
      newCount: number;
      limit: number;
      unlimited: boolean;
    }
  | {
      kind: 'denied';
      userId: string;
      month: string;
      meter: MeterKind;
      currentCount: number;
      limit: number;
    };

export async function reserveMeteredUsage(
  params: { userId: string; meter: MeterKind },
  dbClient: DbClient,
  options: ReserveMeteredUsageOptions = {}
): Promise<ReserveMeteredResult> {
  const { userId, meter } = params;
  const config = METER_CONFIG[meter];

  return dbClient.transaction(async (tx) => {
    const user = await selectUserSubscriptionTierForUpdate(tx, userId);
    const limit = config.resolveLimit(user.subscriptionTier);
    const month = getCurrentMonth(options.now?.());

    const metrics = await lockUsageMetricsForMonth(tx, userId, month);
    const currentCount = config.readColumn(metrics);

    if (limit !== Infinity && currentCount >= limit) {
      options.onResult?.({
        kind: 'denied',
        userId,
        month,
        meter,
        currentCount,
        limit,
      });
      return { ok: false, currentCount, limit };
    }

    await config.incrementInTx(tx, userId, month);
    const newCount = currentCount + 1;

    options.onResult?.({
      kind: 'allowed',
      userId,
      month,
      meter,
      newCount,
      limit,
      unlimited: limit === Infinity,
    });

    return {
      ok: true,
      token: { userId, month, meter, limit, newCount },
    };
  });
}

/**
 * Release a previously reserved slot using the original month bucket.
 * Always clamps at zero. Logs a warning if the row is missing (no throw).
 *
 * Single-use: callers must invoke this at most once per token. There is
 * no idempotency guard at the row level, so a second call would double
 * decrement (clamped at zero) and create a usage drift.
 */
export async function compensateMeteredReservation(
  token: MeteredReservationToken,
  dbClient: DbClient
): Promise<void> {
  const config = METER_CONFIG[token.meter];

  const [updated] = await dbClient
    .update(usageMetrics)
    .set({
      [config.column]: config.decrementSql(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(usageMetrics.userId, token.userId),
        eq(usageMetrics.month, token.month)
      )
    )
    .returning({ value: usageMetrics[config.column] });

  if (!updated) {
    logger.warn(
      {
        userId: token.userId,
        month: token.month,
        meter: token.meter,
        action: 'compensateMeteredReservation',
      },
      'No usage metrics found to decrement'
    );
    return;
  }

  logger.info(
    {
      userId: token.userId,
      month: token.month,
      meter: token.meter,
      action: 'compensateMeteredReservation',
      newCount: updated.value,
    },
    'Metered usage reservation compensated'
  );
}
