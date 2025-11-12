import ManageSubscriptionButton from '@/components/billing/ManageSubscriptionButton';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { getEffectiveClerkUserId } from '@/lib/api/auth';
import { getUserByClerkId } from '@/lib/db/queries/users';
import { getUsageSummary } from '@/lib/stripe/usage';
import { getSubscriptionTier } from '@/lib/stripe/subscriptions';
import { redirect } from 'next/navigation';

export default async function BillingSettingsPage() {
  const clerkUserId = await getEffectiveClerkUserId();
  if (!clerkUserId) redirect('/sign-in?redirect_url=/settings/billing');

  const dbUser = await getUserByClerkId(clerkUserId);
  if (!dbUser) redirect('/plans/new');

  const [usage, sub] = await Promise.all([
    getUsageSummary(dbUser.id),
    getSubscriptionTier(dbUser.id),
  ]);

  const nextBilling = sub.subscriptionPeriodEnd
    ? new Date(sub.subscriptionPeriodEnd).toLocaleDateString()
    : '—';

  const plansLimit = usage.activePlans.limit;
  const plansValue = Math.min(
    100,
    plansLimit === Infinity
      ? 100
      : Math.round((usage.activePlans.current / (plansLimit || 1)) * 100)
  );

  const regenLimit = usage.regenerations.limit;
  const regenValue = Math.min(
    100,
    regenLimit === Infinity
      ? 100
      : Math.round((usage.regenerations.used / (regenLimit || 1)) * 100)
  );

  const exportLimit = usage.exports.limit;
  const exportValue = Math.min(
    100,
    exportLimit === Infinity
      ? 100
      : Math.round((usage.exports.used / (exportLimit || 1)) * 100)
  );

  return (
    <div className="bg-gradient-subtle min-h-screen">
      <div className="container mx-auto px-6 py-8">
        <h1 className="mb-6 text-3xl font-bold">Billing</h1>

        <div className="grid gap-6 md:grid-cols-2">
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
                <Progress value={plansValue} />
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
                <Progress value={regenValue} />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span>Exports (monthly)</span>
                  <span className="text-muted-foreground">
                    {usage.exports.used}/
                    {usage.exports.limit === Infinity
                      ? '∞'
                      : usage.exports.limit}
                  </span>
                </div>
                <Progress value={exportValue} />
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
