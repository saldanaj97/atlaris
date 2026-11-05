'use client';

import {
  findScheduledPaidPlan,
  formatPlanSwitchDate,
  type ScheduledPaidPlan,
} from '@/features/billing/clerk-billing/subscription-snapshot';
import { ROUTES } from '@/features/navigation/routes';
import { clientLogger } from '@/lib/logging/client';
import { useClerk } from '@clerk/nextjs';
import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * Names a plan switch Clerk has scheduled for period end. Atlaris stores only
 * the plan a user has now, so this reads Clerk directly; it is display only and
 * never affects entitlements. Render it only where Clerk UI is enabled.
 */
export function ScheduledPlanChangeNotice() {
  const { billing, loaded } = useClerk();
  const [scheduledPlan, setScheduledPlan] = useState<ScheduledPaidPlan | null>(
    null,
  );

  useEffect(() => {
    if (!loaded || !billing) return;

    let cancelled = false;
    billing
      .getSubscription({})
      .then((subscription) => {
        if (!cancelled) setScheduledPlan(findScheduledPaidPlan(subscription));
      })
      .catch((error: unknown) => {
        // The rows beside this notice come from Postgres and stay accurate.
        clientLogger.warn('Failed to load scheduled plan change', {
          context: 'settings-billing',
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [billing, loaded]);

  if (!scheduledPlan) return null;

  const planName = scheduledPlan.name ?? 'your new plan';

  return (
    <p className='type-body text-muted-foreground'>
      {scheduledPlan.startsAt
        ? `Moves to ${planName} on ${formatPlanSwitchDate(scheduledPlan.startsAt)}.`
        : `Moves to ${planName} when this billing period ends.`}{' '}
      <Link
        className='text-link underline underline-offset-2 hover:text-link-hover'
        href={ROUTES.PRICING}
      >
        Change this on the plans page
      </Link>
      .
    </p>
  );
}
