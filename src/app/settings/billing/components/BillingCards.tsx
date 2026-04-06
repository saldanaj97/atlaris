import { redirect } from 'next/navigation';
import type { JSX } from 'react';
import ManageSubscriptionButton from '@/components/billing/ManageSubscriptionButton';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { getBillingAccountSnapshot } from '@/features/billing/account-snapshot';
import { withServerComponentContext } from '@/lib/api/auth';
import { getDb } from '@/lib/db/runtime';

/**
 * Async component that fetches subscription and usage data.
 * Wrapped in Suspense boundary by the parent page.
 */
export async function BillingCards(): Promise<JSX.Element> {
  const snapshot = await withServerComponentContext(async (user) =>
    getBillingAccountSnapshot(user.id, getDb())
  );

  if (!snapshot) redirect('/auth/sign-in');

  const nextBilling = snapshot.subscriptionPeriodEnd
    ? new Date(snapshot.subscriptionPeriodEnd).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : '—';

  // Helper to compute usage percentage for progress bars
  // Returns 0 for unlimited (Infinity) since there's no cap to show progress against
  const getUsagePercent = (used: number, limit: number): number => {
    if (limit === Infinity || limit <= 0) return 0;
    return Math.min(100, Math.round((used / limit) * 100));
  };

  const plansValue = getUsagePercent(
    snapshot.usage.activePlans.current,
    snapshot.usage.activePlans.limit
  );
  const regenValue = getUsagePercent(
    snapshot.usage.regenerations.used,
    snapshot.usage.regenerations.limit
  );
  const exportValue = getUsagePercent(
    snapshot.usage.exports.used,
    snapshot.usage.exports.limit
  );

  return (
    <>
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Current Plan</h2>
            <p className="text-muted-foreground text-sm">
              Manage your subscription
            </p>
          </div>
          <Badge>{snapshot.tier.toUpperCase()}</Badge>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span>Status</span>
            <span className="text-muted-foreground">
              {snapshot.subscriptionStatus ?? '—'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Next billing date</span>
            <span className="text-muted-foreground">{nextBilling}</span>
          </div>
        </div>

        <div className="mt-4">
          <ManageSubscriptionButton
            className="w-full"
            canOpenBillingPortal={snapshot.canOpenBillingPortal}
          />
          {!snapshot.canOpenBillingPortal && (
            <p className="text-muted-foreground mt-2 text-center text-sm">
              Billing features are unavailable.
            </p>
          )}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 text-xl font-semibold">Usage</h2>

        <div className="space-y-5">
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span>Active plans</span>
              <span className="text-muted-foreground">
                {snapshot.usage.activePlans.current}/
                {snapshot.usage.activePlans.limit === Infinity
                  ? '∞'
                  : snapshot.usage.activePlans.limit}
              </span>
            </div>
            <Progress
              value={plansValue}
              aria-label={`Active plans: ${snapshot.usage.activePlans.current} of ${snapshot.usage.activePlans.limit === Infinity ? 'unlimited' : snapshot.usage.activePlans.limit}`}
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span>Regenerations (monthly)</span>
              <span className="text-muted-foreground">
                {snapshot.usage.regenerations.used}/
                {snapshot.usage.regenerations.limit === Infinity
                  ? '∞'
                  : snapshot.usage.regenerations.limit}
              </span>
            </div>
            <Progress
              value={regenValue}
              aria-label={`Monthly regenerations: ${snapshot.usage.regenerations.used} of ${snapshot.usage.regenerations.limit === Infinity ? 'unlimited' : snapshot.usage.regenerations.limit}`}
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span>Exports (monthly)</span>
              <span className="text-muted-foreground">
                {snapshot.usage.exports.used}/
                {snapshot.usage.exports.limit === Infinity
                  ? '∞'
                  : snapshot.usage.exports.limit}
              </span>
            </div>
            <Progress
              value={exportValue}
              aria-label={`Monthly exports: ${snapshot.usage.exports.used} of ${snapshot.usage.exports.limit === Infinity ? 'unlimited' : snapshot.usage.exports.limit}`}
            />
          </div>
        </div>
      </Card>
    </>
  );
}
