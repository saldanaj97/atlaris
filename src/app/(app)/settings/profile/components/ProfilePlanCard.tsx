import type { SubscriptionTier } from '@/shared/types/billing.types';
import type { ReactElement } from 'react';

import { loadBillingSnapshot } from '@/app/(app)/settings/billing/components/load-billing-snapshot';
import { PRICING_PLAN_FEATURES } from '@/app/(landing)/pricing/pricing-plan-features';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ROUTES } from '@/features/navigation/routes';
import { ArrowRight, Check, Crown } from 'lucide-react';
import Link from 'next/link';

const PLAN_BLURBS: Record<SubscriptionTier, string> = {
  free: 'For finding your rhythm.',
  starter: 'For building a steady practice.',
  pro: 'For deeper, longer-running work.',
};

function formatPlanTierName(tier: string): string {
  return `${tier.charAt(0).toUpperCase()}${tier.slice(1)}`;
}

function isSubscriptionTier(value: string): value is SubscriptionTier {
  return value === 'free' || value === 'starter' || value === 'pro';
}

export async function ProfilePlanCard(): Promise<ReactElement> {
  const snapshot = await loadBillingSnapshot();

  if (!snapshot || !isSubscriptionTier(snapshot.tier)) {
    return (
      <Card as='section' className='gap-[24px] shadow-none'>
        <CardHeader>
          <CardTitle as='h3' className='text-xl leading-[28px]'>
            Plan
          </CardTitle>
        </CardHeader>
        <CardContent className='@container'>
          <p className='text-sm text-muted-foreground'>
            Unavailable right now.
          </p>
        </CardContent>
      </Card>
    );
  }

  const tierName = formatPlanTierName(snapshot.tier);
  const features = PRICING_PLAN_FEATURES[snapshot.tier];

  return (
    <Card as='section' className='gap-[24px] shadow-none'>
      <CardHeader>
        <CardTitle as='h3' className='text-xl leading-[28px]'>
          Plan
        </CardTitle>
        <CardDescription>
          You're currently on the {tierName} plan.
        </CardDescription>
      </CardHeader>
      <CardContent className='@container'>
        <div className='space-y-[24px] rounded-[8px] border border-border bg-background p-[16px]'>
          <div className='flex flex-col gap-[16px] @min-[32rem]:flex-row @min-[32rem]:items-center @min-[32rem]:justify-between'>
            <div className='flex min-w-0 items-center gap-[12px]'>
              <span
                aria-hidden='true'
                className='flex size-[44px] shrink-0 items-center justify-center rounded-[8px] bg-action-soft text-foreground'
              >
                <Crown className='size-[22px]' />
              </span>
              <div className='min-w-0'>
                <p className='text-xl leading-[28px] font-semibold text-foreground'>
                  {tierName} Plan
                </p>
                <p className='text-sm leading-[22px] text-muted-foreground'>
                  {PLAN_BLURBS[snapshot.tier]}
                </p>
              </div>
            </div>
            <Button asChild variant='outline'>
              <Link href={ROUTES.PRICING}>
                View plans
                <ArrowRight aria-hidden='true' className='size-5' />
              </Link>
            </Button>
          </div>
          <ul className='grid gap-[12px] @min-[32rem]:grid-cols-2'>
            {features.map((feature) => (
              <li key={feature} className='flex min-w-0 items-start gap-[8px]'>
                <span
                  aria-hidden='true'
                  className='flex size-[20px] shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground'
                >
                  <Check className='size-[14px]' />
                </span>
                <span className='text-sm leading-[22px] text-muted-foreground'>
                  {feature}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
