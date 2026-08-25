import {
  marketingPrimaryCtaClassName,
  marketingSecondaryCtaClassName,
} from '@/app/(marketing)/_shared/marketing-cta';
import { Button } from '@/components/ui/button';
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

export function HeroSection() {
  return (
    <section
      className='mx-auto flex max-w-4xl flex-col items-center px-6 pt-16 pb-12 text-center sm:pt-20 sm:pb-14 md:px-8'
      aria-labelledby='landing-hero-heading'
    >
      <h1
        id='landing-hero-heading'
        className='font-serif text-[2.75rem] leading-[1.08] font-semibold tracking-[-0.03em] text-balance text-foreground sm:text-5xl md:text-[3.25rem]'
      >
        <span className={`block ${styles.heroLead}`}>{copy.headlineLead}</span>
        <span
          className={`mt-1 block font-medium text-primary italic ${styles.heroEmphasis}`}
        >
          {copy.headlineEmphasis}
        </span>
      </h1>

      <p
        className={`mt-6 max-w-xl font-sans text-base leading-relaxed text-muted-foreground sm:text-lg ${styles.heroCopy}`}
      >
        {copy.subheadline}
      </p>

      <div
        className={`mt-9 flex w-full max-w-md flex-col justify-center gap-3 sm:max-w-none sm:flex-row sm:items-center ${styles.heroActions}`}
      >
        <Button
          asChild
          className={cn(marketingPrimaryCtaClassName, styles.ctaMotion)}
        >
          <Link href='/plans/new'>
            {copy.primaryCta}
            <ArrowRight
              className='size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none'
              aria-hidden='true'
            />
          </Link>
        </Button>
        <Link
          href='/pricing'
          className={cn(
            marketingSecondaryCtaClassName,
            'h-auto px-8 py-4 text-base',
            styles.ctaMotion,
          )}
        >
          {copy.secondaryCta}
        </Link>
      </div>
    </section>
  );
}
