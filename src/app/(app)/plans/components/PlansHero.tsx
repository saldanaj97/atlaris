import type { ReactNode } from 'react';

import { Sparkles } from 'lucide-react';
import Image from 'next/image';

/** Route-local introduction for the plan library. */
export function PlansHero({ children }: { children?: ReactNode }) {
  return (
    <header className='relative isolate mb-6 overflow-hidden rounded-[12px] border border-panel-border bg-panel shadow-sm'>
      <picture className='pointer-events-none absolute inset-0 hidden size-full dark:block'>
        <source
          media='(max-width: 767px)'
          srcSet='/artwork/plan-library-mountain-overlook-mobile.jpg'
        />
        <Image
          src='/artwork/plan-library-mountain-overlook-desktop.jpg'
          alt=''
          fill
          sizes='100vw'
          className='size-full object-cover object-[58%_50%]'
        />
        <div
          aria-hidden='true'
          className='absolute inset-0 bg-linear-to-r from-background via-background/90 to-background/15'
        />
      </picture>

      <div className='relative flex min-h-[19rem] flex-col justify-center px-5 py-8 sm:min-h-[22rem] sm:px-8 sm:py-10 lg:px-10'>
        <div className='max-w-2xl'>
          <p className='flex items-center gap-2 text-[11px] font-medium tracking-[0.18em] text-primary uppercase'>
            <Sparkles aria-hidden='true' className='size-4' />
            Your plans
          </p>
          <h1 className='font-heading mt-3 max-w-xl text-[32px] leading-[1.1] tracking-[-0.03em] text-balance text-foreground sm:text-[42px]'>
            Keep building your{' '}
            <span className='text-primary'>brighter future.</span>
          </h1>
          <p className='mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base'>
            Your learning plans turn big goals into real progress. Start a new
            plan, pick up where you left off, or find the next step in your
            library.
          </p>
          {children ? (
            <div className='mt-6 flex flex-wrap items-center gap-3'>
              {children}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
