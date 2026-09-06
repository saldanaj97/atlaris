import type { CSSProperties, ReactNode } from 'react';

import { marketingPrimaryCtaClassName } from '@/app/(marketing)/_shared/marketing-cta';
import { StarField } from '@/app/(marketing)/_shared/StarField';
import { APP_SHELL_HEADER_TUCK } from '@/components/layout/app-shell-width';
import { Button } from '@/components/ui/button';
import { CtaBanner } from '@/components/ui/cta-banner';
import { ResponsiveBackdrop } from '@/components/ui/responsive-backdrop';
import { SectionOverline } from '@/components/ui/section-overline';
import { ROUTES } from '@/features/navigation/routes';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import styles from './Pricing.module.css';

const copy = {
  overline: 'Chart your course',
  headline: 'One sky. Three ways to cross it.',
  subheadline: 'Start free tonight. Upgrade when the route runs longer.',
} as const;

/**
 * After Hours pricing page chrome — celestial backdrop + hero.
 */
export function PricingShell({ children }: { children: ReactNode }) {
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
        <CtaBanner
          aria-labelledby='pricing-cta-heading'
          artwork='horizon'
          className={styles.ctaBanner}
        >
          <div className={styles.ctaContent}>
            <SectionOverline className={styles.ctaOverline}>
              Your next chapter
            </SectionOverline>
            <h2 id='pricing-cta-heading' className={styles.ctaTitle}>
              A brighter future is a skill away.
            </h2>
            <p className={styles.ctaDescription}>
              Set a goal and let Atlaris chart the route with you.
            </p>
            <Button asChild className={marketingPrimaryCtaClassName}>
              <Link href={ROUTES.PLANS.NEW}>
                Begin tonight
                <ArrowRight aria-hidden='true' className='size-4' />
              </Link>
            </Button>
          </div>
        </CtaBanner>
      </div>
    </div>
  );
}

function CelestialBackdrop() {
  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden text-foreground ${APP_SHELL_HEADER_TUCK}`}
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
    <header className={styles.hero} aria-labelledby='pricing-hero-heading'>
      <ResponsiveBackdrop
        desktop={{
          src: '/artwork/planetary-horizon-desktop.jpg',
          objectPosition: '78% 42%',
          className: 'opacity-80',
        }}
        mobile={{
          src: '/artwork/planetary-horizon-mobile.jpg',
          objectPosition: '68% 42%',
          className: 'opacity-75',
        }}
        overlay='background'
      />
      <div className={styles.heroContent}>
        <SectionOverline className={styles.heroOverline}>
          {copy.overline}
        </SectionOverline>
        <h1
          id='pricing-hero-heading'
          aria-label={copy.headline}
          className='mt-5 font-serif text-[2.75rem] leading-[1.08] font-semibold tracking-[-0.03em] text-balance text-foreground sm:text-5xl md:text-[3.25rem]'
        >
          {words.map((word, index) => (
            <span key={`${word}-${index}`}>
              <span
                className={styles.heroWord}
                style={{ '--word-index': index } as CSSProperties}
              >
                {word}
              </span>
              {index < words.length - 1 ? ' ' : null}
            </span>
          ))}
        </h1>
        <p className={styles.heroSubline}>{copy.subheadline}</p>
      </div>
    </header>
  );
}
