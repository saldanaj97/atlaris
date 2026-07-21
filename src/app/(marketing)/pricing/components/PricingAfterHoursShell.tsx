import type { ReactNode } from 'react';

import { StarField } from '@/app/(marketing)/_shared/StarField';

import styles from '@/app/(marketing)/pricing/components/PricingAfterHours.module.css';

const copy = {
  overline: 'Chart your course',
  headline: 'One sky. Three ways to cross it.',
  subheadline: 'Start free tonight. Upgrade when the route runs longer.',
} as const;

/**
 * After Hours pricing page chrome — celestial backdrop + hero.
 * Period tabs / Clerk card styles come from `_shared/AfterHoursClerkPricing`.
 */
export function PricingAfterHoursShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <CelestialBackdrop />
      <div className='relative z-10'>
        <Hero />
        <section
          className='mx-auto w-full max-w-[81rem] px-6 pt-2 pb-12 sm:pt-4'
          aria-label='Subscription plans'
        >
          {children}
        </section>
      </div>
    </div>
  );
}

function CelestialBackdrop() {
  return (
    <div
      className='pointer-events-none absolute inset-0 overflow-hidden text-foreground'
      aria-hidden='true'
    >
      {/* Warm dusk glow — up where the hero sits */}
      <div className='absolute -top-28 right-[8%] size-120 rounded-full bg-primary/15 blur-3xl md:size-152' />
      {/* Plum horizon wash — low left, under the cards */}
      <div className='absolute bottom-[-10%] -left-24 size-112 rounded-full bg-panel-muted/60 blur-3xl md:size-136' />
      <StarField />
    </div>
  );
}

function Hero() {
  const words = copy.headline.split(' ');

  return (
    <header
      className='mx-auto flex max-w-3xl flex-col items-center px-6 pt-10 pb-6 text-center sm:pt-12 sm:pb-8 md:px-8'
      aria-labelledby='pricing-hero-heading'
    >
      <p className={styles.heroOverline}>{copy.overline}</p>
      <h1
        id='pricing-hero-heading'
        className='mt-5 font-serif text-[2.75rem] leading-[1.08] font-semibold tracking-[-0.03em] text-balance text-foreground sm:text-5xl md:text-[3.25rem]'
      >
        {words.map((word, index) => (
          <span
            key={`${word}-${index}`}
            className={styles.heroWord}
            style={{ ['--word-index' as string]: index }}
          >
            {word}
            {index < words.length - 1 ? '\u00A0' : null}
          </span>
        ))}
      </h1>
      <p className={styles.heroSubline}>{copy.subheadline}</p>
    </header>
  );
}
