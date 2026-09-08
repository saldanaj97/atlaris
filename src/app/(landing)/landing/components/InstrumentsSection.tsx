import { LandingPreview } from './DriftSection';
import { RevealAnimation } from './RevealAnimation';
import { marketingPrimaryCtaClassName } from '@/app/(landing)/_shared/marketing-cta';
import { Button } from '@/components/ui/button';
import { SectionOverline } from '@/components/ui/section-overline';
import { ROUTES } from '@/features/navigation/routes';
import { ArrowRight, Check } from 'lucide-react';
import Link from 'next/link';

import styles from './landing.module.css';

const PROGRESS_POINTS = [
  'Step-by-step guidance',
  'Real-world projects',
  'Track your progress',
] as const;

export function InstrumentsSection() {
  return (
    <section
      className='mx-auto max-w-7xl px-6 py-16 md:px-8 md:py-24'
      aria-labelledby='landing-instruments-heading'
    >
      <RevealAnimation>
        <div className='grid items-center gap-12 md:grid-cols-[minmax(0,1.16fr)_minmax(0,0.84fr)] md:gap-14 lg:gap-20'>
          <LandingPreview
            src='/previews/landing-roadmap-preview.svg'
            alt=''
            caption='Illustrative roadmap and lesson example showing ordered modules and a current learning task.'
            className={styles.revealFromLeft}
          />

          <div className={styles.revealFromRight}>
            <SectionOverline className='justify-start'>
              From learning to doing
            </SectionOverline>
            <h2
              id='landing-instruments-heading'
              className='mt-5 max-w-[14ch] font-serif text-3xl leading-[1.08] font-semibold tracking-[-0.035em] text-balance text-foreground sm:text-4xl'
            >
              Make progress{' '}
              <span className='text-primary italic'>with purpose.</span>
            </h2>
            <p className='mt-5 max-w-md font-sans text-base leading-relaxed text-muted-foreground'>
              Follow a clear learning path, complete hands-on projects, and
              build skills that actually move you forward.
            </p>
            <ul className='mt-6 space-y-3'>
              {PROGRESS_POINTS.map((point) => (
                <li
                  key={point}
                  className='inline-flex w-full items-center gap-2 font-sans text-sm text-foreground'
                >
                  <Check className='size-4 text-primary' aria-hidden='true' />
                  {point}
                </li>
              ))}
            </ul>
            <Button
              asChild
              className={`mt-8 ${marketingPrimaryCtaClassName} ${styles.ctaMotion}`}
            >
              <Link href={ROUTES.PLANS.NEW}>
                Explore learning paths
                <ArrowRight
                  className='size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none'
                  aria-hidden='true'
                />
              </Link>
            </Button>
          </div>
        </div>
      </RevealAnimation>
    </section>
  );
}
