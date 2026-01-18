import ManageSubscriptionButton from '@/components/billing/ManageSubscriptionButton';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { getEffectiveClerkUserId } from '@/lib/api/auth';
import { getUserByClerkId } from '@/lib/db/queries/users';
import { getSubscriptionTier } from '@/lib/stripe/subscriptions';
import { getUsageSummary } from '@/lib/stripe/usage';
import { redirect } from 'next/navigation';

/**
 * Async component that fetches subscription and usage data.
 * Wrapped in Suspense boundary by the parent page.
 */
export async function BillingCards() {
  const clerkUserId = await getEffectiveClerkUserId();
  if (!clerkUserId) redirect('/sign-in?redirect_url=/settings/billing');

  const dbUser = await getUserByClerkId(clerkUserId);
  if (!dbUser) redirect('/plans/new');

  const [usage, sub] = await Promise.all([
    getUsageSummary(dbUser.id),
    getSubscriptionTier(dbUser.id),
  ]);

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

/**
 * Skeleton for the billing cards.
 * Shown while the async component is loading.
 */
export function BillingCardsSkeleton() {
  return (
    <>
      {/* Current Plan Card skeleton */}
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <Skeleton className="mb-1 h-6 w-32" />
            <Skeleton className="h-4 w-44" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>

        <div className="mt-4">
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
      </Card>

      {/* Usage Card skeleton */}
      <Card className="p-6">
        <Skeleton className="mb-4 h-6 w-16" />

        <div className="space-y-5">
          {/* Active plans usage */}
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-12" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
          </div>

          {/* Regenerations usage */}
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-12" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
          </div>

          {/* Exports usage */}
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-12" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
        </div>
      </Card>
    </>
  );
}
