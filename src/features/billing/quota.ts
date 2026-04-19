import { getDb } from '@/lib/db/runtime';
import { logger } from '@/lib/logging/logger';
import {
  type ReserveLogEvent,
  reserveMeteredUsage,
  selectUserSubscriptionTierForUpdate,
} from './metered-reservation';
import type { DbClient } from './tier';

export { selectUserSubscriptionTierForUpdate };

type AtomicUsageType = 'regeneration' | 'export';

type AtomicUsageResult =
  | { allowed: true; newCount: number; limit: number }
  | { allowed: false; currentCount: number; limit: number };

type AtomicPdfUsageResult =
  | { allowed: true; newCount: number; limit: number }
  | { allowed: false; currentCount: number; limit: number };

/**
 * Atomically check PDF plan quota and increment usage counter in a single transaction.
 * Backed by the private metered-reservation core; preserves the historical log
 * shape so existing operational dashboards keep working.
 */
export async function atomicCheckAndIncrementPdfUsage(
  userId: string,
  dbClient: DbClient = getDb()
): Promise<AtomicPdfUsageResult> {
  const result = await reserveMeteredUsage({ userId, meter: 'pdf' }, dbClient, {
    onResult: emitPdfReservationLog,
  });

  if (!result.ok) {
    return {
      allowed: false,
      currentCount: result.currentCount,
      limit: result.limit,
    };
  }
  return {
    allowed: true,
    newCount: result.token.newCount,
    limit: result.token.limit,
  };
}

export async function atomicCheckAndIncrementUsage(
  userId: string,
  type: AtomicUsageType,
  dbClient: DbClient = getDb()
): Promise<AtomicUsageResult> {
  const result = await reserveMeteredUsage({ userId, meter: type }, dbClient);

  if (!result.ok) {
    return {
      allowed: false,
      currentCount: result.currentCount,
      limit: result.limit,
    };
  }
  return {
    allowed: true,
    newCount: result.token.newCount,
    limit: result.token.limit,
  };
}

function emitPdfReservationLog(event: ReserveLogEvent): void {
  if (event.kind === 'denied') {
    logger.warn(
      {
        userId: event.userId,
        month: event.month,
        action: 'atomicCheckAndIncrementPdfUsage',
        currentCount: event.currentCount,
        limit: event.limit,
      },
      'PDF plan quota denied'
    );
    return;
  }

  logger.info(
    {
      userId: event.userId,
      month: event.month,
      action: 'atomicCheckAndIncrementPdfUsage',
      newCount: event.newCount,
      limit: event.limit,
    },
    event.unlimited
      ? 'PDF plan quota allowed (Infinity tier)'
      : 'PDF plan quota allowed'
  );
}
