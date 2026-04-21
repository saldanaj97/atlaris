import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { PricingGrid } from '@/app/pricing/components/PricingGrid';
import { PricingMissingStripeNotice } from '@/app/pricing/components/PricingMissingStripeNotice';
import type { TierConfig } from '@/app/pricing/components/pricing-config';
import {
  MONTHLY_TIER_CONFIGS,
  YEARLY_TIER_CONFIGS,
} from '@/app/pricing/components/pricing-config';
import type { StripeTierData } from '@/app/pricing/components/stripe-pricing';
import { fetchStripeTierData } from '@/app/pricing/components/stripe-pricing';
import ManageSubscriptionButton from '@/components/billing/ManageSubscriptionButton';
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

type PaidTierKey = Exclude<SubscriptionTier, 'free'>;

const PAID_TIER_KEYS: readonly PaidTierKey[] = MONTHLY_TIER_CONFIGS.map(
  (c) => c.key
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
  stripeData: ReadonlyMap<SubscriptionTier, StripeTierData>
): PaidTierKey[] {
  if (priceIds === null || stripeData.size === 0) {
    return [...PAID_TIER_KEYS];
  }

  return PAID_TIER_KEYS.filter((tierKey) => !stripeData.has(tierKey));
}

async function loadStripeTierData(
  priceIds: PaidTierPriceIds | null
): Promise<Map<SubscriptionTier, StripeTierData>> {
  if (priceIds === null) {
    return new Map<SubscriptionTier, StripeTierData>();
  }

  try {
    return await fetchStripeTierData(priceIds);
  } catch (error) {
    logger.error(
      { err: error },
      '[loadStripeTierData] Failed to fetch Stripe tier data; rendering with static fallback pricing'
    );
    return new Map<SubscriptionTier, StripeTierData>();
  }
}

export default async function PricingPage(): Promise<ReactElement> {
  const canOpenBillingPortal =
    (await requestBoundary.component(
      ({ actor }) =>
        deriveBillingSubscriptionSnapshot(actor).canOpenBillingPortal
    )) ?? false;
  const monthlyPriceIds = getPaidTierPriceIds(MONTHLY_TIER_CONFIGS);
  const yearlyPriceIds = getPaidTierPriceIds(YEARLY_TIER_CONFIGS);
  const [monthlyStripeData, yearlyStripeData] = await Promise.all([
    loadStripeTierData(monthlyPriceIds),
    loadStripeTierData(yearlyPriceIds),
  ]);
  const monthlyMissingTierKeys = getMissingPaidTierKeys(
    monthlyPriceIds,
    monthlyStripeData
  );
  const yearlyMissingTierKeys = getMissingPaidTierKeys(
    yearlyPriceIds,
    yearlyStripeData
  );
  const showMissingStripeNotice =
    monthlyMissingTierKeys.length > 0 || yearlyMissingTierKeys.length > 0;

  if (showMissingStripeNotice) {
    logger.warn(
      {
        monthlyLoadedTierKeys: [...monthlyStripeData.keys()],
        monthlyMissingTierKeys,
        yearlyLoadedTierKeys: [...yearlyStripeData.keys()],
        yearlyMissingTierKeys,
      },
      '[PricingPage] Incomplete Stripe pricing data detected; rendering static fallback pricing'
    );
  }

  const monthlyGridStripeData =
    monthlyMissingTierKeys.length === 0
      ? monthlyStripeData
      : EMPTY_STRIPE_TIER_DATA;
  const yearlyGridStripeData =
    yearlyMissingTierKeys.length === 0
      ? yearlyStripeData
      : EMPTY_STRIPE_TIER_DATA;

  return (
    <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col items-center justify-start gap-y-10 overflow-hidden px-6 py-16">
      <div className="from-primary/30 to-accent/20 absolute -top-20 -left-32 h-96 w-96 rounded-full bg-linear-to-br opacity-40 blur-3xl dark:opacity-20" />
      <div className="from-primary/25 to-accent/25 absolute top-40 -right-32 h-80 w-80 rounded-full bg-linear-to-br opacity-40 blur-3xl dark:opacity-15" />

      <div className="relative z-10 mb-5 text-center sm:mb-6">
        <h1 className="text-foreground marketing-h1 mb-2">
          Invest in your <span className="gradient-text-symmetric">growth</span>
        </h1>
        <p className="text-muted-foreground mx-auto max-w-md text-base sm:max-w-xl sm:text-lg">
          Choose the plan that matches your learning ambitions. Start free,
          upgrade when you&apos;re ready.
        </p>
      </div>

      <div className="relative z-10 w-full">
        {showMissingStripeNotice ? <PricingMissingStripeNotice /> : null}
        <Tabs defaultValue="monthly">
          <div className="flex justify-center">
            <TabsList className="h-11 rounded-lg border border-white/40 bg-white/40 p-1.5 backdrop-blur-xl dark:border-white/10 dark:bg-stone-900/40">
              <TabsTrigger
                value="monthly"
                className="h-full rounded-md border-none px-6 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-md dark:data-[state=active]:bg-white/10 dark:data-[state=active]:shadow-none"
              >
                Monthly
              </TabsTrigger>
              <TabsTrigger
                value="yearly"
                className="h-full rounded-md border-none px-6 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-md dark:data-[state=active]:bg-white/10 dark:data-[state=active]:shadow-none"
              >
                Yearly
                <Badge className="ml-1.5 border-transparent bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success dark:bg-success/25 dark:text-success-foreground">
                  Save 20%
                </Badge>
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="monthly">
            <PricingGrid
              configs={MONTHLY_TIER_CONFIGS}
              intervalLabel="/month"
              stripeData={monthlyGridStripeData}
              subscribeLabel="Subscribe monthly"
            />
          </TabsContent>
          <TabsContent value="yearly">
            <PricingGrid
              configs={YEARLY_TIER_CONFIGS}
              intervalLabel="/year"
              stripeData={yearlyGridStripeData}
              subscribeLabel="Subscribe yearly"
            />
          </TabsContent>
        </Tabs>
      </div>

      <div className="relative z-10 text-center">
        <p className="text-muted-foreground mb-3 text-sm">
          Already subscribed?
        </p>
        <ManageSubscriptionButton
          className="rounded-lg"
          canOpenBillingPortal={canOpenBillingPortal}
        />
        {!canOpenBillingPortal ? (
          <p className="text-muted-foreground mt-2 text-sm">
            Billing portal is available after your first subscription checkout.
          </p>
        ) : null}
      </div>
    </div>
  );
}
