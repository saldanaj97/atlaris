import ManageSubscriptionButton from '@/components/billing/ManageSubscriptionButton';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { withServerComponentContext } from '@/lib/api/auth';
import { getDb } from '@/lib/db/runtime';
import { getSubscriptionTier } from '@/lib/stripe/subscriptions';
import { getUsageSummary } from '@/lib/stripe/usage';
import { redirect } from 'next/navigation';
import type { JSX } from 'react';

/**
 * Async component that fetches subscription and usage data.
 * Wrapped in Suspense boundary by the parent page.
 */
export async function BillingCards(): Promise<JSX.Element> {
  const result = await withServerComponentContext(async (user) => {
    const db = getDb();
    const [usage, sub] = await Promise.all([
      getUsageSummary(user.id, db),
      getSubscriptionTier(user.id, db),
    ]);
    return { usage, sub };
  });

  if (!result) redirect('/auth/sign-in');

  const { usage, sub } = result;

  const nextBilling = sub.subscriptionPeriodEnd
    ? new Date(sub.subscriptionPeriodEnd).toLocaleDateString('en-US', {
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
    usage.activePlans.current,
    usage.activePlans.limit
  );
  const regenValue = getUsagePercent(
    usage.regenerations.used,
    usage.regenerations.limit
  );
  const exportValue = getUsagePercent(usage.exports.used, usage.exports.limit);

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
          <Badge>{usage.tier.toUpperCase()}</Badge>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span>Status</span>
            <span className="text-muted-foreground">
              {sub.subscriptionStatus ?? '—'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Next billing date</span>
            <span className="text-muted-foreground">{nextBilling}</span>
          </div>
        </div>

        <div className="mt-4">
          <ManageSubscriptionButton className="w-full" />
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 text-xl font-semibold">Usage</h2>

        <div className="space-y-5">
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span>Active plans</span>
              <span className="text-muted-foreground">
                {usage.activePlans.current}/
                {usage.activePlans.limit === Infinity
                  ? '∞'
                  : usage.activePlans.limit}
              </span>
            </div>
            <Progress
              value={plansValue}
              aria-label={`Active plans: ${usage.activePlans.current} of ${usage.activePlans.limit === Infinity ? 'unlimited' : usage.activePlans.limit}`}
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span>Regenerations (monthly)</span>
              <span className="text-muted-foreground">
                {usage.regenerations.used}/
                {usage.regenerations.limit === Infinity
                  ? '∞'
                  : usage.regenerations.limit}
              </span>
            </div>
            <Progress
              value={regenValue}
              aria-label={`Monthly regenerations: ${usage.regenerations.used} of ${usage.regenerations.limit === Infinity ? 'unlimited' : usage.regenerations.limit}`}
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span>Exports (monthly)</span>
              <span className="text-muted-foreground">
                {usage.exports.used}/
                {usage.exports.limit === Infinity ? '∞' : usage.exports.limit}
              </span>
            </div>
            <Progress
              value={exportValue}
              aria-label={`Monthly exports: ${usage.exports.used} of ${usage.exports.limit === Infinity ? 'unlimited' : usage.exports.limit}`}
            />
          </div>
        </div>
      </Card>
    </>
  );
}
