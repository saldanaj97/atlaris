import type { ReactNode } from 'react';

import { PageHero } from '@/components/ui/page-hero';
import { Sparkles } from 'lucide-react';

/** Route-local introduction for the plan library. */
export function PlansHero({ children }: { children?: ReactNode }) {
  return (
    <PageHero
      artwork='mountain-overlook'
      className='mb-6 rounded-[12px] border border-panel-border bg-panel shadow-sm'
      contentClassName='flex min-h-[19rem] max-w-2xl flex-col justify-center px-5 py-8 sm:min-h-[22rem] sm:px-8 sm:py-10 lg:px-10'
      overline='Your plans'
      overlineIcon={<Sparkles aria-hidden='true' className='size-4' />}
      title={
        <>
          Keep building your{' '}
          <span className='text-primary'>brighter future.</span>
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
    />
  );
}
