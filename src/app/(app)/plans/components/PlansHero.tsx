import type { ReactNode } from 'react';

import { ResponsiveBackdrop } from '@/components/ui/responsive-backdrop';
import { SectionOverline } from '@/components/ui/section-overline';
import { Sparkles } from 'lucide-react';

/** Route-local introduction for the plan library. */
export function PlansHero({ children }: { children?: ReactNode }) {
  return (
    <header className='relative isolate mb-6 overflow-hidden rounded-[12px] border border-panel-border bg-panel shadow-sm'>
      <ResponsiveBackdrop
        desktop={{
          src: '/artwork/plan-library-mountain-overlook-desktop.jpg',
          objectPosition: '58% 50%',
        }}
        mobile={{
          src: '/artwork/plan-library-mountain-overlook-mobile.jpg',
          objectPosition: '58% 50%',
        }}
        overlay='background'
      />

      <div className='relative flex min-h-[19rem] flex-col justify-center px-5 py-8 sm:min-h-[22rem] sm:px-8 sm:py-10 lg:px-10'>
        <div className='max-w-2xl'>
          <SectionOverline
            icon={<Sparkles aria-hidden='true' className='size-4' />}
          >
            Your plans
          </SectionOverline>
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
