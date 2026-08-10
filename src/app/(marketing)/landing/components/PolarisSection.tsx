import { RevealAnimation } from './RevealAnimation';
import { marketingPrimaryCtaClassName } from '@/app/(marketing)/_shared/marketing-cta';
import { StarField } from '@/app/(marketing)/_shared/StarField';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ArrowRight, Sparkles } from 'lucide-react';
import Link from 'next/link';

import styles from './landing.module.css';

export function PolarisSection() {
  return (
    <section className='px-6 pb-20 md:px-8 md:pb-28'>
      <RevealAnimation>
        <div className='relative mx-auto max-w-5xl overflow-hidden rounded-4xl bg-foreground px-8 py-16 text-center text-background shadow-xl md:py-20'>
          <StarField />

          <div className='relative mx-auto flex justify-center'>
            <Sparkles
              className={cn('size-6 text-primary', styles.pulse)}
              aria-hidden='true'
            />
          </div>

          <h2 className='relative mt-6 font-serif text-3xl font-semibold tracking-[-0.025em] text-balance sm:text-4xl'>
            Polaris doesn&apos;t move.
            <span className='block font-medium italic opacity-80'>
              For one hour tonight, neither do you.
            </span>
          </h2>

          <p className='relative mx-auto mt-5 max-w-lg font-sans text-base leading-relaxed opacity-70'>
            Set the goal once. Let the quiet hours do the rest.
          </p>

          <div className='relative mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row'>
            <Button
              asChild
              className={cn(marketingPrimaryCtaClassName, styles.drift)}
            >
              <Link href='/plans/new'>
                Begin tonight
                <ArrowRight
                  className='size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none'
                  aria-hidden='true'
                />
              </Link>
            </Button>
            <Link
              href='/pricing'
              className='font-serif text-sm font-medium underline-offset-4 opacity-80 transition-opacity hover:underline hover:opacity-100'
            >
              See pricing first
            </Link>
          </div>
        </div>
      </RevealAnimation>
    </section>
  );
}
