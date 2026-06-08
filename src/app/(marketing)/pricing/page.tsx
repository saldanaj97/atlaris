import type { StripeTierConfig } from '@/app/(marketing)/pricing/components/pricing-config';
import type { SubscriptionTier } from '@/shared/types/billing.types';
import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import ManageSubscriptionButton from '@/app/(app)/settings/billing/components/ManageSubscriptionButton';
import { MarketingPageShell } from '@/app/(marketing)/_shared/MarketingPageShell';
import {
  MONTHLY_TIER_CONFIGS,
  YEARLY_TIER_CONFIGS,
} from '@/app/(marketing)/pricing/components/pricing-config';
import { PricingFinalCta } from '@/app/(marketing)/pricing/components/PricingFinalCta';
import { PricingGrid } from '@/app/(marketing)/pricing/components/PricingGrid';
import { PricingMissingStripeNotice } from '@/app/(marketing)/pricing/components/PricingMissingStripeNotice';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { deriveBillingSubscriptionSnapshot } from '@/features/billing/account-snapshot';
import {
  readBillingCatalogTierData,
  type BillingCatalogTierData,
} from '@/features/billing/catalog-read';
import { requestBoundary } from '@/lib/api/request-boundary';
import { logger } from '@/lib/logging/logger';

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
  configs: StripeTierConfig[];
  intervalLabel: string;
  subscribeLabel: string;
  badge?: string;
}

interface ResolvedPricingInterval extends PricingInterval {
  /** What the catalog read returned before any UI fallback emptying. */
  rawBillingCatalogData: ReadonlyMap<SubscriptionTier, BillingCatalogTierData>;
  /** Per-tier labels/amounts for the grid; cleared when any paid tier is missing from catalog read. */
  tierDisplayMap: Map<SubscriptionTier, BillingCatalogTierData>;
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
/** Empty map forced when any paid tier lacks catalog data — grid then uses static fallbacks. */
const EMPTY_BILLING_CATALOG_GRID_DATA = new Map<
  SubscriptionTier,
  BillingCatalogTierData
>();

function getPaidTierPriceIds(
  configs: StripeTierConfig[],
): PaidTierPriceIds | null {
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
  tierDisplayMap: ReadonlyMap<SubscriptionTier, BillingCatalogTierData>,
): PaidTierKey[] {
  if (priceIds === null || tierDisplayMap.size === 0) {
    return [...PAID_TIER_KEYS];
  }

  return PAID_TIER_KEYS.filter((tierKey) => !tierDisplayMap.has(tierKey));
}

async function loadBillingCatalogDisplayMap(
  interval: 'monthly' | 'yearly',
  priceIds: PaidTierPriceIds | null,
): Promise<Map<SubscriptionTier, BillingCatalogTierData>> {
  if (priceIds === null) {
    return new Map<SubscriptionTier, BillingCatalogTierData>();
  }

  try {
    return await readBillingCatalogTierData({
      interval,
      starterId: priceIds.starterId,
      proId: priceIds.proId,
    });
  } catch (error) {
    logger.error(
      { err: error },
      '[loadBillingCatalogDisplayMap] Failed billing catalog read; rendering static fallback pricing',
    );
    return new Map<SubscriptionTier, BillingCatalogTierData>();
  }
}

async function resolvePricingInterval(
  interval: PricingInterval,
): Promise<ResolvedPricingInterval> {
  const priceIds = getPaidTierPriceIds(interval.configs);
  const loaded = await loadBillingCatalogDisplayMap(interval.value, priceIds);
  const rawBillingCatalogData = new Map(loaded);
  const missingTierKeys = getMissingPaidTierKeys(
    priceIds,
    rawBillingCatalogData,
  );

  return {
    ...interval,
    rawBillingCatalogData,
    tierDisplayMap:
      missingTierKeys.length === 0
        ? new Map(rawBillingCatalogData)
        : EMPTY_BILLING_CATALOG_GRID_DATA,
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
      monthlyLoadedTierKeys: [...monthlyInterval.rawBillingCatalogData.keys()],
      monthlyMissingTierKeys: monthlyInterval.missingTierKeys,
      yearlyLoadedTierKeys: [...yearlyInterval.rawBillingCatalogData.keys()],
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
    <MarketingPageShell withHeaderOffset>
      <div className='px-6 py-12 sm:py-16'>
        <div className='mx-auto flex max-w-screen-xl flex-col items-center gap-y-10'>
          <div className='text-center'>
            <h1 className='marketing-h1 mb-2 text-foreground'>
              Invest in your{' '}
              <span className='gradient-text-symmetric'>growth</span>
            </h1>
            <p className='marketing-subtitle mx-auto max-w-md sm:max-w-xl'>
              Choose the plan that matches your learning ambitions. Start free,
              upgrade when you&apos;re ready.
            </p>
          </div>

          <div className='w-full'>
            {showMissingStripeNotice ? <PricingMissingStripeNotice /> : null}
            <Tabs defaultValue='monthly'>
              <div className='flex justify-center'>
                <TabsList className='h-11 rounded-lg border border-white/40 bg-white/40 p-1 backdrop-blur-xl dark:border-white/10 dark:bg-card/40'>
                  {intervals.map((interval) => (
                    <TabsTrigger
                      key={interval.value}
                      value={interval.value}
                      className='h-full rounded-md border-none px-6 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-md dark:data-[state=active]:bg-white/10 dark:data-[state=active]:shadow-none'
                    >
                      {interval.tabLabel}
                      {interval.badge ? (
                        <Badge className='ml-1.5 border-transparent bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success dark:bg-success/25 dark:text-success-foreground'>
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
                    tierDisplayMap={interval.tierDisplayMap}
                    subscribeLabel={interval.subscribeLabel}
                  />
                </TabsContent>
              ))}
            </Tabs>
          </div>

          <div className='text-center'>
            <p className='mb-3 text-sm text-muted-foreground'>
              Already subscribed?
            </p>
            <ManageSubscriptionButton
              className='rounded-lg'
              canOpenBillingPortal={canOpenBillingPortal}
            />
            {!canOpenBillingPortal ? (
              <p className='mt-2 text-sm text-muted-foreground'>
                Billing portal is available after your first subscription
                checkout.
              </p>
            ) : null}
          </div>

          <PricingFinalCta />
        </div>
      </div>
    </MarketingPageShell>
  );
}
