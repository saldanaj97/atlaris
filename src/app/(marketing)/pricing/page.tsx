import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import ManageSubscriptionButton from '@/app/(app)/settings/billing/components/ManageSubscriptionButton';
import { PricingGrid } from '@/app/(marketing)/pricing/components/PricingGrid';
import { PricingMissingStripeNotice } from '@/app/(marketing)/pricing/components/PricingMissingStripeNotice';
import type { TierConfig } from '@/app/(marketing)/pricing/components/pricing-config';
import {
  MONTHLY_TIER_CONFIGS,
  YEARLY_TIER_CONFIGS,
} from '@/app/(marketing)/pricing/components/pricing-config';
import type { StripeTierData } from '@/app/(marketing)/pricing/components/stripe-pricing';
import { fetchStripeTierData } from '@/app/(marketing)/pricing/components/stripe-pricing';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { deriveBillingSubscriptionSnapshot } from '@/features/billing/account-snapshot';
import { requestBoundary } from '@/lib/api/request-boundary';
import { logger } from '@/lib/logging/logger';
import type { SubscriptionTier } from '@/shared/types/billing.types';

export const metadata: Metadata = {
  title: 'Pricing | Atlaris',
  description:
    'Compare Atlaris plans and choose the subscription that fits your learning goals.',
};

interface PaidTierPriceIds {
  starterId: string;
  proId: string;
}

interface PricingInterval {
  value: 'monthly' | 'yearly';
  tabLabel: string;
  configs: TierConfig[];
  intervalLabel: string;
  subscribeLabel: string;
  badge?: string;
}

interface ResolvedPricingInterval extends PricingInterval {
  rawStripeData: ReadonlyMap<SubscriptionTier, StripeTierData>;
  stripeData: Map<SubscriptionTier, StripeTierData>;
  missingTierKeys: PaidTierKey[];
}

type PaidTierKey = Exclude<SubscriptionTier, 'free'>;

const PRICING_INTERVALS: readonly [PricingInterval, PricingInterval] = [
  {
    value: 'monthly',
    tabLabel: 'Monthly',
    configs: MONTHLY_TIER_CONFIGS,
    intervalLabel: '/month',
    subscribeLabel: 'Subscribe monthly',
  },
  {
    value: 'yearly',
    tabLabel: 'Yearly',
    configs: YEARLY_TIER_CONFIGS,
    intervalLabel: '/year',
    subscribeLabel: 'Subscribe yearly',
    badge: 'Save 20%',
  },
];

const PAID_TIER_KEYS: readonly PaidTierKey[] = MONTHLY_TIER_CONFIGS.map(
  (c) => c.key,
).filter((key): key is PaidTierKey => key !== 'free');
const EMPTY_STRIPE_TIER_DATA = new Map<SubscriptionTier, StripeTierData>();

function getPaidTierPriceIds(configs: TierConfig[]): PaidTierPriceIds | null {
  const starterId = configs.find((config) => config.key === 'starter')?.priceId;
  const proId = configs.find((config) => config.key === 'pro')?.priceId;

  if (
    typeof starterId !== 'string' ||
    starterId.trim().length === 0 ||
    typeof proId !== 'string' ||
    proId.trim().length === 0
  ) {
    return null;
  }

  return { starterId, proId };
}

function getMissingPaidTierKeys(
  priceIds: PaidTierPriceIds | null,
  stripeData: ReadonlyMap<SubscriptionTier, StripeTierData>,
): PaidTierKey[] {
  if (priceIds === null || stripeData.size === 0) {
    return [...PAID_TIER_KEYS];
  }

  return PAID_TIER_KEYS.filter((tierKey) => !stripeData.has(tierKey));
}

async function loadStripeTierData(
  priceIds: PaidTierPriceIds | null,
): Promise<Map<SubscriptionTier, StripeTierData>> {
  if (priceIds === null) {
    return new Map<SubscriptionTier, StripeTierData>();
  }

  try {
    return await fetchStripeTierData(priceIds);
  } catch (error) {
    logger.error(
      { err: error },
      '[loadStripeTierData] Failed to fetch Stripe tier data; rendering with static fallback pricing',
    );
    return new Map<SubscriptionTier, StripeTierData>();
  }
}

async function resolvePricingInterval(
  interval: PricingInterval,
): Promise<ResolvedPricingInterval> {
  const priceIds = getPaidTierPriceIds(interval.configs);
  const stripeData = await loadStripeTierData(priceIds);
  const missingTierKeys = getMissingPaidTierKeys(priceIds, stripeData);

  return {
    ...interval,
    rawStripeData: stripeData,
    stripeData:
      missingTierKeys.length === 0 ? stripeData : EMPTY_STRIPE_TIER_DATA,
    missingTierKeys,
  };
}

function logMissingStripeData(
  intervals: readonly ResolvedPricingInterval[],
): void {
  if (!hasMissingStripeData(intervals)) {
    return;
  }

  const [monthlyInterval, yearlyInterval] = intervals;

  logger.warn(
    {
      monthlyLoadedTierKeys: [...monthlyInterval.rawStripeData.keys()],
      monthlyMissingTierKeys: monthlyInterval.missingTierKeys,
      yearlyLoadedTierKeys: [...yearlyInterval.rawStripeData.keys()],
      yearlyMissingTierKeys: yearlyInterval.missingTierKeys,
    },
    '[PricingPage] Incomplete Stripe pricing data detected; rendering static fallback pricing',
  );
}

function hasMissingStripeData(
  intervals: readonly ResolvedPricingInterval[],
): boolean {
  return intervals.some((interval) => interval.missingTierKeys.length > 0);
}

export default async function PricingPage(): Promise<ReactElement> {
  const canOpenBillingPortal =
    (await requestBoundary.component(
      ({ actor }) =>
        deriveBillingSubscriptionSnapshot(actor).canOpenBillingPortal,
    )) ?? false;
  const intervals = await Promise.all(
    PRICING_INTERVALS.map(resolvePricingInterval),
  );
  const showMissingStripeNotice = hasMissingStripeData(intervals);

  logMissingStripeData(intervals);

  return (
    <div className="relative isolate -mt-16 min-h-[calc(100vh+4rem)] w-full overflow-hidden px-6 pt-40 pb-16">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-24 -left-40 h-[32rem] w-[32rem] rounded-full bg-linear-to-br from-primary/30 to-accent/20 opacity-45 blur-3xl dark:opacity-20" />
        <div className="absolute top-36 -right-40 h-[28rem] w-[28rem] rounded-full bg-linear-to-br from-primary/25 to-accent/25 opacity-45 blur-3xl dark:opacity-15" />
        <div className="absolute right-1/4 bottom-0 h-80 w-80 rounded-full bg-linear-to-br from-accent/15 to-primary/15 opacity-35 blur-3xl dark:opacity-10" />
      </div>

      <div className="mx-auto flex max-w-7xl flex-col items-center justify-start gap-y-10">
        <div className="mb-5 text-center sm:mb-6">
          <h1 className="marketing-h1 mb-2 text-foreground">
            Invest in your{' '}
            <span className="gradient-text-symmetric">growth</span>
          </h1>
          <p className="mx-auto max-w-md text-base text-muted-foreground sm:max-w-xl sm:text-lg">
            Choose the plan that matches your learning ambitions. Start free,
            upgrade when you&apos;re ready.
          </p>
        </div>

        <div className="w-full">
          {showMissingStripeNotice ? <PricingMissingStripeNotice /> : null}
          <Tabs defaultValue="monthly">
            <div className="flex justify-center">
              <TabsList className="h-11 rounded-lg border border-white/40 bg-white/40 p-1.5 backdrop-blur-xl dark:border-white/10 dark:bg-stone-900/40">
                {intervals.map((interval) => (
                  <TabsTrigger
                    key={interval.value}
                    value={interval.value}
                    className="h-full rounded-md border-none px-6 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-md dark:data-[state=active]:bg-white/10 dark:data-[state=active]:shadow-none"
                  >
                    {interval.tabLabel}
                    {interval.badge ? (
                      <Badge className="ml-1.5 border-transparent bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success dark:bg-success/25 dark:text-success-foreground">
                        {interval.badge}
                      </Badge>
                    ) : null}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            {intervals.map((interval) => (
              <TabsContent key={interval.value} value={interval.value}>
                <PricingGrid
                  configs={interval.configs}
                  intervalLabel={interval.intervalLabel}
                  stripeData={interval.stripeData}
                  subscribeLabel={interval.subscribeLabel}
                />
              </TabsContent>
            ))}
          </Tabs>
        </div>

        <div className="text-center">
          <p className="mb-3 text-sm text-muted-foreground">
            Already subscribed?
          </p>
          <ManageSubscriptionButton
            className="rounded-lg"
            canOpenBillingPortal={canOpenBillingPortal}
          />
          {!canOpenBillingPortal ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Billing portal is available after your first subscription
              checkout.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
