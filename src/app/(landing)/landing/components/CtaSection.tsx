import type { CSSProperties } from 'react';

import { FREE_PLAN_COUNT, FREE_PLAN_LENGTH } from './free-plan-copy';
import { RevealAnimation } from './RevealAnimation';
import { marketingPrimaryCtaClassName } from '@/app/(landing)/_shared/marketing-cta';
import { Button } from '@/components/ui/button';
import { CtaBanner } from '@/components/ui/cta-banner';
import { CREATE_PLAN_LABEL } from '@/features/navigation';
import { ROUTES } from '@/features/navigation/routes';
import { cn } from '@/lib/utils';
import { TIER_LIMITS } from '@/shared/constants/tier-limits';
import Link from 'next/link';

import styles from './landing.module.css';

const FREE_PLANS = TIER_LIMITS.free.maxActivePlans;
const SUPPORT_EMAIL = 'support@atlaris.app';

const copy = {
  headline: `Start with ${FREE_PLANS === 1 ? 'one free plan' : `${FREE_PLANS} free plans`}`,
  subheadline: `Free plan: ${FREE_PLAN_COUNT}, up to ${FREE_PLAN_LENGTH}.`,
  support: 'A question, a bug, or a plan that missed the point:',
} as const;

export function CtaSection() {
  return (
    <section className='px-6 pb-16 md:px-8 md:pb-20'>
      <RevealAnimation>
        {/* oxlint-disable shadcn/require-static-classes -- imported CSS module and shared CTA classes are complete but opaque to the rule */}
        <CtaBanner
          aria-labelledby='landing-cta-heading'
          className={cn('mx-auto max-w-7xl', styles.revealItem)}
        >
          <div className='relative z-10 px-6 py-14 text-center sm:px-10 sm:py-16 md:py-20'>
            <h2
              id='landing-cta-heading'
              className={`type-display-section text-balance text-foreground ${styles.revealItem}`}
              style={{ '--i': 1 } as CSSProperties}
            >
              {copy.headline}
            </h2>

            <p
              className={`relative mx-auto mt-5 max-w-lg type-reading text-muted-foreground ${styles.revealItem}`}
              style={{ '--i': 2 } as CSSProperties}
            >
              {copy.subheadline}
            </p>

            <div
              className={`relative mt-9 flex flex-col items-center justify-center ${styles.revealItem}`}
              style={{ '--i': 3 } as CSSProperties}
            >
              <Button asChild className={marketingPrimaryCtaClassName}>
                <Link href={ROUTES.PLANS.NEW}>{CREATE_PLAN_LABEL}</Link>
              </Button>
            </div>

            <p
              className={`relative mx-auto mt-8 max-w-lg type-meta text-muted-foreground ${styles.revealItem}`}
              style={{ '--i': 4 } as CSSProperties}
            >
              {copy.support}{' '}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className='whitespace-nowrap text-link underline underline-offset-4 transition-colors hover:text-link-hover'
              >
                {SUPPORT_EMAIL}
              </a>
            </p>
          </div>
        </CtaBanner>
        {/* oxlint-enable shadcn/require-static-classes */}
      </RevealAnimation>
    </section>
  );
}
