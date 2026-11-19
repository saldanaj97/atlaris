import type { SubscriptionTier } from '@/shared/types/billing.types';
import type { CSSProperties } from 'react';

import { RevealAnimation } from './RevealAnimation';
import { marketingSecondaryCtaClassName } from '@/app/(landing)/_shared/marketing-cta';
import {
  LESSONS_CARD_LINE,
  PRICING_PLAN_DESCRIPTIONS,
  PRICING_PLAN_FEATURES,
} from '@/app/(landing)/pricing/pricing-plan-features';
import { ROUTES } from '@/features/navigation/routes';
import { cn } from '@/lib/utils';
import Link from 'next/link';

import styles from './landing.module.css';

const TIERS: ReadonlyArray<{ tier: SubscriptionTier; name: string }> = [
  { tier: 'starter', name: 'Starter' },
  { tier: 'pro', name: 'Pro' },
];

/**
 * What each tier includes, from the same limits as the pricing page and
 * checkout. Prices stay on /pricing, where they come from Clerk Billing.
 * Every tier gets lessons, so that line stays on /pricing, where the compare
 * table lists it, and is left out here, where it wouldn't tell tiers apart.
 */
export function PricingSummarySection() {
  return (
    <section
      className='mx-auto box-content max-w-7xl px-6 pb-16 md:px-8 md:pb-24'
      aria-labelledby='landing-pricing-heading'
    >
      <RevealAnimation>
        {/* oxlint-disable shadcn/require-static-classes -- imported CSS module and shared CTA classes are complete but opaque to the rule */}
        <div className='border-t border-border pt-16 md:pt-24'>
          <div
            className={`grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:items-end md:gap-14 ${styles.revealItem}`}
          >
            <h2
              id='landing-pricing-heading'
              className='max-w-[18ch] type-display-section text-balance text-foreground'
            >
              Two plans, sized to your pace
            </h2>
            <p className='max-w-[60ch] type-reading text-muted-foreground'>
              Starter and Pro both include lessons for every module. Pro adds
              unlimited active plans, longer plans and more regenerations.
            </p>
          </div>

          <ul className='m-0 mt-12 grid list-none gap-8 p-0 md:grid-cols-2 md:gap-0'>
            {TIERS.map(({ tier, name }, index) => (
              <li
                key={tier}
                className={cn(
                  'min-w-0 border-t border-border pt-6 first:border-t-0 first:pt-0 md:border-t-0 md:pt-0 md:pr-6 md:not-first:border-l md:not-first:pl-6',
                  styles.revealItem,
                )}
                style={{ '--i': index + 1 } as CSSProperties}
              >
                <h3 className='type-card text-foreground'>{name}</h3>
                <p className='mt-1 type-body text-muted-foreground'>
                  {PRICING_PLAN_DESCRIPTIONS[tier]}
                </p>
                <ul className='m-0 mt-4 list-none space-y-2 p-0 type-body text-foreground'>
                  {PRICING_PLAN_FEATURES[tier]
                    .filter((feature) => feature !== LESSONS_CARD_LINE)
                    .map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                </ul>
              </li>
            ))}
          </ul>

          <Link
            href={ROUTES.PRICING}
            className={cn('mt-12', marketingSecondaryCtaClassName)}
          >
            Compare plans
          </Link>
        </div>
        {/* oxlint-enable shadcn/require-static-classes */}
      </RevealAnimation>
    </section>
  );
}
