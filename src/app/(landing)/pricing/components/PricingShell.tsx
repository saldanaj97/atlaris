import type { ReactNode } from 'react';

import { CelestialBackdrop } from '@/app/(landing)/_shared/CelestialBackdrop';
import { marketingPrimaryCtaClassName } from '@/app/(landing)/_shared/marketing-cta';
import { Button } from '@/components/ui/button';
import { CtaBanner } from '@/components/ui/cta-banner';
import { PageHero } from '@/components/ui/page-hero';
import { CREATE_PLAN_LABEL } from '@/features/navigation';
import { ROUTES } from '@/features/navigation/routes';
import { TIER_LIMITS } from '@/shared/constants/tier-limits';
import Link from 'next/link';

import styles from './Pricing.module.css';

const FREE_WEEKS = TIER_LIMITS.free.maxWeeks;

const copy = {
  headline: 'Free for one plan. Pay when you need more',
  subheadline:
    'Start with one free plan. Upgrade for more plans, longer plans and more regenerations.',
  ctaHeadline: 'Your first plan is free',
  ctaDescription: `Pick a topic and Atlaris writes the plan. Free includes one plan of up to ${FREE_WEEKS} weeks.`,
} as const;

/**
 * Pricing page chrome — celestial backdrop, hero, live plan table, and CTA.
 */
export function PricingShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <CelestialBackdrop variant='dusk' />
      <div className='relative z-10'>
        <Hero />
        <section
          className='mx-auto w-full max-w-[81rem] px-6 pt-2 pb-12 sm:pt-4'
          aria-label='Subscription plans'
        >
          {children}
        </section>
        {/* oxlint-disable shadcn/require-static-classes -- imported CSS module and shared CTA classes are complete but opaque to the rule */}
        <CtaBanner
          aria-labelledby='pricing-cta-heading'
          artwork='horizon'
          className={styles.ctaBanner}
        >
          <div className={styles.ctaContent}>
            <div>
              <h2 id='pricing-cta-heading' className={styles.ctaTitle}>
                {copy.ctaHeadline}
              </h2>
              <p className={styles.ctaDescription}>{copy.ctaDescription}</p>
            </div>
            <Button asChild className={marketingPrimaryCtaClassName}>
              <Link href={ROUTES.PLANS.NEW}>{CREATE_PLAN_LABEL}</Link>
            </Button>
          </div>
        </CtaBanner>
        {/* oxlint-enable shadcn/require-static-classes */}
      </div>
    </div>
  );
}

function Hero() {
  return (
    /* oxlint-disable shadcn/require-static-classes -- imported CSS module class is complete but opaque to the rule */
    <PageHero
      className={styles.hero}
      aria-labelledby='pricing-hero-heading'
      overlay='background'
      desktop={{ objectPosition: '78% 42%' }}
      backdropClassName={styles.heroBackdrop}
    >
      <div className={styles.heroContent}>
        <h1
          id='pricing-hero-heading'
          className='type-display text-balance text-foreground'
        >
          {copy.headline}
        </h1>
        <p className={styles.heroSubline}>{copy.subheadline}</p>
      </div>
    </PageHero>
    /* oxlint-enable shadcn/require-static-classes */
  );
}
