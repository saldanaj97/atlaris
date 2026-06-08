import type { JSX } from 'react';

import ManageSubscriptionButton from './ManageSubscriptionButton';
import {
  formatCompactUsageLimit,
  formatUsageLimitLabel,
  getUsagePercent,
} from '@/app/_shared/usage-formatting';
import { Badge } from '@/components/ui/badge';
import {
  Card,
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

/**
 * Async component that fetches subscription and usage data.
 * Wrapped in Suspense boundary by the parent page.
 */
export async function BillingCards({
  locale,
}: {
  locale?: string;
}): Promise<JSX.Element> {
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
          <CardTitle>Billing unavailable</CardTitle>
          <CardDescription>
            We couldn&apos;t load your billing details right now.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const nextBilling = snapshot.subscriptionPeriodEnd
    ? new Date(snapshot.subscriptionPeriodEnd).toLocaleDateString(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : '—';

  const plansValue = getUsagePercent(
    snapshot.usage.activePlans.current,
    snapshot.usage.activePlans.limit,
  );
  const regenValue = getUsagePercent(
    snapshot.usage.regenerations.used,
    snapshot.usage.regenerations.limit,
  );
  const exportValue = getUsagePercent(
    snapshot.usage.exports.used,
    snapshot.usage.exports.limit,
  );
  const lessonGenerationValue = getUsagePercent(
    snapshot.usage.lessonGenerations.used,
    snapshot.usage.lessonGenerations.limit,
  );

  return (
    <>
      <Card>
        <CardHeader className='flex-row items-start justify-between space-y-0'>
          <div className='space-y-1'>
            <CardTitle>Current Plan</CardTitle>
            <CardDescription>Manage your subscription</CardDescription>
          </div>
          <Badge variant='product'>{snapshot.tier.toUpperCase()}</Badge>
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
          <CardTitle>Usage</CardTitle>
        </CardHeader>
        <CardContent className='space-y-5'>
          <div>
            <div className='mb-1 flex items-center justify-between text-sm'>
              <span>Active plans</span>
              <span className='text-muted-foreground tabular-nums'>
                {snapshot.usage.activePlans.current}/
                {formatCompactUsageLimit(snapshot.usage.activePlans.limit)}
              </span>
            </div>
            <Progress
              value={plansValue}
              aria-label={`Active plans: ${snapshot.usage.activePlans.current} of ${formatUsageLimitLabel(snapshot.usage.activePlans.limit)}`}
            />
          </div>

          <div>
            <div className='mb-1 flex items-center justify-between text-sm'>
              <span>Regenerations (monthly)</span>
              <span className='text-muted-foreground tabular-nums'>
                {snapshot.usage.regenerations.used}/
                {formatCompactUsageLimit(snapshot.usage.regenerations.limit)}
              </span>
            </div>
            <Progress
              value={regenValue}
              aria-label={`Monthly regenerations: ${snapshot.usage.regenerations.used} of ${formatUsageLimitLabel(snapshot.usage.regenerations.limit)}`}
            />
          </div>

          <div>
            <div className='mb-1 flex items-center justify-between text-sm'>
              <span>Exports (monthly)</span>
              <span className='text-muted-foreground tabular-nums'>
                {snapshot.usage.exports.used}/
                {formatCompactUsageLimit(snapshot.usage.exports.limit)}
              </span>
            </div>
            <Progress
              value={exportValue}
              aria-label={`Monthly exports: ${snapshot.usage.exports.used} of ${formatUsageLimitLabel(snapshot.usage.exports.limit)}`}
            />
          </div>

          <div>
            <div className='mb-1 flex items-center justify-between text-sm'>
              <span>Lesson generations (monthly)</span>
              <span className='text-muted-foreground tabular-nums'>
                {snapshot.usage.lessonGenerations.used}/
                {formatCompactUsageLimit(
                  snapshot.usage.lessonGenerations.limit,
                )}
              </span>
            </div>
            <Progress
              value={lessonGenerationValue}
              aria-label={`Monthly lesson generations: ${snapshot.usage.lessonGenerations.used} of ${formatUsageLimitLabel(snapshot.usage.lessonGenerations.limit)}`}
            />
          </div>
        </CardContent>
      </Card>
    </>
  );
}
