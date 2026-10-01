import type { ReactNode } from 'react';

import { PageHero } from '@/components/ui/page-hero';

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
      contentClassName='relative flex min-h-[14rem] flex-col px-0 pt-6 pb-4 sm:min-h-[16rem] sm:pt-8 sm:pb-5'
      title={
        <>
          Your <span className='gradient-text'>Plans</span>
        </>
      }
      titleClassName='font-heading max-w-xl text-(length:--at-fluid-title-lg,clamp(2rem,1.3rem+3vw,2.5rem)) leading-[1.15] tracking-[-0.03em] text-balance text-foreground'
      description='Your learning plans turn big goals into real progress. Start a new plan, pick up where you left off, or find the next step in your library.'
      descriptionClassName='mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base'
      actions={
        children ? (
          <div className='mt-5 flex flex-wrap items-center gap-3'>
            {children}
          </div>
        ) : null
      }
    >
      {chrome ? (
        <div className='relative z-10 mt-auto pt-6'>{chrome}</div>
      ) : null}
    </PageHero>
  );
}
