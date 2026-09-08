import { RevealAnimation } from './RevealAnimation';
import {
  marketingPrimaryCtaClassName,
  marketingSecondaryCtaClassName,
} from '@/app/(landing)/_shared/marketing-cta';
import { Button } from '@/components/ui/button';
import { CtaBanner } from '@/components/ui/cta-banner';
import { SectionOverline } from '@/components/ui/section-overline';
import { ROUTES } from '@/features/navigation/routes';
import { cn } from '@/lib/utils';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import styles from './landing.module.css';

export function PolarisSection() {
  return (
    <section className='px-6 pb-20 md:px-8 md:pb-28'>
      <RevealAnimation>
        <CtaBanner
          aria-labelledby='landing-polaris-heading'
          artwork='horizon'
          className={styles.revealScale}
        >
          <div className='relative z-10 px-6 py-14 text-center sm:px-10 sm:py-16 md:py-20'>
            <SectionOverline className='justify-center text-primary'>
              Your next chapter
            </SectionOverline>

            <h2
              id='landing-polaris-heading'
              className={`mt-5 font-serif text-3xl leading-[1.08] font-semibold tracking-[-0.035em] text-balance text-foreground sm:text-4xl ${styles.revealItem}`}
              style={{ ['--i' as string]: 1 }}
            >
              Atlaris doesn&apos;t move.
              <span className='block font-medium text-muted-foreground italic'>
                For one hour tonight, neither do you.
              </span>
            </h2>

            <p
              className={`relative mx-auto mt-5 max-w-lg font-sans text-base leading-relaxed text-muted-foreground ${styles.revealItem}`}
              style={{ ['--i' as string]: 2 }}
            >
              Set the goal once. Let the quiet hours do the rest.
            </p>

            <div
              className={`relative mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row ${styles.revealItem}`}
              style={{ ['--i' as string]: 3 }}
            >
              <Button
                asChild
                className={cn(marketingPrimaryCtaClassName, styles.ctaMotion)}
              >
                <Link href={ROUTES.PLANS.NEW}>
                  Begin tonight
                  <ArrowRight
                    className='size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none'
                    aria-hidden='true'
                  />
                </Link>
              </Button>
              <Link
                href={ROUTES.PRICING}
                className={cn(marketingSecondaryCtaClassName, styles.ctaMotion)}
              >
                See pricing first
              </Link>
            </div>
          </div>
        </CtaBanner>
      </RevealAnimation>
    </section>
  );
}
