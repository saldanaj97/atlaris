import ManageSubscriptionButton from './ManageSubscriptionButton';
import {
  formatCompactUsageLimit,
  formatUsageLimitLabel,
  getUsagePercent,
} from '@/app/_shared/usage-formatting';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { getBillingAccountSnapshot } from '@/features/billing/account-snapshot';
import { ROUTES } from '@/features/navigation/routes';
import { requestBoundary } from '@/lib/api/request-boundary';
import { redirect } from 'next/navigation';

type UsageMeterRowProps = {
  label: string;
  ariaLabel: string;
  used: number;
  limit: number | null | undefined;
};

function UsageMeterRow({ label, ariaLabel, used, limit }: UsageMeterRowProps) {
  return (
    <div>
      <div className='mb-1 flex items-center justify-between text-sm'>
        <span>{label}</span>
        <span className='text-muted-foreground tabular-nums'>
          {used}/{formatCompactUsageLimit(limit)}
        </span>
      </div>
      <Progress
        value={getUsagePercent(used, limit)}
        aria-label={`${ariaLabel}: ${used} of ${formatUsageLimitLabel(limit)}`}
      />
    </div>
  );
}

/**
 * Async component that fetches subscription and usage data.
 * Wrapped in Suspense boundary by the parent page.
 */
export async function BillingCards({ locale }: { locale?: string }) {
  const effectiveLocale = locale ?? 'en-US';
  const result = await requestBoundary.component(async ({ actor, db }) => ({
    user: actor,
    snapshot: await getBillingAccountSnapshot({
      userId: actor.id,
      dbClient: db,
    }),
  }));

  if (!result) {
    redirect(
      `${ROUTES.AUTH.SIGN_IN}?redirect_url=${encodeURIComponent(ROUTES.SETTINGS.BILLING)}`,
    );
  }

  const { snapshot } = result;

  if (!snapshot) {
    return (
      <Card>
        <CardHeader>
          <CardTitle as='h3'>Billing unavailable</CardTitle>
          <CardDescription>
            We couldn&apos;t load your billing details right now.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const nextBilling = snapshot.subscriptionPeriodEnd
    ? new Date(snapshot.subscriptionPeriodEnd).toLocaleDateString(
        effectiveLocale,
        {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        },
      )
    : '—';

  return (
    <>
      <Card>
        <CardHeader>
          <div className='space-y-1'>
            <CardTitle as='h3'>Current Plan</CardTitle>
            <CardDescription>Manage your subscription</CardDescription>
          </div>
          <CardAction>
            <Badge variant='product'>{snapshot.tier.toUpperCase()}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className='space-y-2 text-sm'>
          <div className='flex items-center justify-between'>
            <span>Status</span>
            <span className='text-muted-foreground'>
              {snapshot.subscriptionStatus ?? '—'}
            </span>
          </div>
          <div className='flex items-center justify-between'>
            <span>Next billing date</span>
            <span className='text-muted-foreground'>{nextBilling}</span>
          </div>

          <div className='mt-4'>
            <ManageSubscriptionButton
              className='w-full'
              canOpenBillingPortal={snapshot.canOpenBillingPortal}
            />
            {!snapshot.canOpenBillingPortal && (
              <p className='mt-2 text-center text-sm text-muted-foreground'>
                Billing features are unavailable.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as='h3'>Usage</CardTitle>
        </CardHeader>
        <CardContent className='space-y-5'>
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
            label='Exports (monthly)'
            ariaLabel='Monthly exports'
            used={snapshot.usage.exports.used}
            limit={snapshot.usage.exports.limit}
          />
          <UsageMeterRow
            label='Lesson generations (monthly)'
            ariaLabel='Monthly lesson generations'
            used={snapshot.usage.lessonGenerations.used}
            limit={snapshot.usage.lessonGenerations.limit}
          />
        </CardContent>
      </Card>
    </>
  );
}
