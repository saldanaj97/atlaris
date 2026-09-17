import {
  marketingPrimaryCtaClassName,
  marketingSecondaryCtaClassName,
} from '@/app/(landing)/_shared/marketing-cta';
import { Button } from '@/components/ui/button';
import { PageHero } from '@/components/ui/page-hero';
import { SectionOverline } from '@/components/ui/section-overline';
import { ROUTES } from '@/features/navigation/routes';
import { cn } from '@/lib/utils';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import styles from './about.module.css';

const copy = {
  overline: 'About Atlaris',
  headlineLead: 'Made after hours.',
  headlineEmphasis: 'For the hours you actually have.',
  subline:
    'Atlaris is a learning atlas. Here is why the night sky, and what the AI does and does not do.',
} as const;

export function AboutHero() {
  return (
    <PageHero
      className={styles.hero}
      aria-labelledby='about-hero-heading'
      overlay='background'
      desktop={{ objectPosition: '78% 42%' }}
      mobile={{ className: 'opacity-70' }}
      backdropClassName={styles.heroBackdrop}
    >
      <div className={styles.heroContent}>
        <div className={styles.heroCopyBlock}>
          <SectionOverline className={styles.heroOverline}>
            {copy.overline}
          </SectionOverline>
          <h1
            id='about-hero-heading'
            className='mt-5 font-serif text-[2.75rem] leading-[1.08] font-semibold tracking-[-0.03em] text-balance text-foreground sm:text-5xl md:text-[3.25rem]'
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
            className={`mt-6 max-w-xl font-sans text-base leading-relaxed text-muted-foreground sm:text-lg ${styles.heroCopy}`}
          >
            {copy.subline}
          </p>
          <div className={styles.heroActions}>
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
              href='#about-builder'
              className={cn(
                marketingSecondaryCtaClassName,
                'h-auto px-8 py-4',
                styles.ctaMotion,
              )}
            >
              Our story
            </Link>
          </div>
        </div>
      </div>
    </PageHero>
  );
}
