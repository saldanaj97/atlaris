import type { CSSProperties } from 'react';

import { RevealAnimation } from './RevealAnimation';
import { marketingPrimaryCtaClassName } from '@/app/(landing)/_shared/marketing-cta';
import { Button } from '@/components/ui/button';
import { CtaBanner } from '@/components/ui/cta-banner';
import { SectionOverline } from '@/components/ui/section-overline';
import { ROUTES } from '@/features/navigation/routes';
import { cn } from '@/lib/utils';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import styles from './landing.module.css';

const copy = {
  overline: 'Your next chapter',
  headline: 'A brighter future is a skill away',
  subheadline:
    'Start your learning journey today and get closer to the future you want.',
  primaryCta: 'Get started free',
} as const;

export function CtaSection() {
  return (
    <section className='px-4 pb-20 sm:px-6 md:px-8 md:pb-28'>
      <RevealAnimation>
        {/* oxlint-disable shadcn/require-static-classes -- imported CSS module and shared CTA classes are complete but opaque to the rule */}
        <CtaBanner
          aria-labelledby='landing-cta-heading'
          artwork='horizon'
          className={cn(styles.revealScale, 'border-0')}
        >
          <div className='relative z-10 px-6 py-14 text-center sm:px-10 sm:py-16 md:py-20'>
            <SectionOverline className='justify-center text-primary'>
              {copy.overline}
            </SectionOverline>

            <h2
              id='landing-cta-heading'
              className={`mt-5 font-serif text-3xl leading-[1.08] font-semibold tracking-[-0.035em] text-balance text-foreground sm:text-4xl ${styles.revealItem}`}
              style={{ '--i': 1 } as CSSProperties}
            >
              {copy.headline}
            </h2>

            <p
              className={`relative mx-auto mt-5 max-w-lg font-sans text-base leading-relaxed text-muted-foreground ${styles.revealItem}`}
              style={{ '--i': 2 } as CSSProperties}
            >
              {copy.subheadline}
            </p>

            <div
              className={`relative mt-9 flex flex-col items-center justify-center ${styles.revealItem}`}
              style={{ '--i': 3 } as CSSProperties}
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
            </div>
          </div>
        </CtaBanner>
        {/* oxlint-enable shadcn/require-static-classes */}
      </RevealAnimation>
    </section>
  );
}
