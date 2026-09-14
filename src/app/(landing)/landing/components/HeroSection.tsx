import type { CSSProperties } from 'react';

import {
  marketingPrimaryCtaClassName,
  marketingSecondaryCtaClassName,
} from '@/app/(landing)/_shared/marketing-cta';
import { Button } from '@/components/ui/button';
import { ResponsiveBackdrop } from '@/components/ui/responsive-backdrop';
import { SectionOverline } from '@/components/ui/section-overline';
import { ROUTES } from '@/features/navigation/routes';
import { cn } from '@/lib/utils';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import styles from './landing.module.css';

const copy = {
  headlineLead: 'Make space for',
  headlineEmphasis: 'the work that changes you.',
  subheadline:
    'Name a goal. Atlaris charts the plan and remembers where you left off.',
  primaryCta: 'Begin tonight',
  secondaryCta: 'See pricing',
} as const;

const ROUTE_STOPS = [
  { label: 'Explore', top: '16%', left: '68%' },
  { label: 'Learn', top: '35%', left: '81%' },
  { label: 'Practice', top: '56%', left: '68%' },
  { label: 'Achieve', top: '76%', left: '45%' },
] as const;

export function HeroSection() {
  return (
    <section
      className={`relative isolate overflow-hidden ${styles.hero}`}
      aria-labelledby='landing-hero-heading'
    >
      <ResponsiveBackdrop
        desktop={{
          src: '/artwork/landing-planet-desktop.jpg',
          objectPosition: '50% 50%',
        }}
        mobile={{
          src: '/artwork/landing-planet-mobile.jpg',
          objectPosition: '50% 50%',
        }}
        overlay='background'
        sizes='100vw'
      />

      <div className='relative z-10 mx-auto grid min-h-[35rem] max-w-7xl items-center gap-8 px-4 py-14 sm:min-h-[38rem] sm:px-6 sm:py-16 md:grid-cols-[minmax(0,0.96fr)_minmax(20rem,1.04fr)] md:px-8 md:py-20 lg:min-h-[40rem]'>
        <div className='max-w-xl text-left'>
          <SectionOverline className={styles.heroOverline}>
            Learn with direction
          </SectionOverline>
          <h1
            id='landing-hero-heading'
            className='mt-5 max-w-[13ch] font-serif text-[2.75rem] leading-[1.04] font-semibold tracking-[-0.04em] text-balance text-foreground sm:text-5xl md:text-[3.75rem] lg:text-[4rem]'
          >
            <span className={`block ${styles.heroLead}`}>
              {copy.headlineLead}
            </span>
            <span
              className={`mt-1 block font-medium text-primary italic ${styles.heroEmphasis}`}
            >
              {copy.headlineEmphasis}
            </span>
          </h1>

          <p
            className={`mt-6 max-w-[31rem] font-sans text-base leading-relaxed text-muted-foreground sm:text-lg ${styles.heroCopy}`}
          >
            {copy.subheadline}
          </p>

          <div
            className={`mt-9 flex flex-wrap items-center gap-3 ${styles.heroActions}`}
          >
            <Button
              asChild
              className={cn(marketingPrimaryCtaClassName, styles.ctaMotion)}
            >
              <Link href={ROUTES.PLANS.NEW}>
                {copy.primaryCta}
                <ArrowRight
                  className='size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none'
                  aria-hidden='true'
                />
              </Link>
            </Button>
            <Link
              href={ROUTES.PRICING}
              className={cn(
                marketingSecondaryCtaClassName,
                'h-auto px-8 py-4',
                styles.ctaMotion,
              )}
            >
              {copy.secondaryCta}
            </Link>
          </div>
        </div>

        <LearningRoute />
      </div>
    </section>
  );
}

function LearningRoute() {
  return (
    <div className={styles.heroRoute}>
      <svg
        viewBox='0 0 500 500'
        fill='none'
        preserveAspectRatio='none'
        className='absolute inset-0 size-full'
        aria-hidden='true'
      >
        <path
          className={styles.heroRoutePath}
          d='M 370 60 C 440 130, 420 205, 345 285 C 290 345, 230 395, 135 440'
          stroke='var(--primary)'
          strokeOpacity='0.7'
          strokeWidth='1.5'
          strokeDasharray='1'
          pathLength={1}
        />
        {ROUTE_STOPS.map((stop, index) => (
          <circle
            key={stop.label}
            className={styles.heroRouteNode}
            cx={[370, 420, 345, 135][index]}
            cy={[60, 165, 285, 440][index]}
            r={index === ROUTE_STOPS.length - 1 ? 7 : 5}
            fill={index === ROUTE_STOPS.length - 1 ? '#d8b66a' : '#9bc4ff'}
            stroke='var(--background)'
            strokeWidth='3'
          />
        ))}
      </svg>

      <ol aria-label='Learning route stages' className={styles.heroRouteLabels}>
        {ROUTE_STOPS.map((stop) => (
          <li
            key={stop.label}
            className={styles.heroRouteLabel}
            style={{ top: stop.top, left: stop.left } as CSSProperties}
          >
            {stop.label}
          </li>
        ))}
      </ol>
    </div>
  );
}
