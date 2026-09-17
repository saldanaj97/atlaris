import { loadBillingSnapshot } from '@/app/(app)/settings/billing/components/load-billing-snapshot';
import {
  LedgerRow,
  LedgerStackedRow,
} from '@/app/(app)/settings/components/LedgerPrimitives';
import {
  formatCompactUsageLimit,
  formatUsageLimitLabel,
  getUsagePercent,
} from '@/app/_shared/usage-formatting';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ROUTES } from '@/features/navigation/routes';
import { Briefcase } from 'lucide-react';
import Link from 'next/link';

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

function formatPlanTierName(tier: string): string {
  return `${tier.charAt(0).toUpperCase()}${tier.slice(1)}`;
}

/**
 * Plan & billing rows for the Ledger settings surface.
 */
export async function BillingPlanRows({ locale }: { locale?: string }) {
  const snapshot = await loadBillingSnapshot();
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

  const tierName = formatPlanTierName(snapshot.tier);

  return (
    <div className='space-y-4'>
      <p className='text-sm text-muted-foreground'>
        You're currently on the {tierName} plan.
      </p>
      <div className='flex flex-col gap-3 rounded-lg border border-panel-border bg-panel/70 p-4 sm:flex-row sm:items-center sm:justify-between'>
        <div className='flex min-w-0 items-center gap-3'>
          <span
            aria-hidden='true'
            className='flex size-10 shrink-0 items-center justify-center rounded-lg border border-panel-border bg-panel-muted text-primary'
          >
            <Briefcase className='size-4' />
          </span>
          <p className='text-sm font-semibold text-foreground'>
            {tierName} Plan
          </p>
        </div>
        <Button asChild variant='outline' size='sm'>
          <Link href={ROUTES.PRICING}>View plans</Link>
        </Button>
      </div>
      <div className='divide-y divide-border/40 dark:divide-border/30'>
        <LedgerRow label='Status'>
          <span className='text-foreground'>
            {snapshot.subscriptionStatus ?? '—'}
          </span>
        </LedgerRow>
        <LedgerRow label='Next billing date'>
          <span className='text-foreground'>{nextBilling}</span>
        </LedgerRow>
      </div>
    </div>
  );
}

/**
 * Usage meters for the Ledger settings surface.
 */
export async function UsageRows() {
  const snapshot = await loadBillingSnapshot();

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
    </>
  );
}
