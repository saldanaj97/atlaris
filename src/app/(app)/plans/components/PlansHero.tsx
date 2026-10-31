import type { ReactNode } from 'react';

import { PageHero } from '@/components/ui/page-hero';

/** Route-local introduction for the plan library. */
export function PlansHero({ chrome }: { chrome?: ReactNode }) {
  return (
    <PageHero
      artwork='mountain-overlook'
      dissolve
      className='mb-6'
      contentClassName='relative flex min-h-[14rem] flex-col px-0 pt-6 pb-4 sm:min-h-[16rem] sm:pt-8 sm:pb-5'
      title='Your plans'
      titleClassName='type-title-hero max-w-xl text-balance text-foreground'
      description='Your learning plans turn big goals into real progress. Start a new plan, pick up where you left off, or find the next step in your library.'
      descriptionClassName='mt-3 max-w-xl type-body text-muted-foreground sm:type-reading'
    >
      {chrome ? (
        <div className='relative z-10 mt-auto pt-6'>{chrome}</div>
      ) : null}
    </PageHero>
  );
}
