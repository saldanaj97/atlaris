import type { ReactNode } from 'react';

import { PageHero } from '@/components/ui/page-hero';
import { Sparkles } from 'lucide-react';

/** Route-local introduction for the plan library. */
export function PlansHero({
  children,
  chrome,
}: {
  children?: ReactNode;
  chrome?: ReactNode;
}) {
  return (
    <PageHero
      artwork='mountain-overlook'
      dissolve
      className='mb-6'
      contentClassName='relative flex min-h-[22rem] flex-col px-0 pt-8 pb-5 sm:min-h-[26rem] sm:pt-10 sm:pb-6'
      overline='Your plans'
      overlineIcon={<Sparkles aria-hidden='true' className='size-4' />}
      title={
        <>
          Keep building your{' '}
          <span className='gradient-text'>brighter future.</span>
        </>
      }
      titleClassName='font-heading mt-3 max-w-xl text-[32px] leading-[1.1] tracking-[-0.03em] text-balance text-foreground sm:text-[42px]'
      description='Your learning plans turn big goals into real progress. Start a new plan, pick up where you left off, or find the next step in your library.'
      descriptionClassName='mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base'
      actions={
        children ? (
          <div className='mt-6 flex flex-wrap items-center gap-3'>
            {children}
          </div>
        ) : null
      }
    >
      <p
        aria-hidden='true'
        className='pointer-events-none absolute top-8 right-5 hidden text-[10px] font-semibold tracking-[0.22em] text-muted-foreground uppercase [writing-mode:vertical-rl] sm:top-10 lg:right-8 lg:block'
      >
        Discipline today. Opportunity tomorrow.
      </p>
      {chrome ? (
        <div className='relative z-10 mt-auto pt-10'>{chrome}</div>
      ) : null}
    </PageHero>
  );
}
