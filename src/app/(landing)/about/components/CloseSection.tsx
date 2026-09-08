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

import styles from './about.module.css';

export function CloseSection() {
  return (
    <CtaBanner
      artwork='mountain'
      aria-labelledby='about-close-heading'
      className={styles.closeBanner}
    >
      <RevealAnimation>
        <div className={styles.closeContent}>
          <SectionOverline className={styles.revealItem}>
            Your next chapter
          </SectionOverline>
          <h2
            id='about-close-heading'
            className={`mt-4 font-serif text-3xl font-semibold tracking-[-0.025em] text-balance text-foreground sm:text-4xl ${styles.revealItem}`}
          >
            You already know the goal.
            <span className='block font-medium text-muted-foreground italic'>
              Set your star tonight.
            </span>
          </h2>
          <p
            className={`mt-6 max-w-xl font-sans text-base leading-relaxed text-muted-foreground sm:text-lg ${styles.revealItem}`}
            style={{ ['--i' as string]: 1 }}
          >
            One name, about two minutes, and tonight&apos;s first task is laid
            out.
          </p>
          <div
            className={`mt-9 flex w-full flex-col items-start gap-3 sm:flex-row sm:items-center ${styles.revealItem}`}
            style={{ ['--i' as string]: 2 }}
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
              className={cn(
                marketingSecondaryCtaClassName,
                'h-auto px-8 py-4',
                styles.ctaMotion,
              )}
            >
              See pricing
            </Link>
          </div>
        </div>
      </RevealAnimation>
    </CtaBanner>
  );
}
