import {
  LedgerRow,
  LedgerStackedRow,
} from '@/app/(app)/settings/components/LedgerPrimitives';
import {
  formatCompactUsageLimit,
  formatUsageLimitLabel,
  getUsagePercent,
} from '@/app/_shared/usage-formatting';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  BillingSnapshotNotFoundError,
  getBillingAccountSnapshot,
} from '@/features/billing/account-snapshot';
import { ROUTES } from '@/features/navigation/routes';
import { requestBoundary } from '@/lib/api/request-boundary';
import { logger } from '@/lib/logging/logger';
import { redirect } from 'next/navigation';
import { cache } from 'react';

type UsageMeterRowProps = {
  label: string;
  ariaLabel: string;
  used: number;
  limit: number | null | undefined;
};

function UsageMeterRow({ label, ariaLabel, used, limit }: UsageMeterRowProps) {
  return (
    <LedgerStackedRow label={label}>
      <div className='flex items-center justify-between text-sm'>
        <span className='text-muted-foreground tabular-nums'>
          {used}/{formatCompactUsageLimit(limit)}
        </span>
      </div>
      <Progress
        value={getUsagePercent(used, limit)}
        aria-label={`${ariaLabel}: ${used} of ${formatUsageLimitLabel(limit)}`}
      />
    </LedgerStackedRow>
  );
}

const loadBillingSnapshot = cache(async (returnPath: string) => {
  const result = await requestBoundary.component(async ({ actor, db }) => {
    try {
      return {
        snapshot: await getBillingAccountSnapshot({
          userId: actor.id,
          dbClient: db,
        }),
      };
    } catch (error) {
      if (error instanceof BillingSnapshotNotFoundError) {
        logger.warn(
          {
            userId: actor.id,
          },
          'Billing snapshot not found for settings ledger',
        );
      } else {
        logger.error(
          {
            error,
            userId: actor.id,
          },
          'Billing snapshot failed for settings ledger',
        );
      }

      return { snapshot: null };
    }
  });

  if (!result) {
    redirect(
      `${ROUTES.AUTH.SIGN_IN}?redirect_url=${encodeURIComponent(returnPath)}`,
    );
  }

  return result.snapshot;
});

function formatNextBilling(
  subscriptionPeriodEnd: Date | string | null | undefined,
  locale?: string,
): string {
  if (!subscriptionPeriodEnd) {
    return '—';
  }

  return new Date(subscriptionPeriodEnd).toLocaleDateString(locale ?? 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Plan & billing rows for the Ledger settings surface.
 */
export async function BillingPlanRows({
  locale,
  returnPath = ROUTES.SETTINGS.BILLING,
}: {
  locale?: string;
  returnPath?: string;
}) {
  const snapshot = await loadBillingSnapshot(returnPath);
  const nextBilling = formatNextBilling(
    snapshot?.subscriptionPeriodEnd,
    locale,
  );

  if (!snapshot) {
    return (
      <LedgerRow label='Billing'>
        <span>Unavailable right now.</span>
      </LedgerRow>
    );
  }

  return (
    <>
      <LedgerRow label='Current plan'>
        <Badge variant='product'>{snapshot.tier.toUpperCase()}</Badge>
      </LedgerRow>
      <LedgerRow label='Status'>
        <span className='text-foreground'>
          {snapshot.subscriptionStatus ?? '—'}
        </span>
      </LedgerRow>
      <LedgerRow label='Next billing date'>
        <span className='text-foreground'>{nextBilling}</span>
      </LedgerRow>
    </>
  );
}

/**
 * Usage meters for the Ledger settings surface.
 */
export async function UsageRows({
  returnPath = ROUTES.SETTINGS.BILLING,
}: {
  returnPath?: string;
} = {}) {
  const snapshot = await loadBillingSnapshot(returnPath);

  if (!snapshot) {
    return (
      <LedgerRow label='Usage'>
        <span>Unavailable right now.</span>
      </LedgerRow>
    );
  }

  return (
    <>
      <UsageMeterRow
        label='Active plans'
        ariaLabel='Active plans'
        used={snapshot.usage.activePlans.current}
        limit={snapshot.usage.activePlans.limit}
      />
      <UsageMeterRow
        label='Regenerations (monthly)'
        ariaLabel='Monthly regenerations'
        used={snapshot.usage.regenerations.used}
        limit={snapshot.usage.regenerations.limit}
      />
      <UsageMeterRow
        label='Lesson generations (monthly)'
        ariaLabel='Monthly lesson generations'
        used={snapshot.usage.lessonGenerations.used}
        limit={snapshot.usage.lessonGenerations.limit}
      />
    </>
  );
}
