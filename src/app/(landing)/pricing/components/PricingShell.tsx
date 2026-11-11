import type { ReactNode } from 'react';

import { CelestialBackdrop } from '@/app/(landing)/_shared/CelestialBackdrop';
import { marketingPrimaryCtaClassName } from '@/app/(landing)/_shared/marketing-cta';
import { Button } from '@/components/ui/button';
import { CtaBanner } from '@/components/ui/cta-banner';
import { PageHero } from '@/components/ui/page-hero';
import { cn } from '@/lib/utils';

import styles from './Pricing.module.css';

/** The plan cards' section; the closing CTA scrolls back up to it. */
const PLANS_SECTION_ID = 'pricing-plans';

const copy = {
  headlineLead: 'Pick your plan.',
  headlineTail: 'Cancel any time.',
  subheadline:
    'Starter and Pro both write full plans with lessons for every module. Pro adds unlimited active plans, longer plans and more regenerations.',
  ctaHeadline: 'Ready for your first plan?',
  ctaDescription:
    'Choose Starter or Pro above, then pick a topic and Atlaris writes the plan.',
  ctaAction: 'Choose a plan',
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
          id={PLANS_SECTION_ID}
          className='mx-auto box-content max-w-7xl scroll-mt-24 px-6 pt-2 pb-12 sm:pt-4 md:px-8'
          aria-label='Subscription plans'
        >
          {children}
        </section>
        {/* oxlint-disable shadcn/require-static-classes -- imported CSS module and shared CTA classes are complete but opaque to the rule */}
        <div className='px-6 md:px-8'>
          <CtaBanner
            aria-labelledby='pricing-cta-heading'
            className={cn('mx-auto max-w-7xl', styles.ctaBanner)}
          >
            <div className={styles.ctaContent}>
              <div>
                <h2 id='pricing-cta-heading' className={styles.ctaTitle}>
                  {copy.ctaHeadline}
                </h2>
                <p className={styles.ctaDescription}>{copy.ctaDescription}</p>
              </div>
              <Button asChild className={marketingPrimaryCtaClassName}>
                <a href={`#${PLANS_SECTION_ID}`}>{copy.ctaAction}</a>
              </Button>
            </div>
          </CtaBanner>
        </div>
        {/* oxlint-enable shadcn/require-static-classes */}
      </div>
    </div>
  );
}

function Hero() {
  return (
    /* oxlint-disable shadcn/require-static-classes -- imported CSS module class is complete but opaque to the rule */
    <PageHero className={styles.hero} aria-labelledby='pricing-hero-heading'>
      {/* The same column and gutters as the landing sections. */}
      <div
        className={cn(
          styles.heroContent,
          'mx-auto box-content max-w-7xl px-6 md:px-8',
        )}
      >
        <h1
          id='pricing-hero-heading'
          className='type-display text-balance text-foreground'
        >
          {copy.headlineLead}{' '}
          {/* Keeps the second sentence together instead of stranding "Pay". */}
          <span className='inline-block'>{copy.headlineTail}</span>
        </h1>
        <p className={styles.heroSubline}>{copy.subheadline}</p>
      </div>
    </PageHero>
    /* oxlint-enable shadcn/require-static-classes */
  );
}
