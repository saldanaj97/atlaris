import {
  marketingPrimaryCtaClassName,
  marketingSecondaryCtaClassName,
} from '@/app/(marketing)/_shared/marketing-cta';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

const landingEnterClassName =
  'animate-in fade-in slide-in-from-bottom-4 fill-mode-both duration-700 motion-reduce:animate-none';

const copy = {
  overline: 'The After-Hours Edition',
  headlineLead: 'Make space for',
  headlineEmphasis: 'the work that changes you.',
  subheadline: 'Plans, tasks, and analytics for the quiet hours.',
  primaryCta: 'Begin tonight',
  secondaryCta: 'See pricing',
} as const;

export function HeroSection() {
  return (
    <section
      className='mx-auto flex max-w-4xl flex-col items-center px-6 pt-16 pb-12 text-center sm:pt-20 sm:pb-14 md:px-8'
      aria-labelledby='landing-hero-heading'
    >
      <p
        className={cn(
          landingEnterClassName,
          'font-serif text-[0.6875rem] font-medium tracking-[0.22em] text-muted-foreground uppercase sm:text-xs',
        )}
      >
        {copy.overline}
      </p>

      <h1
        id='landing-hero-heading'
        className={cn(
          landingEnterClassName,
          'mt-6 font-serif text-[2.75rem] leading-[1.08] font-semibold tracking-[-0.03em] text-foreground text-balance delay-150 sm:text-5xl md:text-[3.25rem]',
        )}
      >
        <span className='block'>{copy.headlineLead}</span>
        <span className='mt-1 block font-medium text-primary italic'>
          {copy.headlineEmphasis}
        </span>
      </h1>

      <p
        className={cn(
          landingEnterClassName,
          'mt-6 max-w-xl font-sans text-base leading-relaxed text-muted-foreground delay-300 sm:text-lg',
        )}
      >
        {copy.subheadline}
      </p>

      <div
        className={cn(
          landingEnterClassName,
          'mt-9 flex w-full max-w-md flex-col justify-center gap-3 delay-500 sm:max-w-none sm:flex-row sm:items-center',
        )}
      >
        <Button asChild className={marketingPrimaryCtaClassName}>
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
          )}
        >
          {copy.secondaryCta}
        </Link>
      </div>
    </section>
  );
}
